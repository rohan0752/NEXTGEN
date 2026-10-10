import { createClient } from "@libsql/client";

const CLIENT_API = "http://127.0.0.1:5173/api";
const SERVER_API = "http://127.0.0.1:5000/api";
const client = createClient({ url: "file:campusverify.db" });

async function run() {
  console.log("================================================================");
  console.log(" CAMPUSVERIFY: REGISTRATION & LOGIN FLOW VERIFICATION");
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

  // 1. Frontend API URL / Vite Proxy Check
  console.log("\n--- 1. Frontend API URL & Proxy Routing ---");
  const healthRes = await fetch(`${CLIENT_API}/health`);
  const healthData = await healthRes.json().catch(() => null);
  assert(
    healthRes.status === 200 && healthData?.status === "ok",
    `Frontend API proxy routes /api/health to backend (HTTP ${healthRes.status}, status: ${healthData?.status})`
  );

  // 2. Non-existent API route returns valid JSON (404)
  console.log("\n--- 2. Valid JSON for Error Responses & 404s ---");
  const notFoundRes = await fetch(`${CLIENT_API}/non-existent-endpoint`);
  const notFoundType = notFoundRes.headers.get("content-type") || "";
  const notFoundData = await notFoundRes.json().catch(() => null);
  assert(
    notFoundRes.status === 404 && notFoundData?.error,
    `Unmapped API route returns valid JSON with 404: "${notFoundData?.error}"`
  );

  // 3. Registration Validations Return Valid JSON
  console.log("\n--- 3. Registration Validations & Security ---");
  // Missing full name
  const missingNameRes = await fetch(`${CLIENT_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "invalid@campusverify.edu", password: "password123" }),
  });
  const missingNameData = await missingNameRes.json().catch(() => null);
  assert(
    missingNameRes.status === 400 && missingNameData?.error === "Full name is required.",
    `Missing name rejected with JSON 400: "${missingNameData?.error}"`
  );

  // Password < 6 chars
  const shortPassRes = await fetch(`${CLIENT_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Short Pass", email: "short@campusverify.edu", password: "123" }),
  });
  const shortPassData = await shortPassRes.json().catch(() => null);
  assert(
    shortPassRes.status === 400 && shortPassData?.error?.includes("at least 6 characters"),
    `Short password rejected with JSON 400: "${shortPassData?.error}"`
  );

  // Admin self-registration blocked
  const adminRegRes = await fetch(`${CLIENT_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Impostor Admin",
      email: "impostor@campusverify.edu",
      password: "password123",
      role: "admin",
    }),
  });
  const adminRegData = await adminRegRes.json().catch(() => null);
  assert(
    adminRegRes.status === 403 && adminRegData?.error?.includes("Administrator"),
    `Admin self-registration blocked with JSON 403: "${adminRegData?.error}"`
  );

  // 4. Successful Student Registration
  console.log("\n--- 4. Persistent Student Registration & Password Hashing ---");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  const studentEmail = `student.${rand}@campusverify.edu`;
  const rawPassword = "StrongPassword@2026";
  const fullName = `Taylor Swift ${rand}`;

  const regRes = await fetch(`${CLIENT_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName,
      email: studentEmail,
      password: rawPassword,
      role: "student",
    }),
  });
  const regData = await regRes.json().catch(() => null);
  assert(
    regRes.status === 201 && regData?.success && regData?.token && regData?.user,
    `Registration returns valid JSON 201 with auth token and student user (ID: ${regData?.user?.id})`
  );

  const studentIdNumber = regData?.user?.profile?.studentIdNumber;
  assert(
    studentIdNumber && studentIdNumber.startsWith("STU-"),
    `Auto-provisioned Student ID Number in database: ${studentIdNumber}`
  );

  // Verify DB record directly: password is hashed with bcrypt, NEVER plaintext
  const dbResult = await client.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [studentEmail],
  });
  const dbUser = dbResult.rows[0];
  assert(dbUser, "User record persisted in SQLite database");
  assert(
    String(dbUser.password_hash).startsWith("$2a$") || String(dbUser.password_hash).startsWith("$2b$"),
    `Password stored as bcrypt hash in DB: ${String(dbUser.password_hash).substring(0, 16)}...`
  );
  assert(!JSON.stringify(dbUser).includes(rawPassword), "Raw password NEVER stored in plaintext");

  // Duplicate email registration rejected with 409
  const dupRes = await fetch(`${CLIENT_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Duplicate User",
      email: studentEmail,
      password: rawPassword,
    }),
  });
  const dupData = await dupRes.json().catch(() => null);
  assert(
    dupRes.status === 409 && dupData?.error?.includes("already exists"),
    `Duplicate email rejected with JSON 409: "${dupData?.error}"`
  );

  // 5. Login with newly registered credentials
  console.log("\n--- 5. Login Verification (Email & Student ID) ---");
  // Login with Email
  const loginEmailRes = await fetch(`${CLIENT_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentEmail, password: rawPassword }),
  });
  const loginEmailData = await loginEmailRes.json().catch(() => null);
  assert(
    loginEmailRes.status === 200 && loginEmailData?.token && loginEmailData?.user?.email === studentEmail,
    `Login with registered email succeeds (HTTP 200, User: ${loginEmailData?.user?.fullName})`
  );

  // Login with Student ID Number
  const loginStuIdRes = await fetch(`${CLIENT_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentIdNumber, password: rawPassword }),
  });
  const loginStuIdData = await loginStuIdRes.json().catch(() => null);
  assert(
    loginStuIdRes.status === 200 && loginStuIdData?.token,
    `Login with Student ID Number (${studentIdNumber}) succeeds (HTTP 200)`
  );

  // Login with wrong password returns clear error
  const loginWrongPassRes = await fetch(`${CLIENT_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: studentEmail, password: "IncorrectPassword123" }),
  });
  const loginWrongPassData = await loginWrongPassRes.json().catch(() => null);
  assert(
    loginWrongPassRes.status === 401 && loginWrongPassData?.error,
    `Wrong password rejected with JSON 401: "${loginWrongPassData?.error}"`
  );

  // 6. Role Authorization: Student cannot access Admin or Faculty dashboards/APIs
  console.log("\n--- 6. Role-Based Access Control (RBAC) ---");
  const studentToken = loginEmailData.token;

  // Student trying to access admin stats -> 403 Forbidden
  const adminStatsRes = await fetch(`${CLIENT_API}/admin/stats`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const adminStatsData = await adminStatsRes.json().catch(() => null);
  assert(
    adminStatsRes.status === 403 && adminStatsData?.error,
    `Student blocked from Admin stats API with JSON 403: "${adminStatsData?.error}"`
  );

  // Student trying to access faculty pending reviews -> 403 Forbidden
  const facultyQueueRes = await fetch(`${CLIENT_API}/attendance/pending-reviews`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const facultyQueueData = await facultyQueueRes.json().catch(() => null);
  assert(
    facultyQueueRes.status === 403 && facultyQueueData?.error,
    `Student blocked from Faculty review queue with JSON 403: "${facultyQueueData?.error}"`
  );

  // Student trying to create courses -> 403 Forbidden
  const courseCreateRes = await fetch(`${CLIENT_API}/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ code: "HACK99", name: "Hacked Course", department: "CS", facultyId: "fake" }),
  });
  const courseCreateData = await courseCreateRes.json().catch(() => null);
  assert(
    courseCreateRes.status === 403 && courseCreateData?.error,
    `Student blocked from creating courses with JSON 403: "${courseCreateData?.error}"`
  );

  console.log("\n================================================================");
  console.log(` SUMMARY: ${passed} passed, ${failed} failed (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log("================================================================");

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
