import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import os from "os";
import { db } from "../db/index.js";
import {
  attendanceSessions,
  qrChallenges,
  courses,
  classrooms,
  attendanceRecords,
  enrollments,
  users,
  studentProfiles,
} from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateToken, requireRole, logAudit } from "../middleware/auth.js";

export function getLocalNetworkIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254")) {
        return net.address;
      }
    }
  }
  return "localhost";
}

export function buildQrUrl(
  origin: string | undefined,
  sessionId: string,
  challengeToken: string,
  sessionCode: string
): string {
  const lanIp = getLocalNetworkIp();
  let base = origin ? origin.trim().replace(/\/+$/, "") : "";
  if (!base || base.includes("localhost") || base.includes("127.0.0.1")) {
    const port = base.includes(":5000") ? "5000" : "5173";
    base = `http://${lanIp}:${port}`;
  }
  return `${base}/attendance/verify?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(challengeToken)}&code=${encodeURIComponent(sessionCode)}`;
}

const router = Router();

// Network info endpoint for faculty to inspect reachable IP addresses
router.get("/network-info", authenticateToken, (req, res) => {
  const lanIp = getLocalNetworkIp();
  const currentOrigin = req.headers.origin || `http://${req.headers.host || "localhost"}`;
  res.json({
    lanIp,
    currentOrigin,
    wifiUrl5173: `http://${lanIp}:5173`,
    wifiUrl5000: `http://${lanIp}:5000`,
    localhostUrl: "http://localhost:5173",
  });
});

// List active or recent sessions for current faculty or admin
router.get("/", authenticateToken, async (req, res) => {
  try {
    let query = db
      .select({
        id: attendanceSessions.id,
        sessionCode: attendanceSessions.sessionCode,
        title: attendanceSessions.title,
        startTime: attendanceSessions.startTime,
        endTime: attendanceSessions.endTime,
        status: attendanceSessions.status,
        durationMinutes: attendanceSessions.durationMinutes,
        qrRotationSeconds: attendanceSessions.qrRotationSeconds,
        requireLocation: attendanceSessions.requireLocation,
        requireFace: attendanceSessions.requireFace,
        courseId: courses.id,
        courseCode: courses.code,
        courseName: courses.name,
        classroomName: classrooms.name,
        classroomCode: classrooms.code,
        geofenceRadiusMeters: classrooms.geofenceRadiusMeters,
      })
      .from(attendanceSessions)
      .leftJoin(courses, eq(attendanceSessions.courseId, courses.id))
      .leftJoin(classrooms, eq(attendanceSessions.classroomId, classrooms.id))
      .orderBy(desc(attendanceSessions.startTime));

    if (req.user!.role === "faculty") {
      const results = await query.where(eq(attendanceSessions.facultyId, req.user!.id)).all();
      return res.json({ sessions: results });
    } else if (req.user!.role === "admin") {
      const results = await query.all();
      return res.json({ sessions: results });
    } else {
      // Student: return sessions for courses the student is enrolled in
      const studentEnrollments = await db
        .select({ courseId: enrollments.courseId })
        .from(enrollments)
        .where(eq(enrollments.studentId, req.user!.id))
        .all();

      const enrolledCourseIds = studentEnrollments.map((e) => e.courseId);
      if (enrolledCourseIds.length === 0) {
        return res.json({ sessions: [] });
      }

      const allSessions = await query.all();
      const filtered = allSessions.filter((s) => enrolledCourseIds.includes(s.courseId as string));
      return res.json({ sessions: filtered });
    }
  } catch (err: any) {
    console.error("Fetch sessions error:", err);
    res.status(500).json({ error: "Failed to fetch attendance sessions." });
  }
});

