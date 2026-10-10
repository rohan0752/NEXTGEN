import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import {
  users,
  studentProfiles,
  facultyProfiles,
  courses,
  attendanceSessions,
  attendanceRecords,
  auditLogs,
  systemSettings,
  classrooms,
} from "../db/schema.js";
import { eq, desc, sql, and, like } from "drizzle-orm";
import { authenticateToken, requireRole, logAudit } from "../middleware/auth.js";

const router = Router();

// Only system administrators can access these endpoints
router.use(authenticateToken, requireRole(["admin"]));

// Dashboard System Stats
router.get("/stats", async (req, res) => {
  try {
    const allUsers = await db.select().from(users).all();
    const studentsCount = allUsers.filter((u) => u.role === "student").length;
    const facultyCount = allUsers.filter((u) => u.role === "faculty").length;

    const allCourses = await db.select().from(courses).all();
    const allSessions = await db.select().from(attendanceSessions).all();
    const activeSessionsCount = allSessions.filter((s) => s.status === "active").length;

    const allRecords = await db.select().from(attendanceRecords).all();
    const presentCount = allRecords.filter((r) => r.status === "present").length;
    const lateCount = allRecords.filter((r) => r.status === "late").length;
    const pendingCount = allRecords.filter((r) => r.status === "pending_review").length;
    const rejectedCount = allRecords.filter((r) => r.status === "rejected").length;

    const recentLogs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(10)
      .all();

    res.json({
      metrics: {
        totalStudents: studentsCount,
        totalFaculty: facultyCount,
        totalCourses: allCourses.length,
        activeSessions: activeSessionsCount,
        totalRecords: allRecords.length,
        present: presentCount,
        late: lateCount,
        pendingReview: pendingCount,
        rejected: rejectedCount,
      },
      recentLogs,
    });
  } catch (err: any) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to load admin stats." });
  }
});

// List users with search and role filter
router.get("/users", async (req, res) => {
  try {
    const roleFilter = req.query.role as string;
    const search = req.query.search ? String(req.query.search).toLowerCase() : "";

    const userList = await db.select().from(users).orderBy(desc(users.createdAt)).all();

    const studentList = await db.select().from(studentProfiles).all();
    const facultyList = await db.select().from(facultyProfiles).all();

    const studentMap = new Map(studentList.map((s) => [s.userId, s]));
    const facultyMap = new Map(facultyList.map((f) => [f.userId, f]));

    let results = userList.map((u) => {
      let profile: any = null;
      if (u.role === "student") profile = studentMap.get(u.id);
      if (u.role === "faculty") profile = facultyMap.get(u.id);

      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        profile,
      };
    });

    if (roleFilter && ["student", "faculty", "admin"].includes(roleFilter)) {
      results = results.filter((u) => u.role === roleFilter);
    }

    if (search) {
      results = results.filter(
        (u) =>
          u.fullName.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          (u.profile?.studentIdNumber && u.profile.studentIdNumber.toLowerCase().includes(search)) ||
          (u.profile?.employeeId && u.profile.employeeId.toLowerCase().includes(search))
      );
    }

    res.json({ users: results });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// Create new user (Student or Faculty)
router.post("/users", async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      fullName,
      studentIdNumber,
      employeeId,
      department = "General Sciences",
      section = "Sec-A",
      academicYear = "1st Year",
    } = req.body;

    if (!email || !password || !role || !fullName) {
      return res.status(400).json({ error: "Email, password, role, and full name are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).get();
    if (existing) {
      return res.status(400).json({ error: "A user with this email address already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      passwordHash,
      role: role as any,
      fullName: fullName.trim(),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    if (role === "student") {
      await db.insert(studentProfiles).values({
        userId,
        studentIdNumber: (studentIdNumber || "STU-" + Math.floor(100000 + Math.random() * 900000)).trim(),
        department,
        section,
        academicYear,
        biometricConsent: false,
        biometricConsentDate: null,
        referenceFacePath: null,
        faceEmbedding: null,
        createdAt: now,
      });
    } else if (role === "faculty") {
      await db.insert(facultyProfiles).values({
        userId,
        employeeId: (employeeId || "FAC-" + Math.floor(10000 + Math.random() * 90000)).trim(),
        department,
        officeLocation: "Academic Wing Room 201",
        phone: null,
        createdAt: now,
      });
    }

    await logAudit(
      req.user!,
      "USER_CREATE",
      "User",
      userId,
      `Created new ${role} user: ${fullName} (${normalizedEmail}).`,
      req
    );

    res.status(201).json({ success: true, userId, message: "User account created successfully." });
  } catch (err: any) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Failed to create user account." });
  }
});

// Update user account status (suspend / reactivate)
router.put("/users/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'active' or 'suspended'." });
    }

    const user = await db.select().from(users).where(eq(users.id, req.params.id)).get();
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.id === req.user!.id) {
      return res.status(400).json({ error: "You cannot suspend your own administrative account." });
    }

    await db
      .update(users)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(users.id, req.params.id))
      .run();

    await logAudit(
      req.user!,
      "USER_STATUS_CHANGE",
      "User",
      user.id,
      `Changed user ${user.fullName} (${user.email}) status to ${status}.`,
      req
    );

    res.json({ success: true, message: `User status changed to ${status}.` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update user status." });
  }
});

// Audit Logs list with pagination
router.get("/audit-logs", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .all();

    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch audit logs." });
  }
});

// System Settings
router.get("/settings", async (req, res) => {
  try {
    const settingsList = await db.select().from(systemSettings).all();
    const settingsObj: Record<string, string> = {};
    settingsList.forEach((s) => {
      settingsObj[s.key] = s.value;
    });

    res.json({ settings: settingsObj });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

// Update System Setting
router.put("/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: "Setting key and value are required." });
    }

    const now = new Date().toISOString();
    await db
      .insert(systemSettings)
      .values({ key, value: String(value), updatedAt: now })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(value), updatedAt: now },
      })
      .run();

    await logAudit(
      req.user!,
      "SETTING_UPDATE",
      "SystemSetting",
      key,
      `Updated institutional setting '${key}' to '${value}'.`,
      req
    );

    res.json({ success: true, message: "Setting updated successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update setting." });
  }
});

export default router;
