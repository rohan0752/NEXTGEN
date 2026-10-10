import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { users, auditLogs } from "../db/schema.js";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "campusverify-hackathon-secure-session-key-2026";

export interface AuthUser {
  id: string;
  email: string;
  role: "student" | "faculty" | "admin";
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // 1. Prioritize explicit Bearer token in Authorization header
    if (req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer" && parts[1]) {
        token = parts[1].trim();
      }
    }

    // 2. Fall back to cookie if no valid Bearer header
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication required. Please sign in." });
    }

    let decoded: AuthUser;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    } catch (primaryErr) {
      // If header token was invalid/expired but a cookie exists (or vice versa), try fallback
      if (req.cookies?.token && token !== req.cookies.token) {
        try {
          decoded = jwt.verify(req.cookies.token, JWT_SECRET) as AuthUser;
        } catch {
          return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
        }
      } else {
        return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
      }
    }

    // Check user still exists and is active
    const userRecord = await db.select().from(users).where(eq(users.id, decoded.id)).get();
    if (!userRecord || userRecord.status !== "active") {
      return res.status(401).json({ error: "User account suspended or not found." });
    }

    req.user = {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role as "student" | "faculty" | "admin",
      fullName: userRecord.fullName,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }
}

export function requireRole(allowedRoles: Array<"student" | "faculty" | "admin">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden. You do not have permission to access this resource.",
      });
    }
    next();
  };
}

export async function logAudit(
  actor: AuthUser | null,
  action: string,
  targetResource: string,
  targetId: string | null,
  details: string,
  req?: Request
) {
  try {
    const ip = req?.ip || req?.socket.remoteAddress || "127.0.0.1";
    await db.insert(auditLogs).values({
      id: uuidv4(),
      actorId: actor?.id || null,
      actorRole: actor?.role || "system",
      actorName: actor?.fullName || "System Service",
      action,
      targetResource,
      targetId,
      details,
      ipAddress: String(ip),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
