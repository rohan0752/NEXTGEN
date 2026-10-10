import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db, initDb } from "./index.js";
import {
  users,
  studentProfiles,
  facultyProfiles,
  classrooms,
  courses,
  enrollments,
  attendanceSessions,
  qrChallenges,
  attendanceRecords,
  verificationAttempts,
  correctionRequests,
  auditLogs,
  systemSettings,
} from "./schema.js";

export async function seedDatabase() {
  await initDb();

  console.log("Checking if database already has users...");
  const existingUsers = await db.select().from(users).all();
  if (existingUsers.length > 0) {
    console.log(`Database already seeded with ${existingUsers.length} users. Skipping seed.`);
    return;
  }

  console.log("Seeding fresh development data...");

  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const facultyPassword = await bcrypt.hash("Faculty@123", 10);
  const studentPassword = await bcrypt.hash("Student@123", 10);

  const now = new Date().toISOString();

  // 1. Users
  const adminId = uuidv4();
  const faculty1Id = uuidv4();
  const faculty2Id = uuidv4();
  const student1Id = uuidv4();
  const student2Id = uuidv4();
  const student3Id = uuidv4();
  const student4Id = uuidv4();

  await db.insert(users).values([
    {
      id: adminId,
      email: "admin@campusverify.edu",
      passwordHash: adminPassword,
      role: "admin",
      fullName: "Dean Eleanor Vance (Admin)",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: faculty1Id,
      email: "dr.sarah.connor@campusverify.edu",
      passwordHash: facultyPassword,
      role: "faculty",
      fullName: "Dr. Sarah Connor",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: faculty2Id,
      email: "prof.alan.turing@campusverify.edu",
      passwordHash: facultyPassword,
      role: "faculty",
      fullName: "Prof. Alan Turing",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: student1Id,
      email: "alex.rivers@campusverify.edu",
      passwordHash: studentPassword,
      role: "student",
      fullName: "Alex Rivers",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: student2Id,
      email: "maya.patel@campusverify.edu",
      passwordHash: studentPassword,
      role: "student",
      fullName: "Maya Patel",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: student3Id,
      email: "jordan.lee@campusverify.edu",
      passwordHash: studentPassword,
      role: "student",
      fullName: "Jordan Lee",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: student4Id,
      email: "samantha.taylor@campusverify.edu",
      passwordHash: studentPassword,
      role: "student",
      fullName: "Samantha Taylor",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // 2. Faculty Profiles
  await db.insert(facultyProfiles).values([
    {
      userId: faculty1Id,
      employeeId: "FAC-2021-084",
      department: "Computer Science & Engineering",
      officeLocation: "CS Building, Room 412",
      phone: "+1 (555) 234-5678",
      createdAt: now,
    },
    {
      userId: faculty2Id,
      employeeId: "FAC-2019-012",
      department: "Information Technology",
      officeLocation: "IT Complex, Room 205",
      phone: "+1 (555) 345-6789",
      createdAt: now,
    },
  ]);

  // 3. Student Profiles
  await db.insert(studentProfiles).values([
    {
      userId: student1Id,
      studentIdNumber: "STU-2024-001",
      department: "Computer Science & Engineering",
      section: "Sec-A",
      academicYear: "3rd Year (Junior)",
      biometricConsent: true,
      biometricConsentDate: now,
      referenceFacePath: null,
      faceEmbedding: null,
      createdAt: now,
    },
    {
      userId: student2Id,
      studentIdNumber: "STU-2024-002",
      department: "Computer Science & Engineering",
      section: "Sec-A",
      academicYear: "3rd Year (Junior)",
      biometricConsent: true,
      biometricConsentDate: now,
      referenceFacePath: null,
      faceEmbedding: null,
      createdAt: now,
    },
    {
      userId: student3Id,
      studentIdNumber: "STU-2024-003",
      department: "Computer Science & Engineering",
      section: "Sec-B",
      academicYear: "3rd Year (Junior)",
      biometricConsent: false,
      biometricConsentDate: null,
      referenceFacePath: null,
      faceEmbedding: null,
      createdAt: now,
    },
    {
      userId: student4Id,
      studentIdNumber: "STU-2024-004",
      department: "Information Technology",
      section: "Sec-A",
      academicYear: "2nd Year (Sophomore)",
      biometricConsent: true,
      biometricConsentDate: now,
      referenceFacePath: null,
      faceEmbedding: null,
      createdAt: now,
    },
  ]);

  // 4. Classrooms
  const class1Id = uuidv4();
  const class2Id = uuidv4();
  const class3Id = uuidv4();

  // Demo coordinates (e.g. Bangalore Tech Campus / Standard University demo coordinates)
  // Administrators and faculty can update them or use browser's current coordinates with one click
  await db.insert(classrooms).values([
    {
      id: class1Id,
      code: "CS-LH-301",
      name: "Turing Lecture Hall",
      building: "Ada Lovelace Computing Center",
      floor: "3rd Floor",
      latitude: 12.971598,
      longitude: 77.594562,
      geofenceRadiusMeters: 60,
      isActive: true,
      createdAt: now,
    },
    {
      id: class2Id,
      code: "IT-LAB-102",
      name: "Hopper Systems Lab",
      building: "Grace Hopper Information Complex",
      floor: "1st Floor",
      latitude: 12.972105,
      longitude: 77.595123,
      geofenceRadiusMeters: 50,
      isActive: true,
      createdAt: now,
    },
    {
      id: class3Id,
      code: "ENG-AUD-01",
      name: "Shannon Grand Auditorium",
      building: "Central Academic Block",
      floor: "Ground Floor",
      latitude: 12.971200,
      longitude: 77.593900,
      geofenceRadiusMeters: 100,
      isActive: true,
      createdAt: now,
    },
  ]);

  // 5. Courses
  const course1Id = uuidv4();
  const course2Id = uuidv4();
  const course3Id = uuidv4();

  await db.insert(courses).values([
    {
      id: course1Id,
      code: "CS301",
      name: "Distributed Systems & Cloud Architecture",
      department: "Computer Science & Engineering",
      section: "Sec-A",
      facultyId: faculty1Id,
      credits: 4,
      isActive: true,
      createdAt: now,
    },
    {
      id: course2Id,
      code: "CS304",
      name: "Machine Learning & Neural Networks",
      department: "Computer Science & Engineering",
      section: "Sec-A",
      facultyId: faculty1Id,
      credits: 4,
      isActive: true,
      createdAt: now,
    },
    {
      id: course3Id,
      code: "IT202",
      name: "Database Security & Cryptographic Systems",
      department: "Information Technology",
      section: "Sec-A",
      facultyId: faculty2Id,
      credits: 3,
      isActive: true,
      createdAt: now,
    },
  ]);

  // 6. Enrollments
  // Alex Rivers enrolled in CS301, CS304
  // Maya Patel enrolled in CS301, CS304
  // Jordan Lee enrolled in CS304
  // Samantha Taylor enrolled in IT202
  await db.insert(enrollments).values([
    {
      id: uuidv4(),
      courseId: course1Id,
      studentId: student1Id,
      status: "enrolled",
      enrolledAt: now,
    },
    {
      id: uuidv4(),
      courseId: course1Id,
      studentId: student2Id,
      status: "enrolled",
      enrolledAt: now,
    },
    {
      id: uuidv4(),
      courseId: course2Id,
      studentId: student1Id,
      status: "enrolled",
      enrolledAt: now,
    },
    {
      id: uuidv4(),
      courseId: course2Id,
      studentId: student2Id,
      status: "enrolled",
      enrolledAt: now,
    },
    {
      id: uuidv4(),
      courseId: course2Id,
      studentId: student3Id,
      status: "enrolled",
      enrolledAt: now,
    },
    {
      id: uuidv4(),
      courseId: course3Id,
      studentId: student4Id,
      status: "enrolled",
      enrolledAt: now,
    },
  ]);

  // 7. Completed Attendance Sessions & Historic Records for Analytics
  const pastSession1Id = uuidv4();
  const pastDate1 = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const pastEndDate1 = new Date(Date.now() - 3 * 24 * 3600 * 1000 + 3600 * 1000).toISOString();

  await db.insert(attendanceSessions).values([
    {
      id: pastSession1Id,
      courseId: course1Id,
      facultyId: faculty1Id,
      classroomId: class1Id,
      sessionCode: "CV-1011",
      title: "Lecture 14: Consensus & Paxos Protocol",
      startTime: pastDate1,
      endTime: pastEndDate1,
      status: "completed",
      durationMinutes: 60,
      qrRotationSeconds: 20,
      requireLocation: true,
      requireFace: true,
      lateThresholdMinutes: 15,
      createdAt: pastDate1,
    },
  ]);

  // Attendance records for past session
  const rec1Id = uuidv4();
  const rec2Id = uuidv4();
  await db.insert(attendanceRecords).values([
    {
      id: rec1Id,
      sessionId: pastSession1Id,
      studentId: student1Id,
      timestamp: pastDate1,
      status: "present",
      locationStatus: "verified",
      faceStatus: "verified",
      distanceMeters: 14.2,
      accuracyMeters: 8.5,
      faceSimilarity: 0.94,
      verificationNotes: "All multi-layer verification checks passed successfully.",
      flaggedReasons: null,
      deviceFingerprint: "Browser-Fingerprint-Mac-Chrome",
      ipAddress: "192.168.1.45",
    },
    {
      id: rec2Id,
      sessionId: pastSession1Id,
      studentId: student2Id,
      timestamp: pastDate1,
      status: "pending_review",
      locationStatus: "out_of_bounds",
      faceStatus: "verified",
      distanceMeters: 145.8,
      accuracyMeters: 25.0,
      faceSimilarity: 0.92,
      verificationNotes: "Location 145m exceeds geofence radius of 60m.",
      flaggedReasons: JSON.stringify(["GEOFENCE_EXCEEDED"]),
      deviceFingerprint: "Browser-Fingerprint-Win-Firefox",
      ipAddress: "192.168.1.88",
    },
  ]);

  // Correction Request for student 2 (Maya Patel)
  await db.insert(correctionRequests).values([
    {
      id: uuidv4(),
      attendanceRecordId: rec2Id,
      studentId: student2Id,
      sessionId: pastSession1Id,
      requestedStatus: "present",
      reason: "Campus Wi-Fi reported incorrect tower location. I was seated in row 4 of CS-LH-301.",
      proofNotes: "Submitted photo of notebook timestamped with professor lecture slides.",
      status: "pending",
      reviewerId: null,
      reviewerComment: null,
      reviewedAt: null,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
  ]);

  // 8. Active Attendance Session for CS301 (Dr. Sarah Connor)
  const activeSessionId = uuidv4();
  const sessionStartTime = new Date().toISOString();
  const sessionEndTime = new Date(Date.now() + 45 * 60 * 1000).toISOString();

  await db.insert(attendanceSessions).values([
    {
      id: activeSessionId,
      courseId: course1Id,
      facultyId: faculty1Id,
      classroomId: class1Id,
      sessionCode: "CV-8492",
      title: "Lecture 16: Raft Distributed State Machine",
      startTime: sessionStartTime,
      endTime: sessionEndTime,
      status: "active",
      durationMinutes: 45,
      qrRotationSeconds: 20,
      requireLocation: true,
      requireFace: true,
      lateThresholdMinutes: 15,
      createdAt: sessionStartTime,
    },
  ]);

  // Active QR Challenge for the active session
  const challengeToken = uuidv4();
  const qrExpiry = new Date(Date.now() + 25 * 1000).toISOString();
  const qrPayload = JSON.stringify({
    app: "CampusVerify",
    session_id: activeSessionId,
    token: challengeToken,
    code: "CV-8492",
    course: "CS301",
    exp: Date.now() + 25 * 1000,
  });

  await db.insert(qrChallenges).values([
    {
      id: uuidv4(),
      sessionId: activeSessionId,
      challengeToken: challengeToken,
      qrData: qrPayload,
      issuedAt: sessionStartTime,
      expiresAt: qrExpiry,
      isRevoked: false,
    },
  ]);

  // 9. Initial Audit Logs
  await db.insert(auditLogs).values([
    {
      id: uuidv4(),
      actorId: adminId,
      actorRole: "admin",
      actorName: "Dean Eleanor Vance (Admin)",
      action: "SYSTEM_INITIALIZE",
      targetResource: "System",
      targetId: "SYSTEM_INIT",
      details: "Initial system configuration and development seed completed.",
      ipAddress: "127.0.0.1",
      createdAt: now,
    },
    {
      id: uuidv4(),
      actorId: faculty1Id,
      actorRole: "faculty",
      actorName: "Dr. Sarah Connor",
      action: "SESSION_CREATE",
      targetResource: "AttendanceSession",
      targetId: activeSessionId,
      details: "Started attendance session CV-8492 for CS301 in CS-LH-301.",
      ipAddress: "192.168.1.10",
      createdAt: sessionStartTime,
    },
  ]);

  // 10. System Settings
  await db.insert(systemSettings).values([
    {
      key: "institution_name",
      value: "Metropolitan Institute of Technology",
      updatedAt: now,
    },
    {
      key: "academic_semester",
      value: "Fall 2026",
      updatedAt: now,
    },
    {
      key: "face_verification_tolerance",
      value: "0.55", // Euclidean distance threshold
      updatedAt: now,
    },
    {
      key: "max_location_accuracy_meters",
      value: "80",
      updatedAt: now,
    },
  ]);

  console.log("Database seeded successfully with demo users, courses, classrooms, sessions, and records.");
}

// Run immediately if executed directly
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  seedDatabase().then(() => {
    console.log("Seed script completed.");
    process.exit(0);
  }).catch((err) => {
    console.error("Seed script failed:", err);
    process.exit(1);
  });
}
