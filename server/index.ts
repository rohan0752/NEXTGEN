import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

import { initDb } from "./db/index.js";
import authRouter from "./routes/auth.js";
import coursesRouter from "./routes/courses.js";
import classroomsRouter from "./routes/classrooms.js";
import sessionsRouter from "./routes/sessions.js";
import attendanceRouter from "./routes/attendance.js";
import faceRouter from "./routes/face.js";
import adminRouter from "./routes/admin.js";
import reportsRouter from "./routes/reports.js";
import { apiLimiter } from "./middleware/rateLimiter.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Parsing Middlewares
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Upload directory for reference photos
const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// Serve models statically for browser client face-api
const modelsDir = path.resolve(process.cwd(), "public", "models");
if (fs.existsSync(modelsDir)) {
  app.use("/models", express.static(modelsDir));
}

// Global API rate limiter
app.use("/api", apiLimiter);

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/classrooms", classroomsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/face", faceRouter);
app.use("/api/admin", adminRouter);
app.use("/api/reports", reportsRouter);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "CampusVerify — Smart Multi-Layer Attendance System",
    timestamp: new Date().toISOString(),
  });
});

// Production: serve built static files from /dist
const distDir = path.resolve(process.cwd(), "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (
      req.method === "GET" &&
      !req.path.startsWith("/api") &&
      !req.path.startsWith("/uploads") &&
      !req.path.startsWith("/models")
    ) {
      return res.sendFile(path.join(distDir, "index.html"));
    }
    next();
  });
}

// 404 handler for unmatched API routes - Express 5 compatible, always returns valid JSON
app.use("/api", (req, res) => {
  res.status(404).json({
    error: `API route '${req.method} ${req.originalUrl || req.path}' not found on CampusVerify server.`,
  });
});

// Global error handling middleware - always returns valid JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Server Error:", err);
  const statusCode = Number(err.status || err.statusCode) || 500;
  res.status(statusCode).json({
    error: err.message || "Internal server error occurred.",
  });
});

// Start Server
async function startServer() {
  try {
    await initDb();
    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`=======================================================`);
      console.log(` CampusVerify Backend Server running on port ${PORT}`);
      console.log(` Health check: http://localhost:${PORT}/api/health`);
      console.log(` Demo accounts: http://localhost:${PORT}/api/auth/demo-accounts`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
}

startServer();
