import http from "http";

const BASE_URL = "http://127.0.0.1:5000";

function makeRequest(path, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(postData);
    }
    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAuthTests() {
  console.log("=== CampusVerify Auth & Registration Validation Suite ===");
  let passed = 0;
  let total = 0;

  function assert(desc, condition) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
    }
  }

  // 1. Test Demo Accounts endpoint
  const demoRes = await makeRequest("/api/auth/demo-accounts");
  assert("Demo accounts available", demoRes.status === 200 && demoRes.body.accounts?.length >= 3);

  // 2. Test Existing Demo Account Login
  const demoLogin = await makeRequest("/api/auth/login", "POST", {
    email: "alex.rivers@campusverify.edu",
    password: "Student@123",
  });
  assert("Demo student login succeeds", demoLogin.status === 200 && demoLogin.body.user?.role === "student");

  // 3. Test Invalid Password Login (Clear error, no crash)
  const badLogin = await makeRequest("/api/auth/login", "POST", {
    email: "alex.rivers@campusverify.edu",
    password: "WrongPassword!999",
  });
  assert("Invalid credentials return 401 with clear message", badLogin.status === 401 && badLogin.body.error?.includes("Invalid email or password"));

  // 4. Test Registration with Weak Password
  const weakPassReg = await makeRequest("/api/auth/register", "POST", {
    fullName: "Test User",
    email: `test-${Date.now()}@campusverify.edu`,
    password: "123",
    role: "student",
  });
  assert("Weak password (<6 chars) rejected with 400", weakPassReg.status === 400 && weakPassReg.body.error?.includes("at least 6 characters"));

  // 5. Test Successful Registration for Student
  const studentEmail = `sarah.test.${Date.now()}@campusverify.edu`;
  const regStudent = await makeRequest("/api/auth/register", "POST", {
    fullName: "Sarah Test Student",
    email: studentEmail,
    password: "SecurePassword@123",
    role: "student",
  });
  assert("Student registration succeeds (201)", regStudent.status === 201 && regStudent.body.user?.role === "student");
  assert("Student profile auto-assigned with ID", regStudent.body.user?.profile?.studentIdNumber?.startsWith("STU-"));

  // 6. Test Duplicate Email Registration Rejected
  const dupReg = await makeRequest("/api/auth/register", "POST", {
    fullName: "Duplicate User",
    email: studentEmail,
    password: "AnotherPassword@123",
    role: "student",
  });
  assert("Duplicate email registration returns 409 Conflict", dupReg.status === 409 && dupReg.body.error?.includes("already exists"));

  // 7. Test Login with Newly Registered Student
  const newStudentLogin = await makeRequest("/api/auth/login", "POST", {
    email: studentEmail,
    password: "SecurePassword@123",
  });
  assert("New student logs in successfully", newStudentLogin.status === 200 && newStudentLogin.body.user?.email === studentEmail.toLowerCase());

  // 8. Test Registration for Faculty Member
  const facultyEmail = `prof.watson.${Date.now()}@campusverify.edu`;
  const regFaculty = await makeRequest("/api/auth/register", "POST", {
    fullName: "Prof. John Watson",
    email: facultyEmail,
    password: "FacultySecret@456",
    role: "faculty",
  });
  assert("Faculty registration succeeds (201)", regFaculty.status === 201 && regFaculty.body.user?.role === "faculty");
  assert("Faculty profile auto-assigned with employee ID", regFaculty.body.user?.profile?.employeeId?.startsWith("FAC-"));

  // 9. Test Login with Newly Registered Faculty
  const newFacultyLogin = await makeRequest("/api/auth/login", "POST", {
    email: facultyEmail,
    password: "FacultySecret@456",
  });
  assert("New faculty logs in successfully with faculty dashboard access", newFacultyLogin.status === 200 && newFacultyLogin.body.user?.role === "faculty");

  console.log(`\nResults: ${passed}/${total} Auth & Registration tests passed!`);
  if (passed !== total) process.exit(1);
}

runAuthTests().catch((e) => {
  console.error("Test execution error:", e);
  process.exit(1);
});
