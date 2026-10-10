import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import {
  attendanceRecords,
  attendanceSessions,
  courses,
  users,
  studentProfiles,
  correctionRequests,
  verificationAttempts,
  enrollments,
} from "../db/schema.js";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { authenticateToken, requireRole, logAudit } from "../middleware/auth.js";
import { verificationLimiter } from "../middleware/rateLimiter.js";
import { processAttendanceAttempt } from "../services/decisionEngine.js";

const router = Router();

// Submit attendance attempt (Student only)
router.post("/submit", authenticateToken, requireRole(["student"]), verificationLimiter, async (req, res) => {
  try {
    const {
      sessionId,
      sessionCode,
      challengeToken,
      location,
      face,
      deviceFingerprint,
    } = req.body;

    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";

    const result = await processAttendanceAttempt({
      studentId: req.user!.id,
      sessionId,
      sessionCode,
      challengeToken,
      location,
      face,
      deviceFingerprint,
      ipAddress: String(ipAddress),
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error, record: result.record });
    }

    res.json(result);
  } catch (err: any) {
    console.error("Attendance submission error:", err);
    res.status(500).json({ error: "Failed to process attendance submission." });
  }
});

// Student attendance records history
router.get("/my-records", authenticateToken, requireRole(["student"]), async (req, res) => {
  try {
    const records = await db
      .select({
        id: attendanceRecords.id,
        sessionId: attendanceRecords.sessionId,
        timestamp: attendanceRecords.timestamp,
        status: attendanceRecords.status,
        locationStatus: attendanceRecords.locationStatus,
        faceStatus: attendanceRecords.faceStatus,
        distanceMeters: attendanceRecords.distanceMeters,
        faceSimilarity: attendanceRecords.faceSimilarity,
        verificationNotes: attendanceRecords.verificationNotes,
        flaggedReasons: attendanceRecords.flaggedReasons,
        correctionReason: attendanceRecords.correctionReason,
        correctedAt: attendanceRecords.correctedAt,
        sessionCode: attendanceSessions.sessionCode,
        sessionTitle: attendanceSessions.title,
        sessionDate: attendanceSessions.startTime,
        courseId: courses.id,
        courseCode: courses.code,
        courseName: courses.name,
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
      .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
      .where(eq(attendanceRecords.studentId, req.user!.id))
      .orderBy(desc(attendanceRecords.timestamp))
      .all();

    const formatted = records.map((r) => ({
      ...r,
      flaggedReasons: r.flaggedReasons ? JSON.parse(r.flaggedReasons) : [],
    }));

    res.json({ records: formatted });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch student attendance records." });
  }
});

// Student attendance summary and stats per course
router.get("/my-summary", authenticateToken, requireRole(["student"]), async (req, res) => {
  try {
    // 1. Get enrolled courses
    const studentEnrollments = await db
      .select({
        courseId: courses.id,
        courseCode: courses.code,
        courseName: courses.name,
        credits: courses.credits,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.studentId, req.user!.id))
      .all();

    const courseStats: any[] = [];
    let overallPresent = 0;
    let overallLate = 0;
    let overallPending = 0;
    let overallSessions = 0;

    for (const enrollment of studentEnrollments) {
      // Completed or active sessions for this course
      const sessions = await db
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.courseId, enrollment.courseId))
        .all();

      const sessionIds = sessions.map((s) => s.id);
      let records: typeof attendanceRecords.$inferSelect[] = [];
      if (sessionIds.length > 0) {
        records = await db
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.studentId, req.user!.id),
              inArray(attendanceRecords.sessionId, sessionIds)
            )
          )
          .all();
      }

      const presentCount = records.filter((r) => r.status === "present").length;
      const lateCount = records.filter((r) => r.status === "late").length;
      const pendingCount = records.filter((r) => r.status === "pending_review").length;
      const totalSessions = sessions.length;
      const absentCount = Math.max(0, totalSessions - records.length);

      // Percentage calculation: present count + 0.75 * late count
      const effectiveAttended = presentCount + lateCount * 0.75;
      const percentage = totalSessions > 0 ? Math.round((effectiveAttended / totalSessions) * 100) : 100;

      overallPresent += presentCount;
      overallLate += lateCount;
      overallPending += pendingCount;
      overallSessions += totalSessions;

      courseStats.push({
        courseId: enrollment.courseId,
        courseCode: enrollment.courseCode,
        courseName: enrollment.courseName,
        totalSessions,
        presentCount,
        lateCount,
        pendingCount,
        absentCount,
        percentage,
      });
    }

    const overallPercentage =
      overallSessions > 0
        ? Math.round(((overallPresent + overallLate * 0.75) / overallSessions) * 100)
        : 100;

    res.json({
      overall: {
        totalSessions: overallSessions,
        present: overallPresent,
        late: overallLate,
        pendingReview: overallPending,
        percentage: overallPercentage,
      },
      courses: courseStats,
    });
  } catch (err: any) {
    console.error("Student summary error:", err);
    res.status(500).json({ error: "Failed to generate attendance summary." });
  }
});