// Start new attendance session (Faculty only)
router.post("/", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const {
      courseId,
      classroomId,
      title = "Lecture Session",
      durationMinutes = 45,
      qrRotationSeconds = 20,
      requireLocation = true,
      requireFace = true,
      lateThresholdMinutes = 15,
    } = req.body;

    if (!courseId || !classroomId) {
      return res.status(400).json({ error: "Course and Classroom are required." });
    }

    // Verify course belongs to this faculty (unless admin)
    const course = await db.select().from(courses).where(eq(courses.id, courseId)).get();
    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    if (req.user!.role === "faculty" && course.facultyId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden: You are not authorized to start sessions for this course." });
    }

    // Verify classroom
    const classroom = await db.select().from(classrooms).where(eq(classrooms.id, classroomId)).get();
    if (!classroom) {
      return res.status(404).json({ error: "Classroom not found." });
    }

    const sessionId = uuidv4();
    const sessionCode = "CV-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const now = new Date();
    const startTime = now.toISOString();
    const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();

    await db.insert(attendanceSessions).values({
      id: sessionId,
      courseId,
      facultyId: req.user!.id,
      classroomId,
      sessionCode,
      title,
      startTime,
      endTime,
      status: "active",
      durationMinutes,
      qrRotationSeconds,
      requireLocation,
      requireFace,
      lateThresholdMinutes,
      createdAt: startTime,
    });

    // Generate initial QR challenge token
    const challengeToken = uuidv4();
    const expiresAt = new Date(now.getTime() + (qrRotationSeconds + 5) * 1000).toISOString();
    const requestedOrigin = (req.body.origin as string) || (req.headers.origin as string) || undefined;
    const qrData = buildQrUrl(requestedOrigin, sessionId, challengeToken, sessionCode);

    await db.insert(qrChallenges).values({
      id: uuidv4(),
      sessionId,
      challengeToken,
      qrData,
      issuedAt: startTime,
      expiresAt,
      isRevoked: false,
    });

    await logAudit(
      req.user!,
      "SESSION_START",
      "AttendanceSession",
      sessionId,
      `Started session ${sessionCode} for course ${course.code} in classroom ${classroom.name}.`,
      req
    );

    res.status(201).json({
      success: true,
      sessionId,
      sessionCode,
      message: "Attendance session started successfully.",
    });
  } catch (err: any) {
    console.error("Create session error:", err);
    res.status(500).json({ error: "Failed to start attendance session." });
  }
});

// Get session details and live status
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const session = await db
      .select({
        id: attendanceSessions.id,
        sessionCode: attendanceSessions.sessionCode,
        title: attendanceSessions.title,
        startTime: attendanceSessions.startTime,
        endTime: attendanceSessions.endTime,
        status: attendanceSessions.status,
        durationMinutes: attendanceSessions.durationMinutes,
        qrRotationSeconds: attendanceSessions.qrRotationSeconds,
        requireLocation: attendanceSessions.requireLocation,
        requireFace: attendanceSessions.requireFace,
        lateThresholdMinutes: attendanceSessions.lateThresholdMinutes,
        facultyId: attendanceSessions.facultyId,
        courseId: courses.id,
        courseCode: courses.code,
        courseName: courses.name,
        classroomId: classrooms.id,
        classroomName: classrooms.name,
        classroomCode: classrooms.code,
        classroomBuilding: classrooms.building,
        classroomFloor: classrooms.floor,
        latitude: classrooms.latitude,
        longitude: classrooms.longitude,
        geofenceRadiusMeters: classrooms.geofenceRadiusMeters,
      })
      .from(attendanceSessions)
      .leftJoin(courses, eq(attendanceSessions.courseId, courses.id))
      .leftJoin(classrooms, eq(attendanceSessions.classroomId, classrooms.id))
      .where(eq(attendanceSessions.id, req.params.id))
      .get();

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (req.user!.role === "faculty" && session.facultyId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden: You are not authorized to view this session." });
    }

    // Auto-update if expired
    if (session.status === "active" && new Date() > new Date(session.endTime)) {
      await db
        .update(attendanceSessions)
        .set({ status: "completed" })
        .where(eq(attendanceSessions.id, session.id))
        .run();
      session.status = "completed";
    }

    // Get attendance metrics
    const records = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, session.id))
      .all();

    const enrolledStudents = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.courseId, session.courseId as string))
      .all();

    const counts = {
      totalEnrolled: enrolledStudents.length,
      present: records.filter((r) => r.status === "present").length,
      late: records.filter((r) => r.status === "late").length,
      pendingReview: records.filter((r) => r.status === "pending_review").length,
      rejected: records.filter((r) => r.status === "rejected").length,
    };

    res.json({ session, counts, recordsCount: records.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load session details." });
  }
});

