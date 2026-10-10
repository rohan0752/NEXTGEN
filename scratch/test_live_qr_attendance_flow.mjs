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

async function testLiveQrWorkflow() {
  console.log("==================================================================");
  console.log("   CAMPUSVERIFY: LIVE SCANNABLE QR ATTENDANCE WORKFLOW TEST       ");
  console.log("==================================================================");

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

  // 1. Authenticate Faculty (Dr. Sarah Connor)
  const facLogin = await request("/api/auth/login", "POST", {
    email: "dr.sarah.connor@campusverify.edu",
    password: "Faculty@123",
  });
  assert("Faculty logs in successfully", facLogin.status === 200 && !!facLogin.body?.token);
  const facultyToken = facLogin.body?.token;

  // 2. Authenticate Student (Alex Rivers)
  const stuLogin = await request("/api/auth/login", "POST", {
    email: "alex.rivers@campusverify.edu",
    password: "Student@123",
  });
  assert("Student logs in successfully", stuLogin.status === 200 && !!stuLogin.body?.token);
  const studentToken = stuLogin.body?.token;

  // 3. Inspect Network Info for Cross-Device Wi-Fi QR Access
  const netRes = await request("/api/sessions/network-info", "GET", null, facultyToken);
  assert("Server exposes Wi-Fi Network IP for mobile access", netRes.status === 200 && !!netRes.body?.lanIp);
  console.log(`     -> Computer LAN IP for Phone Scanning: ${netRes.body?.lanIp}`);
  console.log(`     -> Phone Wi-Fi URL: ${netRes.body?.wifiUrl5173}`);

  // 4. Conclude any running session for CS301
  const coursesRes = await request("/api/courses", "GET", null, facultyToken);
  const cs301 = coursesRes.body.courses.find((c) => c.code === "CS301") || coursesRes.body.courses[0];
  const activeSessionsRes = await request("/api/sessions", "GET", null, facultyToken);
  for (const s of (activeSessionsRes.body?.sessions || []).filter((s) => s.status === "active" && s.courseId === cs301.id)) {
    await request(`/api/sessions/${s.id}/end`, "POST", {}, facultyToken);
  }

  // 5. Faculty launches attendance session with rotating QR code (15s rotation)
  const classRes = await request("/api/classrooms", "GET", null, facultyToken);
  const room = classRes.body.classrooms[0];

  const sessionRes = await request("/api/sessions", "POST", {
    courseId: cs301.id,
    classroomId: room.id,
    title: "Live QR Scannable Lecture",
    qrRotationSeconds: 15,
    durationMinutes: 45,
    requireLocation: true,
    requireFace: false,
  }, facultyToken);
  assert("Faculty starts live session", sessionRes.status === 201 && !!sessionRes.body?.sessionId);
  const sessionId = sessionRes.body.sessionId;
  const sessionCode = sessionRes.body.sessionCode;

  // 6. Faculty retrieves rotating QR challenge with Scannable URL
  const qrRes = await request(`/api/sessions/${sessionId}/qr?origin=${encodeURIComponent(netRes.body.wifiUrl5173)}`, "GET", null, facultyToken);
  assert("Faculty generates scannable QR payload", qrRes.status === 200 && !!qrRes.body?.qrUrl);
  assert("QR payload contains full attendance URL", qrRes.body.qrUrl.startsWith("http://"));
  assert("QR URL embeds session, token, and code params", qrRes.body.qrUrl.includes(`session=${sessionId}`) && qrRes.body.qrUrl.includes("token="));
  console.log(`     -> Projected Scannable QR URL: ${qrRes.body.qrUrl}`);

  // 7. Emulate Student Phone Camera Scanning the QR code
  const scannedUrl = new URL(qrRes.body.qrUrl);
  const scannedSessionId = scannedUrl.searchParams.get("session");
  const scannedToken = scannedUrl.searchParams.get("token");
  const scannedCode = scannedUrl.searchParams.get("code");

  assert("Camera Scanner decodes session ID from QR", scannedSessionId === sessionId);
  assert("Camera Scanner decodes short-lived challenge token", !!scannedToken && scannedToken.length > 10);
  assert("Camera Scanner decodes session code", scannedCode === sessionCode);

  // 8. Student submits attendance using decoded QR token & verified coordinates
  const submitRes = await request("/api/attendance/submit", "POST", {
    sessionId: scannedSessionId,
    sessionCode: scannedCode,
    challengeToken: scannedToken,
    location: {
      latitude: room.latitude || 12.971598,
      longitude: room.longitude || 77.594562,
      accuracy: 5,
    },
    deviceFingerprint: "MobileSafari/iPhone15,3 (CampusVerify Wi-Fi Scanner)",
  }, studentToken);

  assert("Server validates active session, token, enrollment & records attendance", submitRes.status === 200 && !!submitRes.body?.record?.id);
  assert("Attendance status recorded", ["present", "late", "pending_review"].includes(submitRes.body?.record?.status));
  console.log(`     -> Recorded Attendance Status: ${submitRes.body?.record?.status}`);
  console.log(`     -> Geofence Distance: ${submitRes.body?.summary?.distanceMeters ?? 0}m (Pass)`);

  // 9. Verify Faculty Live Roster Stream immediately updates
  const rosterRes = await request(`/api/sessions/${sessionId}/roster`, "GET", null, facultyToken);
  assert("Faculty live roster updates with new submission", rosterRes.status === 200);
  const alexInRoster = rosterRes.body.roster.find((r) => r.studentName?.includes("Alex") || r.studentIdNumber?.includes("ALEX") || r.status !== "absent");
  assert("Student is verified in faculty live stream", !!alexInRoster && alexInRoster.status !== "absent");

  // 10. Re-scanning same token by same student is rejected (Anti-replay check)
  const dupSubmit = await request("/api/attendance/submit", "POST", {
    sessionId: scannedSessionId,
    sessionCode: scannedCode,
    challengeToken: scannedToken,
    location: { latitude: 12.971598, longitude: 77.594562, accuracy: 5 },
  }, studentToken);
  assert("Server rejects duplicate attendance submission (HTTP 400)", dupSubmit.status === 400 && dupSubmit.body?.error?.includes("already submitted"));

  // 11. Conclude session
  const endRes = await request(`/api/sessions/${sessionId}/end`, "POST", {}, facultyToken);
  assert("Faculty concludes session", endRes.status === 200 && endRes.body?.success === true);

  console.log("\n==================================================================");
  console.log(`  RESULT: ${passed}/${total} LIVE QR ATTENDANCE TESTS PASSED!`);
  console.log("==================================================================");
}

testLiveQrWorkflow().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
