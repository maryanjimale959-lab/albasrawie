import { db } from "./db";

/** Create in-app notifications for one or many users. Never claims email delivery. */
export async function notify(userIds, type, message, link = null) {
  const stmt = db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)");
  for (const id of new Set([userIds].flat().filter(Boolean))) await stmt.run(id, type, message, link);
}

export async function notifyCourse(courseId, type, message, link, { excludeUser = null, studentsOnly = true } = {}) {
  const rows = await db.prepare(`SELECT ${studentsOnly ? "e.student_id" : "c.teacher_id"} AS uid
    FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.course_id = ? AND e.status = 'active'`).all(courseId);
  const ids = rows.map((r) => r.uid).filter((u) => u && u !== excludeUser);
  if (studentsOnly) {
    const t = await db.prepare("SELECT teacher_id FROM courses WHERE id = ?").get(courseId);
    if (t?.teacher_id && t.teacher_id !== excludeUser) ids.push(t.teacher_id);
  }
  await notify(ids, type, message, link);
}
