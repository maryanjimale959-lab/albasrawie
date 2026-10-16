// Smoke helper: prints session tokens for the demo teacher + student1 so
// authenticated pages can be curl-tested. Usage: node scripts/smoke-session.mjs
import crypto from "crypto";
import { db, closeDb } from "../lib/db.js";

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

async function makeSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 14 * 864e5);
  await db.prepare("REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)")
    .run(sha(token), userId, expires.toISOString());
  return token;
}

const teacher = await db.prepare("SELECT * FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1").get();
const student = await db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY id LIMIT 1").get();

if (!teacher || !student) {
  console.log("NO_DEMO_DATA");
} else {
  const teacherToken = await makeSession(teacher.id);
  const studentToken = await makeSession(student.id);
  console.log("TEACHER_TOKEN=" + teacherToken);
  console.log("STUDENT_TOKEN=" + studentToken);
  console.log("TEACHER=" + teacher.email);
  console.log("STUDENT=" + student.email);
  console.log("COURSES=" + (await db.prepare("SELECT COUNT(*) n FROM courses").get()).n);
  console.log("ACTIVITIES=" + (await db.prepare("SELECT COUNT(*) n FROM learning_activities").get()).n);
}
await closeDb();
