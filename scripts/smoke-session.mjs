// Smoke helper: prints session tokens for the demo teacher + student1 so
// authenticated pages can be curl-tested. Usage: node scripts/smoke-session.mjs
import crypto from "crypto";
import { db } from "../lib/db.js";

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

function makeSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 14 * 864e5);
  db.prepare("INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)")
    .run(sha(token), userId, expires.toISOString());
  return token;
}

const teacher = db.prepare("SELECT * FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1").get();
const student = db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY id LIMIT 1").get();

if (!teacher || !student) {
  console.log("NO_DEMO_DATA");
} else {
  console.log("TEACHER_TOKEN=" + makeSession(teacher.id));
  console.log("STUDENT_TOKEN=" + makeSession(student.id));
  console.log("TEACHER=" + teacher.email);
  console.log("STUDENT=" + student.email);
  console.log("COURSES=" + db.prepare("SELECT COUNT(*) n FROM courses").get().n);
  console.log("ACTIVITIES=" + db.prepare("SELECT COUNT(*) n FROM learning_activities").get().n);
}