// Student files a correction request for a record
router.post("/correction-request", authenticateToken, requireRole(["student"]), async (req, res) => {
  try {
    const { attendanceRecordId, reason, proofNotes } = req.body;

    if (!attendanceRecordId || !reason) {
      return res.status(400).json({ error: "Attendance Record ID and reason are required." });
    }

    const record = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.id, attendanceRecordId),
          eq(attendanceRecords.studentId, req.user!.id)
        )
      )
      .get();

    if (!record) {
      return res.status(404).json({ error: "Attendance record not found or not owned by you." });
    }

    // Check existing pending request
    const existing = await db
      .select()
      .from(correctionRequests)
      .where(
        and(
          eq(correctionRequests.attendanceRecordId, attendanceRecordId),
          eq(correctionRequests.status, "pending")
        )
      )
      .get();

    if (existing) {
      return res.status(400).json({ error: "A correction request is already pending review for this record." });
    }

    const requestId = uuidv4();
    await db.insert(correctionRequests).values({
      id: requestId,
      attendanceRecordId,
      studentId: req.user!.id,
      sessionId: record.sessionId,
      requestedStatus: "present",
      reason: reason.trim(),
      proofNotes: proofNotes?.trim() || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    await logAudit(
      req.user!,
      "CORRECTION_REQUESTED",
      "CorrectionRequest",
      requestId,
      `Requested attendance correction for record ${attendanceRecordId}. Reason: ${reason}`,
      req
    );

    res.status(201).json({
      success: true,
      message: "Correction request submitted. Authorized faculty will review your explanation.",
      requestId,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to submit correction request." });
  }
});

// Faculty/Admin: Pending Review queue
router.get("/pending-reviews", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    let query = db
      .select({
        id: attendanceRecords.id,
        sessionId: attendanceRecords.sessionId,
        studentId: attendanceRecords.studentId,
        studentName: users.fullName,
        studentEmail: users.email,
        studentIdNumber: studentProfiles.studentIdNumber,
        sessionCode: attendanceSessions.sessionCode,
        sessionTitle: attendanceSessions.title,
        courseCode: courses.code,
        courseName: courses.name,
        timestamp: attendanceRecords.timestamp,
        status: attendanceRecords.status,
        locationStatus: attendanceRecords.locationStatus,
        faceStatus: attendanceRecords.faceStatus,
        distanceMeters: attendanceRecords.distanceMeters,
        faceSimilarity: attendanceRecords.faceSimilarity,
        verificationNotes: attendanceRecords.verificationNotes,
        flaggedReasons: attendanceRecords.flaggedReasons,
        deviceFingerprint: attendanceRecords.deviceFingerprint,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.studentId, users.id))
      .leftJoin(studentProfiles, eq(users.id, studentProfiles.userId))
      .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
      .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
      .where(eq(attendanceRecords.status, "pending_review"))
      .orderBy(desc(attendanceRecords.timestamp));

    if (req.user!.role === "faculty") {
      const records = await query.where(and(eq(attendanceRecords.status, "pending_review"), eq(courses.facultyId, req.user!.id))).all();
      return res.json({
        reviews: records.map((r) => ({
          ...r,
          flaggedReasons: r.flaggedReasons ? JSON.parse(r.flaggedReasons) : [],
        })),
      });
    }

    const records = await query.all();
    res.json({
      reviews: records.map((r) => ({
        ...r,
        flaggedReasons: r.flaggedReasons ? JSON.parse(r.flaggedReasons) : [],
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch pending reviews." });
  }
});

// Faculty/Admin: Review decision on flagged record
router.post("/reviews/:recordId/decision", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const { recordId } = req.params;
    const { decision, reason } = req.body; // decision: 'present' | 'late' | 'rejected'

    if (!["present", "late", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'present', 'late', or 'rejected'." });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: "A documented rationale/reason is required for auditing." });
    }

    const record = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).get();
    if (!record) {
      return res.status(404).json({ error: "Attendance record not found." });
    }

    const session = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, record.sessionId)).get();
    const course = session ? await db.select().from(courses).where(eq(courses.id, session.courseId)).get() : null;

    if (req.user!.role === "faculty" && course?.facultyId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden: You are not assigned to this course." });
    }

    const now = new Date().toISOString();
    await db
      .update(attendanceRecords)
      .set({
        status: decision,
        correctedBy: req.user!.id,
        correctionReason: reason.trim(),
        correctedAt: now,
      })
      .where(eq(attendanceRecords.id, recordId))
      .run();

    await logAudit(
      req.user!,
      "REVIEW_DECISION",
      "AttendanceRecord",
      String(recordId),
      `Updated record status to ${decision.toUpperCase()}. Reason: ${reason}`,
      req
    );

    res.json({ success: true, message: `Record marked as ${decision.toUpperCase()}.` });
  } catch (err: any) {
    console.error("Decision error:", err);
    res.status(500).json({ error: "Failed to submit review decision." });
  }
});

