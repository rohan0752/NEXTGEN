import { createClient } from "@libsql/client";

const API_BASE = "http://127.0.0.1:5000/api";
const client = createClient({ url: "file:campusverify.db" });

async function run() {
  console.log("================================================================");
  console.log(" CAMPUSVERIFY COMPREHENSIVE REQUIREMENTS VERIFICATION");
  console.log("================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [✓ PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [✗ FAIL] ${message}`);
      failed++;
    }
  }

  // 1. QR Attendance Direct URL & Backend Validation
  console.log("\n--- 1. QR Attendance Direct URL & Backend Validation ---");
  // Login faculty
  const facLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "dr.sarah.connor@campusverify.edu", password: "Faculty@123" }),
  });
  const facLogin = await facLoginRes.json();
  const facToken = facLogin.token;

  // Query course and classroom
  const coursesRes = await fetch(`${API_BASE}/courses`, { headers: { Authorization: `Bearer ${facToken}` } });
  const { courses } = await coursesRes.json();
  const cs301 = courses.find((c) => c.code === "CS301") || courses[0];

  const classRes = await fetch(`${API_BASE}/classrooms`, { headers: { Authorization: `Bearer ${facToken}` } });
  const { classrooms } = await classRes.json();
  const room = classrooms[0];

  // End existing active sessions for this course
  const existingRes = await fetch(`${API_BASE}/sessions`, { headers: { Authorization: `Bearer ${facToken}` } });
  const { sessions: existingSessions } = await existingRes.json();
  for (const s of existingSessions.filter((s) => s.status === "active" && s.courseId === cs301.id)) {
    await fetch(`${API_BASE}/sessions/${s.id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${facToken}` },
    });
  }

  // Create attendance session
  const sesCreateRes = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${facToken}` },
    body: JSON.stringify({
      courseId: cs301.id,
      classroomId: room.id,
      title: "Algorithms Lecture 14",
      durationMinutes: 10,
      qrRotationSeconds: 15,
      requireLocation: true,
      requireFace: false,
    }),
  });
  const sesCreate = await sesCreateRes.json();
  const sessionId = sesCreate.sessionId;
  assert(sesCreate.success && sessionId, "Faculty successfully started attendance session");

  // Get active challenge / QR data
  const qrRes = await fetch(`${API_BASE}/sessions/${sessionId}/active-challenge`, {
    headers: { Authorization: `Bearer ${facToken}` },
  });
  const qrData = await qrRes.json();
  assert(qrData.success && qrData.challengeToken, "Dynamic challenge token generated");
  assert(
    qrData.qrData.includes("/attendance/verify?sessionId=") &&
      qrData.qrData.includes(`sessionId=${sessionId}`) &&
      qrData.qrData.includes(`token=${qrData.challengeToken}`),
    `QR encodes direct URL: ${qrData.qrData}`
  );

  // End session and verify rejection
  const endRes = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
    method: "POST",
    headers: { Authorization: `Bearer ${facToken}` },
  });
  const endData = await endRes.json();
  assert(endData.success, "Session ended successfully");

  // Login student
  const stuLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alex.rivers@campusverify.edu", password: "Student@123" }),
  });
  const stuLogin = await stuLoginRes.json();
  const stuToken = stuLogin.token;

  // Submit to ended session
  const submitEndedRes = await fetch(`${API_BASE}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stuToken}` },
    body: JSON.stringify({
      sessionId,
      challengeToken: qrData.challengeToken,
      location: { latitude: 12.971598, longitude: 77.594562 },
    }),
  });
  const submitEnded = await submitEndedRes.json();
  assert(
    submitEndedRes.status === 400 && submitEnded.error?.includes("completed"),
    `Ended session strictly rejected with HTTP 400: "${submitEnded.error}"`
  );

  // 2. Real Registration & Password Hashing
  console.log("\n--- 2. Real Registration, Hashing, & Student ID Login ---");
  const rand = Math.floor(Math.random() * 100000);
  const testStudentEmail = `test.student.${rand}@campusverify.edu`;
  const plainPassword = "SecurePass@123";

  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: `Test Student ${rand}`,
      email: testStudentEmail,
      password: plainPassword,
      role: "student",
    }),
  });
  const regData = await regRes.json();
  assert(regRes.status === 201 && regData.token && regData.user, "New student registered persistently (HTTP 201)");
  const newStudentIdNum = regData.user.profile?.studentIdNumber;
  assert(newStudentIdNum && newStudentIdNum.startsWith("STU-"), `Auto-assigned Student ID Number: ${newStudentIdNum}`);

  // Inspect database directly to ensure password is hashed with bcrypt and NOT plaintext
  const dbUserResult = await client.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [testStudentEmail],
  });
  const dbUser = dbUserResult.rows[0];
  assert(dbUser, "User record exists in SQLite database");
  assert(
    String(dbUser.password_hash).startsWith("$2a$") || String(dbUser.password_hash).startsWith("$2b$"),
    `Password securely hashed with bcrypt (${String(dbUser.password_hash).substring(0, 15)}...)`
  );
  assert(!JSON.stringify(dbUser).includes(plainPassword), "Plaintext password is NEVER stored in database");

  // Login with Email
  const loginEmailRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testStudentEmail, password: plainPassword }),
  });
  assert(loginEmailRes.status === 200, "Login with institutional email succeeds (HTTP 200)");

  // Login with Student ID Number
  const loginStuIdRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: newStudentIdNum, password: plainPassword }),
  });
  assert(loginStuIdRes.status === 200, "Login with Student ID Number succeeds (HTTP 200)");

  // Login with wrong password shows clear error
  const loginBadPassRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testStudentEmail, password: "WrongPassword" }),
  });
  const loginBadPass = await loginBadPassRes.json();
  assert(
    loginBadPassRes.status === 401 && loginBadPass.error,
    `Wrong password rejected with clear message: "${loginBadPass.error}"`
  );

  // 3. Role Security & Backend Authorization
  console.log("\n--- 3. Role Security & Backend Authorization ---");
  const testStuToken = (await loginEmailRes.json()).token;

  // Student accessing admin stats -> 403 Forbidden
  const adminStatsRes = await fetch(`${API_BASE}/admin/stats`, {
    headers: { Authorization: `Bearer ${testStuToken}` },
  });
  assert(adminStatsRes.status === 403, "Student access to Admin stats blocked with HTTP 403 Forbidden");

  // Student accessing admin audit logs -> 403 Forbidden
  const adminLogsRes = await fetch(`${API_BASE}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${testStuToken}` },
  });
  assert(adminLogsRes.status === 403, "Student access to Admin audit logs blocked with HTTP 403 Forbidden");

  // Student creating classroom -> 403 Forbidden
  const createClassroomRes = await fetch(`${API_BASE}/classrooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${testStuToken}` },
    body: JSON.stringify({ code: "HACK-101", name: "Hack Room", building: "Main", latitude: 12, longitude: 77 }),
  });
  assert(createClassroomRes.status === 403, "Student creating classroom blocked with HTTP 403 Forbidden");

  // Student reviewing faculty queue -> 403 Forbidden
  const facultyQueueRes = await fetch(`${API_BASE}/attendance/pending-reviews`, {
    headers: { Authorization: `Bearer ${testStuToken}` },
  });
  assert(facultyQueueRes.status === 403, "Student accessing faculty review queue blocked with HTTP 403 Forbidden");

  // Only real admin can access admin stats
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@campusverify.edu", password: "Admin@123" }),
  });
  const adminLogin = await adminLoginRes.json();
  const adminToken = adminLogin.token;

  const validAdminRes = await fetch(`${API_BASE}/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(validAdminRes.status === 200, "Authorized Administrator accesses Admin stats with HTTP 200");

  console.log("\n================================================================");
  console.log(` SUMMARY: ${passed} passed, ${failed} failed (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log("================================================================");

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
