import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = path.join(process.cwd(), "data", "albasrawie.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = OFF");

db.transaction(() => {
  db.prepare(`DELETE FROM course_settings WHERE course_id NOT IN (SELECT id FROM courses)`).run();
  db.prepare(`DELETE FROM personal_projects WHERE student_id NOT IN (SELECT id FROM users)`).run();
  db.prepare(`DELETE FROM project_submissions WHERE student_id NOT IN (SELECT id FROM users) OR project_id NOT IN (SELECT id FROM projects)`).run();
  db.prepare(`DELETE FROM learning_activities WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM courses)`).run();
  db.prepare(`DELETE FROM attendance_records WHERE student_id NOT IN (SELECT id FROM users) OR session_id NOT IN (SELECT id FROM attendance_sessions)`).run();
  db.prepare(`DELETE FROM enrollments WHERE student_id NOT IN (SELECT id FROM users) OR course_id NOT IN (SELECT id FROM courses)`).run();
  db.prepare(`DELETE FROM course_codes WHERE course_id NOT IN (SELECT id FROM courses)`).run();
})();

db.pragma("foreign_keys = ON");
const fkCheck = db.pragma("foreign_key_check");
if (fkCheck.length > 0) {
  console.warn("Remaining FK issues:", fkCheck);
} else {
  console.log("Foreign keys 100% clean and consistent!");
}

console.log("\n=== FINAL ACCOUNTS IN DATABASE ===");
const users = db.prepare("SELECT id, full_name, email, role, status FROM users").all();
users.forEach(u => console.log(` - ID ${u.id}: [${u.role}] ${u.full_name} (${u.email})`));

db.pragma("vacuum");
db.close();