// Dynamic QR rotation generator endpoint
router.get("/:id/qr", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const session = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, req.params.id))
      .get();

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (req.user!.role === "faculty" && session.facultyId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden: You are not authorized to access QR challenges for this session." });
    }

    if (session.status !== "active") {
      return res.status(400).json({ error: `Session is ${session.status}. QR generation halted.` });
    }

    const now = new Date();
    if (now > new Date(session.endTime)) {
      await db
        .update(attendanceSessions)
        .set({ status: "completed" })
        .where(eq(attendanceSessions.id, session.id))
        .run();
      return res.status(400).json({ error: "Session has expired and ended." });
    }

    // Fetch the latest active challenge
    const latestChallenge = await db
      .select()
      .from(qrChallenges)
      .where(and(eq(qrChallenges.sessionId, session.id), eq(qrChallenges.isRevoked, false)))
      .orderBy(desc(qrChallenges.issuedAt))
      .get();

    const rotationMs = (session.qrRotationSeconds || 20) * 1000;

    const requestedOrigin = (req.query.origin as string) || (req.headers.origin as string) || undefined;

    // Check if latest challenge is still fresh (issued within rotation period and not expired)
    if (
      latestChallenge &&
      now.getTime() < new Date(latestChallenge.expiresAt).getTime() &&
      now.getTime() - new Date(latestChallenge.issuedAt).getTime() < rotationMs
    ) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((new Date(latestChallenge.expiresAt).getTime() - now.getTime()) / 1000)
      );

      const qrDataUrl = latestChallenge.qrData.startsWith("http")
        ? latestChallenge.qrData
        : buildQrUrl(requestedOrigin, session.id, latestChallenge.challengeToken, session.sessionCode);

      return res.json({
        sessionId: session.id,
        sessionCode: session.sessionCode,
        challengeToken: latestChallenge.challengeToken,
        qrData: qrDataUrl,
        qrUrl: qrDataUrl,
        remainingSeconds,
        rotationIntervalSeconds: session.qrRotationSeconds,
        lanIp: getLocalNetworkIp(),
      });
    }

    // Otherwise, generate fresh challenge token!
    const newToken = uuidv4();
    const expiryDate = new Date(now.getTime() + (session.qrRotationSeconds + 5) * 1000);
    const qrUrl = buildQrUrl(requestedOrigin, session.id, newToken, session.sessionCode);

    await db.insert(qrChallenges).values({
      id: uuidv4(),
      sessionId: session.id,
      challengeToken: newToken,
      qrData: qrUrl,
      issuedAt: now.toISOString(),
      expiresAt: expiryDate.toISOString(),
      isRevoked: false,
    });

    res.json({
      sessionId: session.id,
      sessionCode: session.sessionCode,
      challengeToken: newToken,
      qrData: qrUrl,
      qrUrl,
      remainingSeconds: session.qrRotationSeconds,
      rotationIntervalSeconds: session.qrRotationSeconds,
      lanIp: getLocalNetworkIp(),
    });
  } catch (err: any) {
    console.error("QR Challenge generation error:", err);
    res.status(500).json({ error: "Failed to generate dynamic QR token." });
  }
});

