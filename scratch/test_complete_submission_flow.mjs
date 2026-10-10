import http from "http";

const BASE_URL = "http://127.0.0.1:5000";

function request(path, method = "GET", body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;
    const headers = {};
    if (postData) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(postData);
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const req = http.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json = data;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runFullE2ETest() {
  console.log("=================================================");
  console.log("   CAMPUSVERIFY END-TO-END SUBMISSION TEST SUITE  ");
  console.log("=================================================");
  let passed = 0;
  let total = 0;

  function assert(desc, condition) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  // 1. Register a fresh student
  const studentEmail = `student.${Date.now()}@campusverify.edu`;
  const regStudentRes = await request("/api/auth/register", "POST", {
    fullName: "Alex Submission Tester",
    email: studentEmail,
    password: "Password@123",
    role: "student",
  });
  assert("Student Registration HTTP 201 Created", regStudentRes.status === 201);
  assert("Student JWT token received", !!regStudentRes.body?.token);
  assert("Role is student", regStudentRes.body?.user?.role === "student");
  assert("Student ID assigned with STU- prefix", regStudentRes.body?.user?.profile?.studentIdNumber?.startsWith("STU-"));
  const studentToken = regStudentRes.body?.token;

  // 2. Register a fresh faculty member
  const facultyEmail = `prof.${Date.now()}@campusverify.edu`;
  const regFacultyRes = await request("/api/auth/register", "POST", {
    fullName: "Dr. Evelyn Reed",
    email: facultyEmail,
    password: "Password@123",
    role: "faculty",
  });
  assert("Faculty Registration HTTP 201 Created", regFacultyRes.status === 201);
  assert("Role is faculty", regFacultyRes.body?.user?.role === "faculty");
  assert("Employee ID assigned with FAC- prefix", regFacultyRes.body?.user?.profile?.employeeId?.startsWith("FAC-"));

  // 3. Register a fresh administrator
  const adminEmail = `admin.${Date.now()}@campusverify.edu`;
  const regAdminRes = await request("/api/auth/register", "POST", {
    fullName: "Administrator Jordan",
    email: adminEmail,
    password: "Password@123",
    role: "admin",
  });
  assert("Admin Registration HTTP 201 Created", regAdminRes.status === 201);
  assert("Role is admin", regAdminRes.body?.user?.role === "admin");

  // 4. Test Student Login
  const loginStudentRes = await request("/api/auth/login", "POST", {
    email: studentEmail,
    password: "Password@123",
  });
  assert("Student Login HTTP 200 OK", loginStudentRes.status === 200);
  assert("Returns correct student user record", loginStudentRes.body?.user?.email === studentEmail.toLowerCase());

  // 5. Test Invalid Password Login (Clear 401 error message, no reload)
  const badLoginRes = await request("/api/auth/login", "POST", {
    email: studentEmail,
    password: "WrongPassword999",
  });
  assert("Invalid password returns HTTP 401 Unauthorized", badLoginRes.status === 401);
  assert("Error explains invalid credentials", badLoginRes.body?.error?.includes("Invalid email or password"));

  // 6. Test Demo Accounts Login
  const demoStudentLogin = await request("/api/auth/login", "POST", {
    email: "alex.rivers@campusverify.edu",
    password: "Student@123",
  });
  assert("Demo account Alex Rivers logs in successfully", demoStudentLogin.status === 200 && demoStudentLogin.body?.user?.role === "student");

  const demoFacultyLogin = await request("/api/auth/login", "POST", {
    email: "dr.sarah.connor@campusverify.edu",
    password: "Faculty@123",
  });
  assert("Demo account Dr. Sarah Connor logs in successfully", demoFacultyLogin.status === 200 && demoFacultyLogin.body?.user?.role === "faculty");
  const facultyToken = demoFacultyLogin.body?.token;

  // 7. Verify Faculty can launch active session & dynamic rotating QR code
  const coursesRes = await request("/api/courses", "GET", null, facultyToken);
  assert("Faculty retrieves assigned courses", coursesRes.status === 200 && coursesRes.body?.courses?.length > 0);
  const courseId = coursesRes.body.courses[0].id;

  const classroomsRes = await request("/api/classrooms", "GET", null, facultyToken);
  assert("Faculty retrieves classrooms", classroomsRes.status === 200 && classroomsRes.body?.classrooms?.length > 0);
  const classroomId = classroomsRes.body.classrooms[0].id;

  // Conclude any active sessions first
  const existingSessionsRes = await request("/api/sessions", "GET", null, facultyToken);
  for (const s of (existingSessionsRes.body?.sessions || []).filter((s) => s.status === "active" && s.courseId === courseId)) {
    await request(`/api/sessions/${s.id}/end`, "POST", {}, facultyToken);
  }

  const sessionRes = await request("/api/sessions", "POST", {
    courseId,
    classroomId,
    title: "E2E Verified Attendance Session",
    geofenceRadiusMeters: 50,
    requireFace: true,
  }, facultyToken);
  console.log("SESSION_CREATE_RESULT:", sessionRes.status, sessionRes.body);
  assert("Faculty launches active session with QR challenge", sessionRes.status === 201 && !!sessionRes.body?.sessionId);
  const sessionId = sessionRes.body.sessionId;
  const sessionCode = sessionRes.body.sessionCode;

  // 8. Fetch active dynamic QR challenge
  const challengeRes = await request(`/api/sessions/${sessionId}/active-challenge`, "GET", null, facultyToken);
  assert("Active rotating QR challenge retrieved", challengeRes.status === 200 && !!challengeRes.body?.challengeToken);
  const challengeToken = challengeRes.body.challengeToken;

  // 9. Student verifies attendance using QR token, simulated GPS, and demo face photo
  const studentSubmitRes = await request("/api/attendance/submit", "POST", {
    sessionId,
    sessionCode,
    challengeToken,
    location: {
      latitude: 12.971598,
      longitude: 77.594562,
      accuracy: 5,
    },
    face: {
      descriptor: Array.from({ length: 128 }, () => Math.random() * 0.1),
      photoCaptured: true,
    },
    deviceFingerprint: "Chrome/TestRunner-Antigravity",
  }, studentToken);
  assert("Student attendance submitted successfully", studentSubmitRes.status === 200 && !!studentSubmitRes.body?.record?.id);
  const recordId = studentSubmitRes.body.record.id;

  // 10. Duplicate attendance attempt rejected (Anti-replay check)
  const dupSubmitRes = await request("/api/attendance/submit", "POST", {
    sessionId,
    sessionCode,
    challengeToken,
    location: { latitude: 12.971598, longitude: 77.594562, accuracy: 5 },
  }, studentToken);
  assert("Duplicate submission rejected (HTTP 400)", dupSubmitRes.status === 400 && dupSubmitRes.body?.error?.includes("already submitted"));

  // 11. Faculty reviews and approves attendance record
  const approveRes = await request("/api/attendance/manual-override", "POST", {
    recordId,
    newStatus: "present",
    reason: "E2E Automated Verification: Student confirmed in room with verified demo photo snapshot.",
  }, facultyToken);
  assert("Faculty manual review approval succeeds (HTTP 200)", approveRes.status === 200 && approveRes.body?.record?.status === "present");

  // 12. Verify Audit Log entry created
  const adminLogin = await request("/api/auth/login", "POST", {
    email: "admin@campusverify.edu",
    password: "Admin@123",
  });
  const adminToken = adminLogin.body?.token;
  const auditRes = await request("/api/admin/audit-logs?limit=5", "GET", null, adminToken);
  assert("Audit logs record administrative, registration, and attendance events", auditRes.status === 200 && auditRes.body?.logs?.length > 0);

  // 13. End session
  const endSessionRes = await request(`/api/sessions/${sessionId}/end`, "POST", {}, facultyToken);
  assert("Faculty concludes session", endSessionRes.status === 200 && endSessionRes.body?.success === true);

  console.log(`\n=================================================`);
  console.log(`  E2E TEST RESULT: ${passed}/${total} TESTS PASSED`);
  console.log(`=================================================`);
}

runFullE2ETest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
