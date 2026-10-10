import { Router } from "express";
import { db } from "../db/index.js";
import {
  attendanceRecords,
  attendanceSessions,
  courses,
  users,
  studentProfiles,
  classrooms,
} from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Summary Analytics for charts
router.get("/summary", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    let query = db
      .select({
        id: attendanceRecords.id,
        status: attendanceRecords.status,
        locationStatus: attendanceRecords.locationStatus,
        faceStatus: attendanceRecords.faceStatus,
        flaggedReasons: attendanceRecords.flaggedReasons,
        timestamp: attendanceRecords.timestamp,
        courseId: courses.id,
        courseCode: courses.code,
        courseName: courses.name,
        facultyId: courses.facultyId,
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
      .innerJoin(courses, eq(attendanceSessions.courseId, courses.id));

    let records: any[] = [];
    if (req.user!.role === "faculty") {
      records = await query.where(eq(courses.facultyId, req.user!.id)).all();
    } else {
      records = await query.all();
    }

    // 1. Status breakdown
    const statusCounts = {
      present: 0,
      late: 0,
      pending_review: 0,
      rejected: 0,
    };

    // 2. Reason code breakdown
    const failureReasons: Record<string, number> = {};

    // 3. Course breakdown
    const courseStats: Record<string, { code: string; name: string; present: number; total: number }> = {};

    records.forEach((r) => {
      if (statusCounts[r.status as keyof typeof statusCounts] !== undefined) {
        statusCounts[r.status as keyof typeof statusCounts]++;
      }

      if (r.flaggedReasons) {
        try {
          const flags: string[] = JSON.parse(r.flaggedReasons);
          flags.forEach((f) => {
            failureReasons[f] = (failureReasons[f] || 0) + 1;
          });
        } catch {}
      }

      if (!courseStats[r.courseId]) {
        courseStats[r.courseId] = {
          code: r.courseCode,
          name: r.courseName,
          present: 0,
          total: 0,
        };
      }
      courseStats[r.courseId].total++;
      if (r.status === "present" || r.status === "late") {
        courseStats[r.courseId].present++;
      }
    });

    const courseBreakdown = Object.values(courseStats).map((c) => ({
      course: c.code,
      name: c.name,
      presentRate: c.total > 0 ? Math.round((c.present / c.total) * 100) : 0,
      totalRecords: c.total,
    }));

    const reasonBreakdown = Object.entries(failureReasons).map(([reason, count]) => ({
      reason: reason.replace(/_/g, " "),
      count,
    }));

    res.json({
      statusCounts: [
        { name: "Verified Present", value: statusCounts.present, color: "#10b981" },
        { name: "Marked Late", value: statusCounts.late, color: "#f59e0b" },
        { name: "Pending Review", value: statusCounts.pending_review, color: "#6366f1" },
        { name: "Rejected", value: statusCounts.rejected, color: "#ef4444" },
      ],
      courseBreakdown,
      reasonBreakdown,
      totalEvaluations: records.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate analytics summary." });
  }
});

// CSV Attendance Export (RFC 4180 standard)
router.get("/export-csv", authenticateToken, requireRole(["faculty", "admin"]), async (req, res) => {
  try {
    const courseIdFilter = req.query.courseId as string;

    let query = db
      .select({
        recordId: attendanceRecords.id,
        timestamp: attendanceRecords.timestamp,
        status: attendanceRecords.status,
        locationStatus: attendanceRecords.locationStatus,
        faceStatus: attendanceRecords.faceStatus,
        distanceMeters: attendanceRecords.distanceMeters,
        accuracyMeters: attendanceRecords.accuracyMeters,
        faceSimilarity: attendanceRecords.faceSimilarity,
        verificationNotes: attendanceRecords.verificationNotes,
        flaggedReasons: attendanceRecords.flaggedReasons,
        studentName: users.fullName,
        studentEmail: users.email,
        studentIdNumber: studentProfiles.studentIdNumber,
        department: studentProfiles.department,
        section: studentProfiles.section,
        sessionCode: attendanceSessions.sessionCode,
        sessionTitle: attendanceSessions.title,
        courseCode: courses.code,
        courseName: courses.name,
        facultyId: courses.facultyId,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.studentId, users.id))
      .leftJoin(studentProfiles, eq(users.id, studentProfiles.userId))
      .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
      .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
      .orderBy(desc(attendanceRecords.timestamp));

    let rows: any[] = [];
    if (req.user!.role === "faculty") {
      rows = await query.where(eq(courses.facultyId, req.user!.id)).all();
    } else {
      rows = await query.all();
    }

    if (courseIdFilter) {
      rows = rows.filter((r) => r.courseId === courseIdFilter || r.courseCode === courseIdFilter);
    }

    // Escape CSV cell helper
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      "Timestamp (UTC)",
      "Course Code",
      "Course Name",
      "Session Code",
      "Session Title",
      "Student ID Number",
      "Student Name",
      "Student Email",
      "Department",
      "Section",
      "Final Status",
      "Location Status",
      "Distance (Meters)",
      "GPS Accuracy (Meters)",
      "Face Biometric Status",
      "Face Match Similarity (%)",
      "Flagged Reasons",
      "Verification Notes",
    ];

    const csvLines = [headers.join(",")];

    rows.forEach((r) => {
      let flags = "";
      if (r.flaggedReasons) {
        try {
          flags = JSON.parse(r.flaggedReasons).join("; ");
        } catch {}
      }

      const line = [
        escapeCsv(r.timestamp),
        escapeCsv(r.courseCode),
        escapeCsv(r.courseName),
        escapeCsv(r.sessionCode),
        escapeCsv(r.sessionTitle),
        escapeCsv(r.studentIdNumber || "N/A"),
        escapeCsv(r.studentName),
        escapeCsv(r.studentEmail),
        escapeCsv(r.department || "N/A"),
        escapeCsv(r.section || "N/A"),
        escapeCsv(r.status.toUpperCase()),
        escapeCsv(r.locationStatus),
        escapeCsv(r.distanceMeters ?? "N/A"),
        escapeCsv(r.accuracyMeters ?? "N/A"),
        escapeCsv(r.faceStatus),
        escapeCsv(r.faceSimilarity ? `${Math.round(r.faceSimilarity * 100)}%` : "N/A"),
        escapeCsv(flags || "None"),
        escapeCsv(r.verificationNotes || ""),
      ].join(",");

      csvLines.push(line);
    });

    const csvContent = csvLines.join("\r\n");
    const filename = `CampusVerify_Attendance_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err: any) {
    console.error("CSV Export error:", err);
    res.status(500).json({ error: "Failed to export CSV report." });
  }
});

export default router;
