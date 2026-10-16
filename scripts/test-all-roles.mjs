import crypto from "crypto";
import { db, closeDb } from "../lib/db.js";

const base = process.env.BASE_URL || "http://localhost:3000";

async function makeSession(email) {
  const u = await db.prepare("SELECT id, role, status FROM users WHERE email = ?").get(email);
  if (!u) throw new Error(`User not found: ${email}`);
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + 864e5).toISOString();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)")
    .run(tokenHash, u.id, expires);
  return { token, user: u };
}

let passed = 0;
let failed = 0;

async function testRoute(name, path, token, expectedStatus, expectedContentMatch = null) {
  try {
    const headers = token ? { cookie: `albasrawie_session=${token}` } : {};
    const res = await fetch(base + path, { headers, redirect: "manual" });
    const text = await res.text();
    const loc = res.headers.get("location") || "";
    
    let isOk = false;
    if (typeof expectedStatus === "number") {
      isOk = res.status === expectedStatus;
    } else if (expectedStatus === "redirect-login") {
      isOk = res.status === 307 && loc.includes("/login");
    } else if (expectedStatus === "redirect-dashboard") {
      isOk = res.status === 307 && loc.includes("/dashboard");
    } else if (expectedStatus === "redirect-admin") {
      isOk = res.status === 307 && loc.includes("/admin");
    } else if (expectedStatus === "redirect-projects") {
      isOk = res.status === 307 && (loc.includes("/projects") || loc === "/projects");
    }

    if (isOk && expectedContentMatch) {
      if (!text.toLowerCase().includes(expectedContentMatch.toLowerCase())) {
        isOk = false;
        console.log(`[FAIL] ${name} (${path}): Content missing "${expectedContentMatch}"`);
      }
    }

    if (isOk) {
      console.log(`[PASS] ${name} [${res.status}]`);
      passed++;
    } else {
      console.log(`[FAIL] ${name} (${path}): Got status ${res.status}, Location: ${loc}`);
      failed++;
    }
  } catch (err) {
    console.log(`[ERROR] ${name} (${path}): ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log("=== CREATING TEST SESSIONS ===");
  const admin = await makeSession("admin@example.com");
  const teacher = await makeSession("teacher@demo.albasrawie.app");
  const student = await makeSession("student1@demo.albasrawie.app");

  console.log("\n=== 1. PUBLIC ROUTES ===");
  await testRoute("Public Home", "/", null, 200);
  await testRoute("Login Page", "/login", null, 200, "Sign in");
  await testRoute("Teacher Sign-in Page", "/login?as=teacher", null, 200, "Teacher sign in");
  await testRoute("Student Register Page", "/register", null, 200, "Create your student account");
  await testRoute("Teacher Register Page", "/register/teacher", null, 200, "Create your teacher account");
  await testRoute("Teach Landing Page", "/teach", null, 200, "Teach a whole term");

  console.log("\n=== 2. ADMIN ROLE ACCESS ===");
  await testRoute("Admin Overview", "/admin", admin.token, 200, "Administrator");
  await testRoute("Admin Accounts", "/admin/accounts", admin.token, 200, "Accounts");
  await testRoute("Admin Courses", "/admin/courses", admin.token, 200, "Courses");
  await testRoute("Admin Audit Log", "/admin/audit", admin.token, 200, "Activity log");
  await testRoute("Admin Account Detail (self)", `/admin/accounts/${admin.user.id}`, admin.token, 200);
  await testRoute("Admin Account Detail (teacher)", `/admin/accounts/${teacher.user.id}`, admin.token, 200);
  await testRoute("Admin Account Detail (student)", `/admin/accounts/${student.user.id}`, admin.token, 200);
  await testRoute("Admin visiting /dashboard redirects to /admin", "/dashboard", admin.token, "redirect-admin");

  console.log("\n=== 3. TEACHER ROLE ACCESS ===");
  await testRoute("Teacher Dashboard", "/dashboard", teacher.token, 200, "Teacher");
  await testRoute("Teacher Courses", "/courses", teacher.token, 200, "Courses");
  await testRoute("Teacher New Course", "/courses/new", teacher.token, 200, "Create a course");
  await testRoute("Teacher Course Detail", "/courses/1", teacher.token, 200);
  await testRoute("Teacher Course Members", "/courses/1/members", teacher.token, 200);
  await testRoute("Teacher Course Materials", "/courses/1/materials", teacher.token, 200);
  await testRoute("Teacher Course Announcements", "/courses/1/announcements", teacher.token, 200);
  await testRoute("Teacher Course Attendance", "/courses/1/attendance", teacher.token, 200);
  await testRoute("Teacher Assignments", "/assignments", teacher.token, 200);
  await testRoute("Teacher New Assignment", "/assignments/new", teacher.token, 200);
  await testRoute("Teacher Projects", "/projects", teacher.token, 200);
  await testRoute("Teacher New Project", "/projects/new", teacher.token, 200);
  await testRoute("Teacher Grades", "/grades", teacher.token, 200);
  await testRoute("Teacher Students List", "/students", teacher.token, 200);
  await testRoute("Teacher Student Profile", `/students/${student.user.id}`, teacher.token, 200);
  await testRoute("Teacher Analytics", "/analytics", teacher.token, 200);
  await testRoute("Teacher Settings", "/settings", teacher.token, 200);
  await testRoute("Teacher Notifications", "/notifications", teacher.token, 200);
  await testRoute("Teacher on /admin shows WrongRole message", "/admin", teacher.token, 200, "belongs to the administrator");

  console.log("\n=== 4. STUDENT ROLE ACCESS ===");
  await testRoute("Student Dashboard", "/dashboard", student.token, 200, "streak");
  await testRoute("Student Profile", "/profile", student.token, 200, "streak");
  await testRoute("Student Courses", "/courses", student.token, 200);
  await testRoute("Student Enrolled Course", "/courses/1", student.token, 200);
  await testRoute("Student Course Members", "/courses/1/members", student.token, 200);
  await testRoute("Student Course Materials", "/courses/1/materials", student.token, 200);
  await testRoute("Student Course Announcements", "/courses/1/announcements", student.token, 200);
  await testRoute("Student Assignments", "/assignments", student.token, 200);
  await testRoute("Student Projects", "/projects", student.token, 200);
  await testRoute("Student Personal Projects", "/projects/personal", student.token, "redirect-projects");
  await testRoute("Student Activity Log", "/activity", student.token, 200);
  await testRoute("Student Join Course", "/join", student.token, 200);
  await testRoute("Student Attendance Join", "/attendance/join", student.token, 200);
  await testRoute("Student Grades", "/grades", student.token, 200);
  await testRoute("Student Settings", "/settings", student.token, 200);
  await testRoute("Student Notifications", "/notifications", student.token, 200);
  await testRoute("Student on /admin shows WrongRole message", "/admin", student.token, 200, "belongs to the administrator");
  await testRoute("Student blocked from /students", "/students", student.token, "redirect-dashboard");
  await testRoute("Student blocked from /assignments/new", "/assignments/new", student.token, "redirect-dashboard");
  await testRoute("Student blocked from /projects/new", "/projects/new", student.token, "redirect-dashboard");
  await testRoute("Student blocked from /analytics", "/analytics", student.token, "redirect-dashboard");

  console.log("\n=== 5. AUTHENTICATION & SECURITY CHECKS ===");
  await testRoute("Unauthenticated /dashboard redirects to /login", "/dashboard", null, "redirect-login");
  await testRoute("Unauthenticated /settings redirects to /login", "/settings", null, "redirect-login");
  await testRoute("Unauthenticated /admin redirects to /login", "/admin", null, "redirect-login");
  await testRoute("Unauthenticated /courses/new redirects to /login", "/courses/new", null, "redirect-login");

  console.log(`\n========================================`);
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  console.log(`========================================`);

  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