// Faculty/Admin: List student correction requests
router.get("/corrections", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const requests = await db
      .select({
        id: correctionRequests.id,
        recordId: correctionRequests.attendanceRecordId,
        studentId: correctionRequests.studentId,
        studentName: users.fullName,
        studentEmail: users.email,
        requestedStatus: correctionRequests.requestedStatus,
        reason: correctionRequests.reason,
        proofNotes: correctionRequests.proofNotes,
        status: correctionRequests.status,
        reviewerComment: correctionRequests.reviewerComment,
        reviewedAt: correctionRequests.reviewedAt,
        createdAt: correctionRequests.createdAt,
        sessionCode: attendanceSessions.sessionCode,
        sessionTitle: attendanceSessions.title,
        courseCode: courses.code,
        courseName: courses.name,
      })
      .from(correctionRequests)
      .innerJoin(users, eq(correctionRequests.studentId, users.id))
      .innerJoin(attendanceSessions, eq(correctionRequests.sessionId, attendanceSessions.id))
      .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
      .orderBy(desc(correctionRequests.createdAt))
      .all();

    res.json({ requests });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch correction requests." });
  }
});

// Faculty/Admin: Approve or Reject correction request
router.post("/corrections/:id/decision", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, comment } = req.body; // decision: 'approved' | 'rejected'

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'." });
    }

    const request = await db.select().from(correctionRequests).where(eq(correctionRequests.id, id)).get();
    if (!request) {
      return res.status(404).json({ error: "Correction request not found." });
    }

    const now = new Date().toISOString();

    await db
      .update(correctionRequests)
      .set({
        status: decision,
        reviewerId: req.user!.id,
        reviewerComment: comment || null,
        reviewedAt: now,
      })
      .where(eq(correctionRequests.id, id))
      .run();

    if (decision === "approved") {
      await db
        .update(attendanceRecords)
        .set({
          status: request.requestedStatus as any,
          correctedBy: req.user!.id,
          correctionReason: `Approved student correction request: ${request.reason}`,
          correctedAt: now,
        })
        .where(eq(attendanceRecords.id, request.attendanceRecordId))
        .run();
    }

    await logAudit(
      req.user!,
      "CORRECTION_DECISION",
      "CorrectionRequest",
      String(id),
      `Correction request ${decision.toUpperCase()}. Comment: ${comment || "None"}`,
      req
    );

    res.json({ success: true, message: `Correction request ${decision}.` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to process correction decision." });
  }
});

// Direct manual override by faculty or admin with strict authorization and audit trail
router.post("/manual-override", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const { recordId, newStatus, reason } = req.body;
    if (!recordId || !newStatus) {
      return res.status(400).json({ error: "Record ID and new status are required." });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "A specific justification reason is required for manual attendance review and audit logging." });
    }

    const validStatuses = ["present", "late", "pending_review", "rejected", "absent"];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    const record = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).get();
    if (!record) {
      return res.status(404).json({ error: "Attendance record not found." });
    }

    // Verify instructor authorization for this session
    const session = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, record.sessionId))
      .get();

    if (req.user!.role === "faculty") {
      if (!session || session.facultyId !== req.user!.id) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to review attendance records for another instructor's session." });
      }
    }

    const now = new Date().toISOString();
    await db
      .update(attendanceRecords)
      .set({
        status: newStatus,
        correctedBy: req.user!.id,
        correctionReason: reason.trim(),
        correctedAt: now,
      })
      .where(eq(attendanceRecords.id, recordId))
      .run();

    await logAudit(
      req.user!,
      "ATTENDANCE_OVERRIDE",
      "AttendanceRecord",
      recordId,
      `Overrode status from ${record.status} to ${newStatus}. Reason: ${reason.trim()}`,
      req
    );

    const updated = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).get();
    res.json({ success: true, record: updated });
  } catch (err: any) {
    console.error("Manual override error:", err);
    res.status(500).json({ error: "Failed to override attendance record." });
  }
});

export default router;

