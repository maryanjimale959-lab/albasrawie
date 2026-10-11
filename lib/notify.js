import { db } from "./db";

/** Create in-app notifications for one or many users. Never claims email delivery. */
export function notify(userIds, type, message, link = null) {
  const stmt = db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)");
  for (const id of new Set([userIds].flat().filter(Boolean))) stmt.run(id, type, message, link);
}

export function notifyCourse(courseId, type, message, link, { excludeUser = null, studentsOnly = true } = {}) {
  const rows = db.prepare(`SELECT ${studentsOnly ? "e.student_id" : "c.teacher_id"} AS uid
    FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.course_id = ? AND e.status = 'active'`).all(courseId);
  const ids = rows.map((r) => r.uid).filter((u) => u && u !== excludeUser);
  if (studentsOnly) {
    const t = db.prepare("SELECT teacher_id FROM courses WHERE id = ?").get(courseId);
    if (t?.teacher_id && t.teacher_id !== excludeUser) ids.push(t.teacher_id);
  }
  notify(ids, type, message, link);
}
