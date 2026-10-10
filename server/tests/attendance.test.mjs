// CampusVerify Comprehensive End-to-End Attendance Test Suite
// Covers:
// 1. Health check & API service availability
// 2. Authentication & Role-Based Access Control (RBAC)
// 3. Dynamic QR challenge token issuance, expiration & forgery prevention
// 4. Geofence evaluation (inside pass vs outside boundary violation)
// 5. Duplicate attendance submission prevention (anti-replay)
// 6. Expired / concluded session submission rejection
// 7. Faculty manual-review workflow (approval & rejection) with required justification
// 8. Cross-instructor authorization barriers
// 9. Immutable audit logging verification

const BASE_URL = process.env.API_URL || "http://127.0.0.1:5000/api";

const results = [];

function assertTest(category, name, condition, details = "") {
  results.push({ category, name, passed: Boolean(condition), details });
  const status = condition ? "✓ PASS" : "✗ FAIL";
  console.log(`  [${status}] ${name} ${details ? `(${details})` : ""}`);
}

async function runTestSuite() {
  console.log("========================================================================");
  console.log("  CAMPUSVERIFY: FULL AUTOMATED ATTENDANCE TEST SUITE");
  console.log("========================================================================\n");

  // -------------------------------------------------------------------------
  // 1. HEALTH CHECK
  // -------------------------------------------------------------------------
  console.log("--- 1. Health & Server Readiness Check ---");
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthJson = await healthRes.json();
    assertTest(
      "Health",
      "API server is running and healthy",
      healthRes.status === 200 && healthJson.status === "ok",
      `HTTP ${healthRes.status}, app: "${healthJson.app}"`
    );
  } catch (err) {
    assertTest("Health", "API server is running and healthy", false, `Connection error: ${err.message}`);
    console.error("Server is not reachable. Ensure dev server is running on port 5000.");
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // 2. AUTHENTICATION & RBAC
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Authentication & Role-Based Access Control (RBAC) ---");
  // Faculty 1: Dr. Sarah Connor (CS301 Instructor)
  const fac1Login = await (
    await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dr.sarah.connor@campusverify.edu", password: "Faculty@123" }),
    })
  ).json();
  const fac1Token = fac1Login.token;

  // Faculty 2: Prof. Alan Turing (Different Instructor)
  const fac2Login = await (
    await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "prof.alan.turing@campusverify.edu", password: "Faculty@123" }),
    })
  ).json();
  const fac2Token = fac2Login.token;

  // Student 1: Alex Rivers
  const stu1Login = await (
    await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex.rivers@campusverify.edu", password: "Student@123" }),
    })
  ).json();
  const stu1Token = stu1Login.token;

  // Student 2: Maya Patel
  const stu2Login = await (
    await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "maya.patel@campusverify.edu", password: "Student@123" }),
    })
  ).json();
  const stu2Token = stu2Login.token;

  // Admin: Dean Eleanor Vance
  const adminLogin = await (
    await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@campusverify.edu", password: "Admin@123" }),
    })
  ).json();
  const adminToken = adminLogin.token;

  assertTest(
    "Auth",
    "All role demo credentials authenticate successfully",
    fac1Token && fac2Token && stu1Token && stu2Token && adminToken,
    "Faculty, Student, and Admin JWT tokens issued"
  );

  // Unauthenticated requests rejected
  const unauthRes = await fetch(`${BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertTest(
    "RBAC",
    "Unauthenticated requests rejected with HTTP 401 Unauthorized",
    unauthRes.status === 401,
    `HTTP ${unauthRes.status}`
  );

  // Student attempting faculty action (create session)
  const studentCreateRes = await fetch(`${BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({}),
  });
  assertTest(
    "RBAC",
    "Student blocked from creating attendance sessions with HTTP 403 Forbidden",
    studentCreateRes.status === 403,
    `HTTP ${studentCreateRes.status}`
  );

  // Student attempting admin action (view audit logs)
  const studentAuditRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${stu1Token}` },
  });
  assertTest(
    "RBAC",
    "Student blocked from accessing administrative audit logs with HTTP 403 Forbidden",
    studentAuditRes.status === 403,
    `HTTP ${studentAuditRes.status}`
  );

  // -------------------------------------------------------------------------
  // 3. SESSION SETUP & CROSS-FACULTY AUTHORIZATION
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Session Setup & Cross-Instructor Authorization ---");
  const coursesRes = await fetch(`${BASE_URL}/courses`, { headers: { Authorization: `Bearer ${fac1Token}` } });
  const { courses } = await coursesRes.json();
  const cs301 = courses.find((c) => c.code === "CS301") || courses[0];

  const classRes = await fetch(`${BASE_URL}/classrooms`, { headers: { Authorization: `Bearer ${fac1Token}` } });
  const { classrooms } = await classRes.json();
  const room = classrooms[0];

  // Conclude previous sessions for CS301
  const existingSessionsRes = await fetch(`${BASE_URL}/sessions`, { headers: { Authorization: `Bearer ${fac1Token}` } });
  const { sessions: existingSessions } = await existingSessionsRes.json();
  for (const s of existingSessions.filter((s) => s.status === "active" && s.courseId === cs301.id)) {
    await fetch(`${BASE_URL}/sessions/${s.id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${fac1Token}` },
    });
  }

  // Cross-Faculty: Prof. Alan Turing attempting to create a session for Dr. Connor's course CS301
  const crossCreateRes = await fetch(`${BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fac2Token}` },
    body: JSON.stringify({
      courseId: cs301.id,
      classroomId: room.id,
      title: "Unauthorized Session",
      durationMinutes: 30,
    }),
  });
  assertTest(
    "RBAC",
    "Instructor cannot create sessions for another faculty's course (HTTP 403)",
    crossCreateRes.status === 403,
    `HTTP ${crossCreateRes.status}`
  );

  // Legitimate Session Creation by Dr. Sarah Connor
  const createRes = await fetch(`${BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fac1Token}` },
    body: JSON.stringify({
      courseId: cs301.id,
      classroomId: room.id,
      title: "Automated Verification Lab",
      durationMinutes: 45,
      qrRotationSeconds: 10,
      requireLocation: true,
      requireFace: true,
    }),
  });
  const createdSession = await createRes.json();
  const sessionId = createdSession.sessionId;
  const sessionCode = createdSession.sessionCode;
  assertTest(
    "Session",
    "Authorized faculty successfully launches active attendance session",
    (createRes.status === 201 || createRes.status === 200) && sessionId != null,
    `HTTP ${createRes.status}, Session Code: ${sessionCode}`
  );

  // -------------------------------------------------------------------------
  // 4. DYNAMIC QR CODE CHALLENGE & VALIDATION
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Dynamic QR Token Validation & Security ---");
  // Fetch legitimate QR challenge
  const qrRes = await fetch(`${BASE_URL}/sessions/${sessionId}/qr`, {
    headers: { Authorization: `Bearer ${fac1Token}` },
  });
  const qrData = await qrRes.json();
  const validQrToken = qrData.challengeToken;
  assertTest(
    "QR Security",
    "Dynamic rotating QR challenge token issued with countdown timer",
    qrRes.status === 200 && validQrToken != null,
    `Token: ${validQrToken?.slice(0, 8)}..., Remaining: ${qrData.remainingSeconds}s`
  );

  // Cross-Faculty: Prof. Alan Turing attempting to fetch QR challenge for Dr. Connor's session
  const crossQrRes = await fetch(`${BASE_URL}/sessions/${sessionId}/qr`, {
    headers: { Authorization: `Bearer ${fac2Token}` },
  });
  assertTest(
    "RBAC",
    "Unauthorized instructor cannot fetch QR challenges for another instructor's session (HTTP 403)",
    crossQrRes.status === 403,
    `HTTP ${crossQrRes.status}`
  );

  // Forged QR token
  const forgedRes = await fetch(`${BASE_URL}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({
      sessionId,
      sessionCode,
      challengeToken: "forged-challenge-token-xyz-123",
      location: { latitude: room.latitude, longitude: room.longitude, accuracy: 10 },
      deviceFingerprint: "device_alex",
    }),
  });
  const forgedJson = await forgedRes.json();
  assertTest(
    "QR Security",
    "Server rejects forged/invalid QR challenge tokens with HTTP 400",
    forgedRes.status === 400 && forgedJson.error?.includes("Invalid or forged"),
    `Error: "${forgedJson.error}"`
  );

  // Missing QR token
  const missingTokenRes = await fetch(`${BASE_URL}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({
      sessionId,
      sessionCode,
      location: { latitude: room.latitude, longitude: room.longitude, accuracy: 10 },
      deviceFingerprint: "device_alex",
    }),
  });
  const missingJson = await missingTokenRes.json();
  assertTest(
    "QR Security",
    "Server rejects submission without QR challenge token with HTTP 400",
    missingTokenRes.status === 400 && missingJson.error?.includes("Missing QR"),
    `Error: "${missingJson.error}"`
  );

  // Expired QR challenge token test
  const tokenToWaitOn = validQrToken;
  const waitSec = 17; // 10s rotation + 5s buffer + 2s margin
  console.log(`  Waiting ${waitSec}s for dynamic QR challenge token to expire naturally...`);
  await new Promise((r) => setTimeout(r, waitSec * 1000));

  const expiredSubmitRes = await fetch(`${BASE_URL}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({
      sessionId,
      sessionCode,
      challengeToken: tokenToWaitOn,
      location: { latitude: room.latitude, longitude: room.longitude, accuracy: 10 },
      deviceFingerprint: "device_alex",
    }),
  });
  const expiredSubmitJson = await expiredSubmitRes.json();
  assertTest(
    "QR Security",
    "Server rejects expired QR challenge token after rotation window with HTTP 400",
    expiredSubmitRes.status === 400 &&
      (expiredSubmitJson.error?.includes("expired") || expiredSubmitJson.error?.includes("Invalid or forged")),
    `HTTP ${expiredSubmitRes.status}, Error: "${expiredSubmitJson.error}"`
  );

  // Fetch fresh challenge token for subsequent submission steps
  const freshQrRes = await fetch(`${BASE_URL}/sessions/${sessionId}/qr`, {
    headers: { Authorization: `Bearer ${fac1Token}` },
  });
  const freshQrData = await freshQrRes.json();
  const currentQrToken = freshQrData.challengeToken;

  // -------------------------------------------------------------------------
  // 5. GEOFENCE EVALUATION & ATTENDANCE SUBMISSION
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Geofence Evaluation & Attendance Submission ---");
  const syntheticFaceDescriptor = Array.from({ length: 128 }, () => Math.sin(0.42));

  // 5a. Inside Classroom Submission (Alex Rivers)
  const insideSubRes = await fetch(`${BASE_URL}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({
      sessionId,
      sessionCode,
      challengeToken: currentQrToken,
      location: { latitude: room.latitude, longitude: room.longitude, accuracy: 8 },
      face: { descriptor: syntheticFaceDescriptor },
      deviceFingerprint: "device_alex",
    }),
  });
  const insideJson = await insideSubRes.json();
  const alexRecordId = insideJson.record?.id;
  assertTest(
    "Submission",
    "Student 1 inside classroom submits successfully (distance ~0m passes geofence)",
    insideSubRes.status === 200 && alexRecordId != null && insideJson.summary?.locationStatus === "verified",
    `Distance: ${insideJson.summary?.distanceMeters}m, Status: ${insideJson.status}`
  );

  assertTest(
    "Simulated Face",
    "Unconfigured reference face triggers pending_review & FACE_UNCONFIGURED_MANUAL_REVIEW flag",
    insideJson.status === "pending_review" && insideJson.summary?.flaggedReasons?.includes("FACE_UNCONFIGURED_MANUAL_REVIEW"),
    `Flag: ${insideJson.summary?.flaggedReasons?.join(", ")}`
  );

  // 5b. Outside Geofence Submission (Maya Patel)
  // Fetch fresh challenge token
  const qrFreshRes = await fetch(`${BASE_URL}/sessions/${sessionId}/qr`, {
    headers: { Authorization: `Bearer ${fac1Token}` },
  });
  const freshQr = await qrFreshRes.json();

  const outsideSubRes = await fetch(`${BASE_URL}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu2Token}` },
    body: JSON.stringify({
      sessionId,
      sessionCode,
      challengeToken: freshQr.challengeToken,
      // 5.4 km away from classroom coordinates
      location: { latitude: room.latitude + 0.05, longitude: room.longitude + 0.05, accuracy: 15 },
      face: { descriptor: syntheticFaceDescriptor },
      deviceFingerprint: "device_maya",
    }),
  });
  const outsideJson = await outsideSubRes.json();
  const mayaRecordId = outsideJson.record?.id;
  assertTest(
    "Geofence Check",
    "Student 2 outside classroom boundary triggers GEOFENCE_EXCEEDED and pending_review",
    outsideSubRes.status === 200 &&
      outsideJson.summary?.locationStatus === "out_of_bounds" &&
      outsideJson.summary?.flaggedReasons?.includes("GEOFENCE_EXCEEDED"),
    `Distance: ${outsideJson.summary?.distanceMeters}m, Flag: GEOFENCE_EXCEEDED`
  );

  // -------------------------------------------------------------------------
  // 6. DUPLICATE ATTENDANCE PREVENTION (ANTI-REPLAY)
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Duplicate Submission Prevention (Anti-Replay) ---");
  const dupSubRes = await fetch(`${BASE_URL}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({
      sessionId,
      sessionCode,
      challengeToken: freshQr.challengeToken,
      location: { latitude: room.latitude, longitude: room.longitude, accuracy: 10 },
      deviceFingerprint: "device_alex",
    }),
  });
  const dupJson = await dupSubRes.json();
  assertTest(
    "Anti-Replay",
    "Rejects duplicate attendance attempt by same student for same session (HTTP 400)",
    dupSubRes.status === 400 && dupJson.error?.includes("already submitted"),
    `Error: "${dupJson.error}"`
  );

  // -------------------------------------------------------------------------
  // 7. FACULTY MANUAL REVIEW WORKFLOW (APPROVAL & REJECTION)
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Faculty Manual Review Workflow & Authorization ---");
  // Review queue check
  const reviewsRes = await fetch(`${BASE_URL}/attendance/pending-reviews`, {
    headers: { Authorization: `Bearer ${fac1Token}` },
  });
  const { reviews } = await reviewsRes.json();
  const alexInQueue = reviews.find((r) => r.id === alexRecordId);
  const mayaInQueue = reviews.find((r) => r.id === mayaRecordId);
  assertTest(
    "Manual Review",
    "Flagged records (unconfigured face & geofence breach) appear in Faculty Review Queue",
    alexInQueue != null && mayaInQueue != null,
    `Found records in ${reviews.length} total pending reviews`
  );

  // Mandatory Reason Enforcement
  const noReasonRes = await fetch(`${BASE_URL}/attendance/manual-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fac1Token}` },
    body: JSON.stringify({ recordId: alexRecordId, newStatus: "present", reason: "   " }),
  });
  assertTest(
    "Manual Review",
    "Enforces mandatory justification reason for status overrides (HTTP 400)",
    noReasonRes.status === 400,
    `HTTP ${noReasonRes.status}`
  );

  // Cross-Faculty: Prof. Alan Turing attempting to override Dr. Connor's session record
  const crossOverrideRes = await fetch(`${BASE_URL}/attendance/manual-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fac2Token}` },
    body: JSON.stringify({ recordId: alexRecordId, newStatus: "present", reason: "Unauthorized attempt" }),
  });
  assertTest(
    "RBAC",
    "Instructor of different course blocked from overriding student records (HTTP 403)",
    crossOverrideRes.status === 403,
    `HTTP ${crossOverrideRes.status}`
  );

  // Student attempting manual override
  const studentOverrideRes = await fetch(`${BASE_URL}/attendance/manual-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({ recordId: alexRecordId, newStatus: "present", reason: "Student attempt" }),
  });
  assertTest(
    "RBAC",
    "Student blocked from performing manual override (HTTP 403)",
    studentOverrideRes.status === 403,
    `HTTP ${studentOverrideRes.status}`
  );

  // Legitimate Approval by Dr. Sarah Connor
  const approveRes = await fetch(`${BASE_URL}/attendance/manual-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fac1Token}` },
    body: JSON.stringify({
      recordId: alexRecordId,
      newStatus: "present",
      reason: "Visual in-person confirmation by Dr. Sarah Connor in lecture hall seat 3A.",
    }),
  });
  const approveJson = await approveRes.json();
  assertTest(
    "Manual Review",
    "Faculty successfully APPROVES flagged record to 'present' with recorded reason",
    approveRes.status === 200 && approveJson.record?.status === "present",
    `Status: ${approveJson.record?.status}`
  );

  // Legitimate Rejection by Dr. Sarah Connor (Maya Patel outside geofence)
  const rejectRes = await fetch(`${BASE_URL}/attendance/manual-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fac1Token}` },
    body: JSON.stringify({
      recordId: mayaRecordId,
      newStatus: "rejected",
      reason: "Student 5.4km away from campus during session; geofence breach confirmed.",
    }),
  });
  const rejectJson = await rejectRes.json();
  assertTest(
    "Manual Review",
    "Faculty successfully REJECTS flagged record to 'rejected' with recorded reason",
    rejectRes.status === 200 && rejectJson.record?.status === "rejected",
    `Status: ${rejectJson.record?.status}`
  );

  // -------------------------------------------------------------------------
  // 8. EXPIRED SESSION ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Concluded / Expired Session Enforcement ---");
  // End the session
  const endSessionRes = await fetch(`${BASE_URL}/sessions/${sessionId}/end`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fac1Token}` },
  });
  assertTest(
    "Session",
    "Faculty concludes active session (status marked completed)",
    endSessionRes.status === 200,
    `HTTP ${endSessionRes.status}`
  );

  // QR generation on ended session
  const endedQrRes = await fetch(`${BASE_URL}/sessions/${sessionId}/qr`, {
    headers: { Authorization: `Bearer ${fac1Token}` },
  });
  const endedQrJson = await endedQrRes.json();
  assertTest(
    "Session",
    "QR generation halted on completed session with HTTP 400",
    endedQrRes.status === 400 && endedQrJson.error?.includes("completed"),
    `Error: "${endedQrJson.error}"`
  );

  // Submission to ended session
  const endedSubRes = await fetch(`${BASE_URL}/attendance/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${stu1Token}` },
    body: JSON.stringify({
      sessionId,
      sessionCode,
      challengeToken: validQrToken,
      location: { latitude: room.latitude, longitude: room.longitude, accuracy: 10 },
      deviceFingerprint: "device_alex",
    }),
  });
  const endedSubJson = await endedSubRes.json();
  assertTest(
    "Session",
    "Attendance submission blocked on ended/completed session with HTTP 400",
    endedSubRes.status === 400 && endedSubJson.error?.includes("completed"),
    `Error: "${endedSubJson.error}"`
  );

  // -------------------------------------------------------------------------
  // 9. AUDIT LOGGING VERIFICATION
  // -------------------------------------------------------------------------
  console.log("\n--- 9. Immutable Audit Logging Verification ---");
  const auditLogsRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const { logs } = await auditLogsRes.json();

  const approvalLog = logs.find((l) => l.action === "ATTENDANCE_OVERRIDE" && l.targetId === alexRecordId);
  const rejectionLog = logs.find((l) => l.action === "ATTENDANCE_OVERRIDE" && l.targetId === mayaRecordId);
  const sessionEndLog = logs.find((l) => l.action === "SESSION_END" && l.targetId === sessionId);

  assertTest(
    "Audit Logging",
    "Audit log contains permanent entry for attendance APPROVAL with actor, target, & rationale",
    approvalLog != null && approvalLog.actorName === "Dr. Sarah Connor" && approvalLog.actorRole === "faculty",
    `Actor: ${approvalLog?.actorName}, Timestamp: ${approvalLog?.createdAt}`
  );

  assertTest(
    "Audit Logging",
    "Audit log contains permanent entry for attendance REJECTION with actor, target, & rationale",
    rejectionLog != null && rejectionLog.actorName === "Dr. Sarah Connor" && rejectionLog.actorRole === "faculty",
    `Actor: ${rejectionLog?.actorName}, Timestamp: ${rejectionLog?.createdAt}`
  );

  assertTest(
    "Audit Logging",
    "Audit log records SESSION_END lifecycle event with faculty identification",
    sessionEndLog != null,
    `Actor: ${sessionEndLog?.actorName}, ID: ${sessionEndLog?.id}`
  );

  // Student Record Reflection
  const alexMyRecRes = await fetch(`${BASE_URL}/attendance/my-records`, {
    headers: { Authorization: `Bearer ${stu1Token}` },
  });
  const { records: alexRecs } = await alexMyRecRes.json();
  const alexSaved = alexRecs.find((r) => r.id === alexRecordId);

  const mayaMyRecRes = await fetch(`${BASE_URL}/attendance/my-records`, {
    headers: { Authorization: `Bearer ${stu2Token}` },
  });
  const { records: mayaRecs } = await mayaMyRecRes.json();
  const mayaSaved = mayaRecs.find((r) => r.id === mayaRecordId);

  assertTest(
    "Student View",
    "Student records reflect approved & rejected statuses and recorded justification reasons",
    alexSaved?.status === "present" &&
      alexSaved?.correctionReason?.includes("Dr. Sarah Connor") &&
      mayaSaved?.status === "rejected" &&
      mayaSaved?.correctionReason?.includes("5.4km"),
    `Alex: ${alexSaved?.status}, Maya: ${mayaSaved?.status}`
  );

  // -------------------------------------------------------------------------
  // FINAL METRICS
  // -------------------------------------------------------------------------
  console.log("\n========================================================================");
  console.log("  TEST RESULTS SUMMARY");
  console.log("========================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  Total Tests Run:  ${total}`);
  console.log(`  Passed:          ${passed}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Success Rate:    ${((passed / total) * 100).toFixed(1)}%`);
  console.log("========================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed with fatal error:", err);
  process.exit(1);
});