// Active QR challenge endpoint for student scanning / demo testing verification
router.get("/:id/active-challenge", authenticateToken, async (req, res) => {
  try {
    const session = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, req.params.id))
      .get();

    if (!session) {
      return res.status(404).json({ error: "Attendance session not found." });
    }

    if (session.status !== "active") {
      return res.status(400).json({ error: `Session is ${session.status}. Submissions are no longer accepted.` });
    }

    const now = new Date();
    if (now > new Date(session.endTime)) {
      await db
        .update(attendanceSessions)
        .set({ status: "completed" })
        .where(eq(attendanceSessions.id, session.id))
        .run();
      return res.status(400).json({ error: "Attendance session has expired and closed." });
    }

    // If caller is student, verify course enrollment
    if (req.user!.role === "student") {
      const enrollment = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, session.courseId),
            eq(enrollments.studentId, req.user!.id),
            eq(enrollments.status, "enrolled")
          )
        )
        .get();

      if (!enrollment) {
        return res.status(403).json({ error: "You are not enrolled in this course section." });
      }
    }

    // Look for active challenge
    const latestChallenge = await db
      .select()
      .from(qrChallenges)
      .where(and(eq(qrChallenges.sessionId, session.id), eq(qrChallenges.isRevoked, false)))
      .orderBy(desc(qrChallenges.issuedAt))
      .get();

    const rotationMs = (session.qrRotationSeconds || 20) * 1000;

    if (
      latestChallenge &&
      now.getTime() < new Date(latestChallenge.expiresAt).getTime() &&
      now.getTime() - new Date(latestChallenge.issuedAt).getTime() < rotationMs
    ) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((new Date(latestChallenge.expiresAt).getTime() - now.getTime()) / 1000)
      );

      return res.json({
        success: true,
        sessionId: session.id,
        sessionCode: session.sessionCode,
        challengeToken: latestChallenge.challengeToken,
        qrData: latestChallenge.qrData,
        remainingSeconds,
        rotationIntervalSeconds: session.qrRotationSeconds,
        expiresAt: latestChallenge.expiresAt,
      });
    }

    // Generate fresh challenge if previous expired
    const newToken = uuidv4();
    const expiryDate = new Date(now.getTime() + (session.qrRotationSeconds + 5) * 1000);
    const qrUrl = buildQrUrl(undefined, session.id, newToken, session.sessionCode);

    await db.insert(qrChallenges).values({
      id: uuidv4(),
      sessionId: session.id,
      challengeToken: newToken,
      qrData: qrUrl,
      issuedAt: now.toISOString(),
      expiresAt: expiryDate.toISOString(),
      isRevoked: false,
    });

    res.json({
      success: true,
      sessionId: session.id,
      sessionCode: session.sessionCode,
      challengeToken: newToken,
      qrData: qrUrl,
      remainingSeconds: session.qrRotationSeconds,
      rotationIntervalSeconds: session.qrRotationSeconds,
      expiresAt: expiryDate.toISOString(),
    });
  } catch (err: any) {
    console.error("Active challenge retrieval error:", err);
    res.status(500).json({ error: "Failed to retrieve active challenge." });
  }
});

// End attendance session (Faculty / Admin)
router.post("/:id/end", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const session = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, req.params.id))
      .get();

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (req.user!.role === "faculty" && session.facultyId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden: You are not authorized to end this session." });
    }

    await db
      .update(attendanceSessions)
      .set({ status: "completed" })
      .where(eq(attendanceSessions.id, session.id))
      .run();

    // Revoke pending challenges for this session
    await db
      .update(qrChallenges)
      .set({ isRevoked: true })
      .where(eq(qrChallenges.sessionId, session.id))
      .run();

    await logAudit(
      req.user!,
      "SESSION_END",
      "AttendanceSession",
      session.id,
      `Ended attendance session ${session.sessionCode}.`,
      req
    );

    res.json({ success: true, message: "Attendance session concluded successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to end attendance session." });
  }
});

// Live Session Roster & real-time attendance submissions
router.get("/:id/roster", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const session = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, req.params.id))
      .get();

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (req.user!.role === "faculty" && session.facultyId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden: You are not authorized to view the roster for this session." });
    }

    // Get all enrolled students in the course
    const enrolledStudents = await db
      .select({
        studentId: users.id,
        fullName: users.fullName,
        email: users.email,
        studentIdNumber: studentProfiles.studentIdNumber,
        department: studentProfiles.department,
        section: studentProfiles.section,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .leftJoin(studentProfiles, eq(users.id, studentProfiles.userId))
      .where(eq(enrollments.courseId, session.courseId))
      .all();

    // Get existing attendance records for this session
    const records = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, session.id))
      .all();

    const recordMap = new Map<string, typeof records[0]>();
    records.forEach((r) => recordMap.set(r.studentId, r));

    // Combine into full roster
    const roster = enrolledStudents.map((stu) => {
      const rec = recordMap.get(stu.studentId);
      return {
        studentId: stu.studentId,
        fullName: stu.fullName,
        email: stu.email,
        studentIdNumber: stu.studentIdNumber || "N/A",
        department: stu.department || "N/A",
        section: stu.section || "N/A",
        status: rec ? rec.status : session.status === "completed" ? "absent" : "not_marked",
        recordId: rec?.id || null,
        timestamp: rec?.timestamp || null,
        locationStatus: rec?.locationStatus || null,
        faceStatus: rec?.faceStatus || null,
        distanceMeters: rec?.distanceMeters ?? null,
        faceSimilarity: rec?.faceSimilarity ?? null,
        flaggedReasons: rec?.flaggedReasons ? JSON.parse(rec.flaggedReasons) : [],
        verificationNotes: rec?.verificationNotes || null,
      };
    });

    res.json({ roster });
  } catch (err: any) {
    console.error("Roster fetch error:", err);
    res.status(500).json({ error: "Failed to fetch session roster." });
  }
});

export default router;
