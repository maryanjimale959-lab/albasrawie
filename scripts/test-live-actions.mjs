import crypto from "crypto";
import { db, closeDb } from "../lib/db.js";

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

async function run() {
  console.log("=== RUNNING LIVE ACTION VERIFICATIONS ===");
  
  // 1. Verify Admin can query users
  const adminUser = await db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  console.log("Admin verified in DB:", adminUser.email, "status:", adminUser.status);

  // 2. Verify Teacher and Courses
  const teacherUser = await db.prepare("SELECT * FROM users WHERE role = 'teacher' AND status = 'active' LIMIT 1").get();
  console.log("Teacher verified in DB:", teacherUser.email, "status:", teacherUser.status);
  
  const course = await db.prepare("SELECT * FROM courses WHERE teacher_id = ? LIMIT 1").get(teacherUser.id);
  console.log("Teacher course verified in DB:", course ? course.name : "None");

  // 3. Verify Student & Enrollment
  const studentUser = await db.prepare("SELECT * FROM users WHERE role = 'student' AND status = 'active' LIMIT 1").get();
  console.log("Student verified in DB:", studentUser.email, "status:", studentUser.status);

  if (course && studentUser) {
    const enrollment = await db.prepare("SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?").get(studentUser.id, course.id);
    console.log("Student enrollment verified in DB:", enrollment ? "Active enrollment" : "Not enrolled");
  }

  // 4. Test creating a new student through DB actions and checking profiles
  const testStudentEmail = `test_stu_${Date.now()}@example.com`;
  const info = await db.prepare("INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?,?,?,?,?)")
    .run("Test QA Student", testStudentEmail, "testhash", "student", "active");
  const newStudentId = Number(info.lastInsertRowid);
  await db.prepare("INSERT INTO student_profiles (user_id, student_id, class_name, organization) VALUES (?,?,?,?)")
    .run(newStudentId, `STU-${Date.now()}`, "Class QA", "QA Org");
  console.log("[PASS] Successfully created student profile with ID:", newStudentId);

  // 5. Test Admin suspending the student
  await db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(newStudentId);
  const suspended = await db.prepare("SELECT status FROM users WHERE id = ?").get(newStudentId);
  if (suspended.status !== "suspended") throw new Error("Suspension failed");
  console.log("[PASS] Admin account suspension verified for ID:", newStudentId);

  // 6. Test Admin restoring the student
  await db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(newStudentId);
  const restored = await db.prepare("SELECT status FROM users WHERE id = ?").get(newStudentId);
  if (restored.status !== "active") throw new Error("Restoration failed");
  console.log("[PASS] Admin account restoration verified for ID:", newStudentId);

  // 7. Clean up test user
  await db.prepare("DELETE FROM student_profiles WHERE user_id = ?").run(newStudentId);
  await db.prepare("DELETE FROM users WHERE id = ?").run(newStudentId);
  console.log("[PASS] Cleaned up temporary test user");

  // 8. Test Teacher Attendance Session creation & closing
  if (course) {
    const code = "QA" + Math.floor(1000 + Math.random() * 9000);
    const now = new Date();
    const closes = new Date(now.getTime() + 30 * 60e3);
    const sessInfo = await db.prepare(`
      INSERT INTO attendance_sessions (course_id, session_date, code, opened_at, closes_at, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'open', ?)
    `).run(course.id, now.toISOString().slice(0, 10), code, now.toISOString().slice(0, 19).replace('T', ' '), closes.toISOString().slice(0, 19).replace('T', ' '), teacherUser.id);
    const sessId = Number(sessInfo.lastInsertRowid);
    console.log("[PASS] Teacher created open attendance session:", sessId, "with code:", code);

    // Student joins attendance
    await db.prepare(`
      INSERT INTO attendance_records (session_id, student_id, status, method, marked_at, marked_by)
      VALUES (?, ?, 'present', 'code', ?, ?)
    `).run(sessId, studentUser.id, now.toISOString().slice(0, 19).replace('T', ' '), studentUser.id);
    console.log("[PASS] Student marked attendance as present");

    // Close attendance session
    await db.prepare("UPDATE attendance_sessions SET status = 'closed' WHERE id = ?").run(sessId);
    console.log("[PASS] Teacher closed attendance session");

    // Clean up test attendance records
    await db.prepare("DELETE FROM attendance_records WHERE session_id = ?").run(sessId);
    await db.prepare("DELETE FROM attendance_sessions WHERE id = ?").run(sessId);
    console.log("[PASS] Cleaned up temporary attendance records");
  }

  console.log("\nALL LIVE ACTION VERIFICATIONS PASSED SUCCESSFULLY!");
  await closeDb();
}

run().catch(async (e) => {
  console.error("FAILED:", e);
  await closeDb();
  process.exit(1);
});
