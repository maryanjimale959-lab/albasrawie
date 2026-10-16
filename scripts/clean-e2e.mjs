// Remove all e2e.*@test.local users and their data (dev helper; deletes run child tables first).
import { db, closeDb } from "../lib/db.js";

const ids = (await db.prepare("SELECT id FROM users WHERE email LIKE ?").all("e2e.%@test.local")).map((r) => r.id);
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
  ]) await db.prepare(sql).run();
}

const tc = ids.length ? (await db.prepare(`SELECT id FROM courses WHERE teacher_id IN (${ids.join(",")})`).all()).map((r) => r.id) : [];
const named = (await db.prepare("SELECT id FROM courses WHERE name LIKE ?").all("E2E %")).map((r) => r.id);
const cs = [...new Set([...tc, ...named])];
for (const c of cs) {
  const as = (await db.prepare("SELECT id FROM assignments WHERE course_id=?").all(c)).map((r) => r.id);
  const ps = (await db.prepare("SELECT id FROM projects WHERE course_id=?").all(c)).map((r) => r.id);
  if (as.length) await db.prepare(`DELETE FROM assignment_submissions WHERE assignment_id IN (${as.join(",")})`).run();
  await db.prepare("DELETE FROM assignments WHERE course_id=?").run(c);
  if (ps.length) {
    await db.prepare(`DELETE FROM project_submissions WHERE project_id IN (${ps.join(",")})`).run();
    await db.prepare(`DELETE FROM project_progress WHERE project_id IN (${ps.join(",")})`).run();
    await db.prepare(`DELETE FROM project_milestones WHERE project_id IN (${ps.join(",")})`).run();
  }
  await db.prepare("DELETE FROM projects WHERE course_id=?").run(c);
  const ss = (await db.prepare("SELECT id FROM attendance_sessions WHERE course_id=?").all(c)).map((r) => r.id);
  if (ss.length) await db.prepare(`DELETE FROM attendance_records WHERE session_id IN (${ss.join(",")})`).run();
  await db.prepare("DELETE FROM attendance_sessions WHERE course_id=?").run(c);
  for (const t of ["materials", "announcements", "course_settings", "course_codes", "enrollments", "learning_activities", "files"])
    await db.prepare(`DELETE FROM ${t} WHERE course_id=?`).run(c);
  await db.prepare("DELETE FROM courses WHERE id=?").run(c);
}

await db.prepare("DELETE FROM users WHERE email LIKE ?").run("e2e.%@test.local");
console.log(`cleaned users=${ids.length} courses=${cs.length}`);
await closeDb();
