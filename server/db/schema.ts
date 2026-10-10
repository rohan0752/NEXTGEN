import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["student", "faculty", "admin"] }).notNull(),
  fullName: text("full_name").notNull(),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const studentProfiles = sqliteTable("student_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  studentIdNumber: text("student_id_number").notNull().unique(),
  department: text("department").notNull(),
  section: text("section").notNull(),
  academicYear: text("academic_year").notNull(),
  biometricConsent: integer("biometric_consent", { mode: "boolean" }).notNull().default(false),
  biometricConsentDate: text("biometric_consent_date"),
  referenceFacePath: text("reference_face_path"),
  faceEmbedding: text("face_embedding"), // JSON string array of 128 floats
  createdAt: text("created_at").notNull(),
});

export const facultyProfiles = sqliteTable("faculty_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().unique(),
  department: text("department").notNull(),
  officeLocation: text("office_location"),
  phone: text("phone"),
  createdAt: text("created_at").notNull(),
});

export const classrooms = sqliteTable("classrooms", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  building: text("building").notNull(),
  floor: text("floor").notNull().default("Ground Floor"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  geofenceRadiusMeters: integer("geofence_radius_meters").notNull().default(50),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  section: text("section").notNull(),
  facultyId: text("faculty_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull().default(4),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const enrollments = sqliteTable("enrollments", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["enrolled", "dropped"] }).notNull().default("enrolled"),
  enrolledAt: text("enrolled_at").notNull(),
}, (table) => ({
  courseStudentIdx: uniqueIndex("course_student_idx").on(table.courseId, table.studentId),
}));

export const attendanceSessions = sqliteTable("attendance_sessions", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  facultyId: text("faculty_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  classroomId: text("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  sessionCode: text("session_code").notNull().unique(),
  title: text("title").notNull().default("Lecture Session"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status", { enum: ["active", "completed", "cancelled"] }).notNull().default("active"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  qrRotationSeconds: integer("qr_rotation_seconds").notNull().default(20),
  requireLocation: integer("require_location", { mode: "boolean" }).notNull().default(true),
  requireFace: integer("require_face", { mode: "boolean" }).notNull().default(true),
  lateThresholdMinutes: integer("late_threshold_minutes").notNull().default(15),
  createdAt: text("created_at").notNull(),
});

export const qrChallenges = sqliteTable("qr_challenges", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => attendanceSessions.id, { onDelete: "cascade" }),
  challengeToken: text("challenge_token").notNull().unique(),
  qrData: text("qr_data").notNull(),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  isRevoked: integer("is_revoked", { mode: "boolean" }).notNull().default(false),
}, (table) => ({
  challengeIdx: index("challenge_idx").on(table.challengeToken),
}));

export const attendanceRecords = sqliteTable("attendance_records", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => attendanceSessions.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  timestamp: text("timestamp").notNull(),
  status: text("status", { enum: ["present", "late", "pending_review", "rejected", "absent"] }).notNull(),
  locationStatus: text("location_status", { enum: ["verified", "out_of_bounds", "permission_denied", "skipped", "manual_review"] }).notNull().default("skipped"),
  faceStatus: text("face_status", { enum: ["verified", "mismatch", "unconfigured", "skipped", "manual_review"] }).notNull().default("skipped"),
  distanceMeters: real("distance_meters"),
  accuracyMeters: real("accuracy_meters"),
  faceSimilarity: real("face_similarity"),
  verificationNotes: text("verification_notes"),
  flaggedReasons: text("flagged_reasons"), // JSON string array
  deviceFingerprint: text("device_fingerprint"),
  ipAddress: text("ip_address"),
  correctedBy: text("corrected_by").references(() => users.id),
  correctionReason: text("correction_reason"),
  correctedAt: text("corrected_at"),
}, (table) => ({
  sessionStudentUnique: uniqueIndex("session_student_unique_idx").on(table.sessionId, table.studentId),
}));

export const verificationAttempts = sqliteTable("verification_attempts", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  studentId: text("student_id").notNull(),
  step: text("step").notNull(), // 'qr' | 'location' | 'face' | 'decision'
  result: text("result").notNull(), // 'passed' | 'failed' | 'flagged'
  reasonCode: text("reason_code").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull(),
});

export const correctionRequests = sqliteTable("correction_requests", {
  id: text("id").primaryKey(),
  attendanceRecordId: text("attendance_record_id").notNull().references(() => attendanceRecords.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => attendanceSessions.id, { onDelete: "cascade" }),
  requestedStatus: text("requested_status").notNull().default("present"),
  reason: text("reason").notNull(),
  proofNotes: text("proof_notes"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reviewerId: text("reviewer_id").references(() => users.id),
  reviewerComment: text("reviewer_comment"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id),
  actorRole: text("actor_role").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  targetResource: text("target_resource").notNull(),
  targetId: text("target_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull(),
});

export const systemSettings = sqliteTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
