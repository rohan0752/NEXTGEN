import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { users, studentProfiles, facultyProfiles, courses, enrollments } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateToken, authenticateToken, logAudit } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Demo accounts endpoint for hackathon judges & testers
router.get("/demo-accounts", (req, res) => {
  res.json({
    accounts: [
      {
        role: "admin",
        roleLabel: "System Administrator",
        email: "admin@campusverify.edu",
        password: "Admin@123",
        name: "Dean Eleanor Vance (Admin)",
        description: "Full institutional control, classroom geofencing, audit logs, and account management.",
      },
      {
        role: "faculty",
        roleLabel: "Faculty Member",
        email: "dr.sarah.connor@campusverify.edu",
        password: "Faculty@123",
        name: "Dr. Sarah Connor (CS Faculty)",
        description: "Manages CS301 & CS304, launches live dynamic QR sessions, reviews flagged attempts.",
      },
      {
        role: "student",
        roleLabel: "Student (Enrolled in CS301)",
        email: "alex.rivers@campusverify.edu",
        password: "Student@123",
        name: "Alex Rivers (Student)",
        description: "Enrolled in CS301 & CS304. Full multi-layer verification flow with QR, Location & Face.",
      },
      {
        role: "student",
        roleLabel: "Student (Flagged Case Tester)",
        email: "maya.patel@campusverify.edu",
        password: "Student@123",
        name: "Maya Patel (Student)",
        description: "Has past flagged geofence attendance record and pending correction request.",
      },
    ],
  });
});

// Register new institutional user
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { fullName, email, password, role = "student" } = req.body || {};

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: "Full name is required." });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ error: "Institutional email is required." });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    if (role === "admin") {
      return res.status(403).json({ error: "Administrator accounts cannot be self-registered. Please contact IT Administration." });
    }

    const userRole = role === "faculty" ? "faculty" : "student";
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).get();
    if (existingUser) {
      return res.status(409).json({ error: "An account with this institutional email already exists. Please sign in." });
    }

    // Securely hash password with bcrypt (10 salt rounds)
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      passwordHash,
      role: userRole as any,
      fullName: fullName.trim(),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    let profile: any = null;

    if (userRole === "student") {
      const studentIdNumber = "STU-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      await db.insert(studentProfiles).values({
        userId,
        studentIdNumber,
        department: "Computer Science & Engineering",
        section: "A",
        academicYear: "2024-2025",
        biometricConsent: false,
        createdAt: now,
      });

      profile = {
        userId,
        studentIdNumber,
        department: "Computer Science & Engineering",
        section: "A",
        academicYear: "2024-2025",
        biometricConsent: false,
      };

      // Auto-enroll into available courses so new student can immediately participate in sessions
      const allCourses = await db.select().from(courses).all();
      for (const course of allCourses) {
        await db.insert(enrollments).values({
          id: uuidv4(),
          courseId: course.id,
          studentId: userId,
          enrolledAt: now,
          status: "enrolled",
        });
      }
    } else if (userRole === "faculty") {
      const employeeId = "FAC-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      await db.insert(facultyProfiles).values({
        userId,
        employeeId,
        department: "Computer Science & Engineering",
        officeLocation: "Turing Hall Room 301",
        createdAt: now,
      });

      profile = {
        userId,
        employeeId,
        department: "Computer Science & Engineering",
        officeLocation: "Turing Hall Room 301",
      };
    }

    const token = generateToken({
      id: userId,
      email: normalizedEmail,
      role: userRole as any,
      fullName: fullName.trim(),
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
    });

    await logAudit(
      { id: userId, email: normalizedEmail, role: userRole as any, fullName: fullName.trim() },
      "USER_REGISTER",
      "User",
      userId,
      `New user registered with role ${userRole}.`,
      req
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        role: userRole,
        fullName: fullName.trim(),
        profile,
      },
    });
  } catch (err: any) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register new account. " + err.message });
  }
});

// Login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email or Student ID and password are required." });
    }

    const inputIdentifier = email.trim();
    const normalizedEmail = inputIdentifier.toLowerCase();
    let user = await db.select().from(users).where(eq(users.email, normalizedEmail)).get();

    if (!user) {
      // Check if student ID number was entered
      const studentProf = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.studentIdNumber, inputIdentifier.toUpperCase()))
        .get();

      if (studentProf) {
        user = await db.select().from(users).where(eq(users.id, studentProf.userId)).get();
      }
    }

    if (!user) {
      // Check if faculty employee ID was entered
      const facultyProf = await db
        .select()
        .from(facultyProfiles)
        .where(eq(facultyProfiles.employeeId, inputIdentifier.toUpperCase()))
        .get();

      if (facultyProf) {
        user = await db.select().from(users).where(eq(users.id, facultyProf.userId)).get();
      }
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid email, Student ID, or password credentials." });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: "This account has been suspended by administration." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password credentials." });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role as any,
      fullName: user.fullName,
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000, // 12 hours
    });

    // Fetch profile
    let profile: any = null;
    if (user.role === "student") {
      profile = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id)).get();
    } else if (user.role === "faculty") {
      profile = await db.select().from(facultyProfiles).where(eq(facultyProfiles.userId, user.id)).get();
    }

    await logAudit(
      { id: user.id, email: user.email, role: user.role as any, fullName: user.fullName },
      "USER_LOGIN",
      "User",
      user.id,
      `User signed in with role ${user.role}.`,
      req
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        profile,
      },
    });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "An unexpected error occurred during sign-in." });
  }
});

// Current User Session
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await db.select().from(users).where(eq(users.id, req.user!.id)).get();
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    let profile: any = null;
    if (user.role === "student") {
      profile = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id)).get();
    } else if (user.role === "faculty") {
      profile = await db.select().from(facultyProfiles).where(eq(facultyProfiles.userId, user.id)).get();
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        profile,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch user session." });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true, message: "Signed out successfully." });
});

export default router;
