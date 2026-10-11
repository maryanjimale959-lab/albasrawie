// Remove all e2e.*@test.local users and their data (dev helper; FKs off for the delete pass only).
import Database from "better-sqlite3";

const db = new Database("data/albasrawie.db", { fileMustExist: true });
db.pragma("foreign_keys = OFF");

const ids = db.prepare("SELECT id FROM users WHERE email LIKE ?").all("e2e.%@test.local").map((r) => r.id);
if (ids.length) {
  const ph = ids.join(",");
  for (const sql of [
    `DELETE FROM sessions WHERE user_id IN (${ph})`,
    `DELETE FROM notifications WHERE user_id IN (${ph})`,
    `DELETE FROM enrollments WHERE student_id IN (${ph})`,
    `DELETE FROM learning_activities WHERE student_id IN (${ph})`,
    `DELETE FROM study_logs WHERE student_id IN (${ph})`,
    `DELETE FROM personal_projects WHERE student_id IN (${ph})`,
    `DELETE FROM assignment_submissions WHERE student_id IN (${ph})`,
    `DELETE FROM project_submissions WHERE student_id IN (${ph})`,
    `DELETE FROM project_progress WHERE student_id IN (${ph})`,
    `DELETE FROM attendance_records WHERE student_id IN (${ph})`,
    `DELETE FROM student_profiles WHERE user_id IN (${ph})`,
    `DELETE FROM teacher_profiles WHERE user_id IN (${ph})`,
    `DELETE FROM audit_logs WHERE user_id IN (${ph})`,
    `DELETE FROM files WHERE owner_id IN (${ph})`,
  ]) db.prepare(sql).run();
}

const tc = ids.length ? db.prepare(`SELECT id FROM courses WHERE teacher_id IN (${ids.join(",")})`).all().map((r) => r.id) : [];
const named = db.prepare("SELECT id FROM courses WHERE name LIKE ?").all("E2E %").map((r) => r.id);
const cs = [...new Set([...tc, ...named])];
for (const c of cs) {
  const as = db.prepare("SELECT id FROM assignments WHERE course_id=?").all(c).map((r) => r.id);
  const ps = db.prepare("SELECT id FROM projects WHERE course_id=?").all(c).map((r) => r.id);
  if (as.length) db.prepare(`DELETE FROM assignment_submissions WHERE assignment_id IN (${as.join(",")})`).run();
  db.prepare("DELETE FROM assignments WHERE course_id=?").run(c);
  if (ps.length) {
    db.prepare(`DELETE FROM project_submissions WHERE project_id IN (${ps.join(",")})`).run();
    db.prepare(`DELETE FROM project_progress WHERE project_id IN (${ps.join(",")})`).run();
    db.prepare(`DELETE FROM project_milestones WHERE project_id IN (${ps.join(",")})`).run();
  }
  db.prepare("DELETE FROM projects WHERE course_id=?").run(c);
  const ss = db.prepare("SELECT id FROM attendance_sessions WHERE course_id=?").all(c).map((r) => r.id);
  if (ss.length) db.prepare(`DELETE FROM attendance_records WHERE session_id IN (${ss.join(",")})`).run();
  db.prepare("DELETE FROM attendance_sessions WHERE course_id=?").run(c);
  for (const t of ["materials", "announcements", "course_settings", "course_codes", "enrollments", "learning_activities", "files"])
    db.prepare(`DELETE FROM ${t} WHERE course_id=?`).run(c);
  db.prepare("DELETE FROM courses WHERE id=?").run(c);
}

db.prepare("DELETE FROM users WHERE email LIKE ?").run("e2e.%@test.local");
db.pragma("foreign_keys = ON");
console.log(`cleaned users=${ids.length} courses=${cs.length}`);
