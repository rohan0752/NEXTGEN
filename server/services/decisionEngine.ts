import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import {
  users,
  studentProfiles,
  courses,
  classrooms,
  enrollments,
  attendanceSessions,
  qrChallenges,
  attendanceRecords,
  verificationAttempts,
} from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { evaluateGeofence } from "./geoService.js";
import { verifyFaceDescriptors } from "./faceService.js";

export interface AttendanceSubmissionPayload {
  studentId: string;
  sessionId?: string;
  sessionCode?: string;
  challengeToken?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    error?: string;
  };
  face?: {
    descriptor?: number[];
    error?: string;
  };
  deviceFingerprint?: string;
  ipAddress?: string;
}

export interface AttendanceDecisionResult {
  success: boolean;
  error?: string;
  record?: any;
  status?: "present" | "late" | "pending_review" | "rejected";
  summary?: {
    qrValid: boolean;
    locationStatus: string;
    distanceMeters: number | null;
    faceStatus: string;
    faceSimilarity: number | null;
    flaggedReasons: string[];
    isLate: boolean;
  };
}

export async function processAttendanceAttempt(
  payload: AttendanceSubmissionPayload
): Promise<AttendanceDecisionResult> {
  const {
    studentId,
    sessionId: inputSessionId,
    sessionCode: inputSessionCode,
    challengeToken,
    location,
    face,
    deviceFingerprint,
    ipAddress = "127.0.0.1",
  } = payload;

  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Validate Student
  const student = await db.select().from(users).where(eq(users.id, studentId)).get();
  if (!student || student.role !== "student" || student.status !== "active") {
    return { success: false, error: "Invalid or inactive student account." };
  }

  const profile = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, studentId))
    .get();

  // 2. Find and Validate Attendance Session
  let session: typeof attendanceSessions.$inferSelect | undefined;
  if (inputSessionId) {
    session = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, inputSessionId))
      .get();
  } else if (inputSessionCode) {
    session = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.sessionCode, inputSessionCode.trim().toUpperCase()))
      .get();
  }

  if (!session) {
    return { success: false, error: "Attendance session not found. Please verify the code or QR." };
  }

  if (session.status !== "active") {
    return {
      success: false,
      error: `Attendance session is ${session.status}. Submissions are no longer accepted.`,
    };
  }

  if (now > new Date(session.endTime)) {
    // Session time expired
    await db
      .update(attendanceSessions)
      .set({ status: "completed" })
      .where(eq(attendanceSessions.id, session.id))
      .run();

    return {
      success: false,
      error: "This attendance session window has expired and closed.",
    };
  }

  // 3. Verify Course Enrollment
  const enrollment = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, session.courseId),
        eq(enrollments.studentId, studentId),
        eq(enrollments.status, "enrolled")
      )
    )
    .get();

  if (!enrollment) {
    await db.insert(verificationAttempts).values({
      id: uuidv4(),
      sessionId: session.id,
      studentId,
      step: "enrollment",
      result: "failed",
      reasonCode: "NOT_ENROLLED",
      details: "Student attempted attendance for an unauthorized or unenrolled course.",
      ipAddress,
      createdAt: nowIso,
    });
    return {
      success: false,
      error: "You are not enrolled in this course section. Attendance cannot be recorded.",
    };
  }

  // 4. Duplicate Check - atomic verification
  const existingRecord = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.sessionId, session.id),
        eq(attendanceRecords.studentId, studentId)
      )
    )
    .get();

  if (existingRecord) {
    return {
      success: false,
      error: `You have already submitted attendance for this session. Recorded status: ${existingRecord.status.toUpperCase()}.`,
      record: existingRecord,
    };
  }

  // 5. QR Challenge Validation
  let qrValid = false;
  if (challengeToken) {
    const challenge = await db
      .select()
      .from(qrChallenges)
      .where(
        and(
          eq(qrChallenges.challengeToken, challengeToken),
          eq(qrChallenges.sessionId, session.id),
          eq(qrChallenges.isRevoked, false)
        )
      )
      .get();

    if (!challenge) {
      await db.insert(verificationAttempts).values({
        id: uuidv4(),
        sessionId: session.id,
        studentId,
        step: "qr",
        result: "failed",
        reasonCode: "INVALID_CHALLENGE",
        details: "QR challenge token does not match active session or was forged.",
        ipAddress,
        createdAt: nowIso,
      });
      return {
        success: false,
        error: "Invalid or forged QR attendance token. Please scan the current code.",
      };
    }

    if (now > new Date(challenge.expiresAt)) {
      await db.insert(verificationAttempts).values({
        id: uuidv4(),
        sessionId: session.id,
        studentId,
        step: "qr",
        result: "failed",
        reasonCode: "EXPIRED_CHALLENGE",
        details: "QR challenge token was presented after expiration window.",
        ipAddress,
        createdAt: nowIso,
      });
      return {
        success: false,
        error: "QR token has expired. The QR code rotates periodically. Please scan the latest code.",
      };
    }

    qrValid = true;
  } else {
    await db.insert(verificationAttempts).values({
      id: uuidv4(),
      sessionId: session.id,
      studentId,
      step: "qr",
      result: "failed",
      reasonCode: "MISSING_CHALLENGE",
      details: "Attempted to submit attendance without scanning the live projected QR token.",
      ipAddress,
      createdAt: nowIso,
    });
    return {
      success: false,
      error: "Missing QR challenge token. You must scan the live dynamic QR code projected on the classroom screen.",
    };
  }

  // Record QR verification attempt
  await db.insert(verificationAttempts).values({
    id: uuidv4(),
    sessionId: session.id,
    studentId,
    step: "qr",
    result: "passed",
    reasonCode: challengeToken ? "QR_VERIFIED" : "MANUAL_CODE_ENTERED",
    details: challengeToken ? "Dynamic QR token validated successfully." : "Session code entered manually.",
    ipAddress,
    createdAt: nowIso,
  });

  const flaggedReasons: string[] = [];
  const verificationNotesList: string[] = [];

  // 6. Location & Geofence Verification
  let locationStatus: "verified" | "out_of_bounds" | "permission_denied" | "skipped" | "manual_review" = "skipped";
  let distanceMeters: number | null = null;
  let accuracyMeters: number | null = null;

  if (session.requireLocation) {
    const classroom = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, session.classroomId))
      .get();

    if (classroom) {
      if (location?.error || location?.latitude == null || location?.longitude == null) {
        locationStatus = "permission_denied";
        flaggedReasons.push("LOCATION_PERMISSION_DENIED");
        verificationNotesList.push("Browser location permission was denied or unavailable.");
      } else {
        const geoResult = evaluateGeofence(
          location.latitude,
          location.longitude,
          location.accuracy,
          classroom.latitude,
          classroom.longitude,
          classroom.geofenceRadiusMeters
        );

        distanceMeters = geoResult.distanceMeters;
        accuracyMeters = geoResult.accuracyMeters;

        if (geoResult.passed) {
          locationStatus = "verified";
          verificationNotesList.push(geoResult.reason);
        } else {
          locationStatus = "out_of_bounds";
          flaggedReasons.push(geoResult.status === "poor_accuracy" ? "POOR_GPS_ACCURACY" : "GEOFENCE_EXCEEDED");
          verificationNotesList.push(geoResult.reason);
        }
      }

      await db.insert(verificationAttempts).values({
        id: uuidv4(),
        sessionId: session.id,
        studentId,
        step: "location",
        result: locationStatus === "verified" ? "passed" : "flagged",
        reasonCode: locationStatus.toUpperCase(),
        details: verificationNotesList[verificationNotesList.length - 1] || "Location check executed",
        ipAddress,
        createdAt: nowIso,
      });
    }
  }

  // 7. Face Biometric Verification
  let faceStatus: "verified" | "mismatch" | "unconfigured" | "skipped" | "manual_review" = "skipped";
  let faceSimilarity: number | null = null;

  if (session.requireFace) {
    if (!profile?.biometricConsent) {
      faceStatus = "manual_review";
      flaggedReasons.push("BIOMETRIC_CONSENT_MISSING");
      verificationNotesList.push("Student has not granted biometric consent. Manual review requested.");
    } else if (!profile.faceEmbedding) {
      // Truthful handling: Model/reference photo not yet enrolled
      faceStatus = "unconfigured";
      flaggedReasons.push("FACE_UNCONFIGURED_MANUAL_REVIEW");
      verificationNotesList.push("Student reference face is not enrolled in database. Attempt routed to faculty manual review queue.");
    } else {
      let referenceDescriptor: number[] | null = null;
      try {
        referenceDescriptor = JSON.parse(profile.faceEmbedding);
      } catch {
        referenceDescriptor = null;
      }

      const faceResult = verifyFaceDescriptors(
        referenceDescriptor,
        face?.descriptor || null
      );

      faceStatus = faceResult.status;
      faceSimilarity = faceResult.similarity;
      verificationNotesList.push(faceResult.reason);

      if (!faceResult.passed) {
        flaggedReasons.push(
          faceResult.status === "mismatch" ? "FACE_MISMATCH" : "FACE_MANUAL_REVIEW"
        );
      }
    }

    await db.insert(verificationAttempts).values({
      id: uuidv4(),
      sessionId: session.id,
      studentId,
      step: "face",
      result: faceStatus === "verified" ? "passed" : "flagged",
      reasonCode: faceStatus.toUpperCase(),
      details: verificationNotesList[verificationNotesList.length - 1] || "Face check executed",
      ipAddress,
      createdAt: nowIso,
    });
  }

  // 8. Shared Device / Fingerprint Risk Indicator
  if (deviceFingerprint) {
    const priorAttemptsOnSameDevice = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sessionId, session.id),
          eq(attendanceRecords.deviceFingerprint, deviceFingerprint)
        )
      )
      .all();

    if (priorAttemptsOnSameDevice.length > 0) {
      flaggedReasons.push("SHARED_DEVICE_DETECTED");
      verificationNotesList.push(
        `Device fingerprint was also recorded for another student during this session (${priorAttemptsOnSameDevice.length} prior attendance). Flagged for review.`
      );
    }
  }

  // 9. Late vs On-Time Calculation
  const sessionStartMs = new Date(session.startTime).getTime();
  const lateThresholdMs = sessionStartMs + (session.lateThresholdMinutes || 15) * 60 * 1000;
  const isLate = now.getTime() > lateThresholdMs;

  // 10. Determine Final Status
  let finalStatus: "present" | "late" | "pending_review" | "rejected";
  if (flaggedReasons.length > 0) {
    finalStatus = "pending_review";
  } else if (isLate) {
    finalStatus = "late";
  } else {
    finalStatus = "present";
  }

  const recordId = uuidv4();
  const newRecord = {
    id: recordId,
    sessionId: session.id,
    studentId,
    timestamp: nowIso,
    status: finalStatus,
    locationStatus,
    faceStatus,
    distanceMeters,
    accuracyMeters,
    faceSimilarity,
    verificationNotes: verificationNotesList.join(" | "),
    flaggedReasons: flaggedReasons.length > 0 ? JSON.stringify(flaggedReasons) : null,
    deviceFingerprint: deviceFingerprint || null,
    ipAddress,
    correctedBy: null,
    correctionReason: null,
    correctedAt: null,
  };

  try {
    await db.insert(attendanceRecords).values(newRecord);
  } catch (err: any) {
    if (err.message?.includes("UNIQUE") || err.message?.includes("session_student_unique_idx")) {
      return {
        success: false,
        error: "Simultaneous duplicate submission blocked. Attendance has already been saved.",
      };
    }
    throw err;
  }

  // Log final decision attempt
  await db.insert(verificationAttempts).values({
    id: uuidv4(),
    sessionId: session.id,
    studentId,
    step: "decision",
    result: finalStatus === "pending_review" ? "flagged" : "passed",
    reasonCode: `FINAL_${finalStatus.toUpperCase()}`,
    details: `Attendance recorded as ${finalStatus.toUpperCase()}. Flags: ${flaggedReasons.join(", ") || "None"}`,
    ipAddress,
    createdAt: nowIso,
  });

  return {
    success: true,
    status: finalStatus,
    record: newRecord,
    summary: {
      qrValid,
      locationStatus,
      distanceMeters,
      faceStatus,
      faceSimilarity,
      flaggedReasons,
      isLate,
    },
  };
}
