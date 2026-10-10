import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_URL || "file:campusverify.db";

// Ensure data folder if needed
const client = createClient({
  url: dbPath,
});

export const db = drizzle(client, { schema });
export { client };

export async function initDb() {
  // Enable foreign keys
  await client.execute("PRAGMA foreign_keys = ON;");

  // Create tables if not exist
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'faculty', 'admin')),
      full_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      student_id_number TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      section TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      biometric_consent INTEGER NOT NULL DEFAULT 0,
      biometric_consent_date TEXT,
      reference_face_path TEXT,
      face_embedding TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS faculty_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      office_location TEXT,
      phone TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      building TEXT NOT NULL,
      floor TEXT NOT NULL DEFAULT 'Ground Floor',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      geofence_radius_meters INTEGER NOT NULL DEFAULT 50,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      section TEXT NOT NULL,
      faculty_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credits INTEGER NOT NULL DEFAULT 4,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'enrolled' CHECK(status IN ('enrolled', 'dropped')),
      enrolled_at TEXT NOT NULL,
      UNIQUE(course_id, student_id)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      faculty_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      session_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT 'Lecture Session',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      qr_rotation_seconds INTEGER NOT NULL DEFAULT 20,
      require_location INTEGER NOT NULL DEFAULT 1,
      require_face INTEGER NOT NULL DEFAULT 1,
      late_threshold_minutes INTEGER NOT NULL DEFAULT 15,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS qr_challenges (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      challenge_token TEXT NOT NULL UNIQUE,
      qr_data TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_qr_challenges_token ON qr_challenges(challenge_token);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('present', 'late', 'pending_review', 'rejected', 'absent')),
      location_status TEXT NOT NULL DEFAULT 'skipped' CHECK(location_status IN ('verified', 'out_of_bounds', 'permission_denied', 'skipped', 'manual_review')),
      face_status TEXT NOT NULL DEFAULT 'skipped' CHECK(face_status IN ('verified', 'mismatch', 'unconfigured', 'skipped', 'manual_review')),
      distance_meters REAL,
      accuracy_meters REAL,
      face_similarity REAL,
      verification_notes TEXT,
      flagged_reasons TEXT,
      device_fingerprint TEXT,
      ip_address TEXT,
      corrected_by TEXT REFERENCES users(id),
      correction_reason TEXT,
      corrected_at TEXT,
      UNIQUE(session_id, student_id)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS verification_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      step TEXT NOT NULL,
      result TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS correction_requests (
      id TEXT PRIMARY KEY,
      attendance_record_id TEXT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      requested_status TEXT NOT NULL DEFAULT 'present',
      reason TEXT NOT NULL,
      proof_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      reviewer_id TEXT REFERENCES users(id),
      reviewer_comment TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id),
      actor_role TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_resource TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  console.log("Database initialized successfully with foreign key constraints.");
}
