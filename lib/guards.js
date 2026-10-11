import { db } from "./db";

export const getCourse = (courseId) => db.prepare(`
  SELECT c.*, u.full_name AS teacher_name FROM courses c JOIN users u ON u.id = c.teacher_id WHERE c.id = ?`).get(courseId) || null;

/** Course row if the student is actively enrolled, else null. */
export function courseForStudent(user, courseId) {
  const c = getCourse(courseId);
  if (!c) return null;
  if (user.role === "admin") return c;
  const ok = db.prepare("SELECT 1 FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'").get(user.id, c.id);
  return ok ? c : null;
}

/** Course row if this teacher owns it (admin sees all), else null. */
export function courseForTeacher(user, courseId) {
  const c = getCourse(courseId);
  if (!c) return null;
  if (user.role === "admin") return c;
  return user.role === "teacher" && c.teacher_id === user.id ? c : null;
}

export function canViewCourse(user, courseId) {
  if (!user) return null;
  return user.role === "teacher" || user.role === "admin" ? courseForTeacher(user, courseId) : courseForStudent(user, courseId);
}

/** True if `teacherId` teaches a course `studentId` is enrolled in. */
export function teacherSeesStudent(teacherId, studentId) {
  return !!db.prepare(`
    SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE c.teacher_id = ? AND e.student_id = ? AND e.status = 'active'`).get(teacherId, studentId);
}

export const enrolledStudentIds = (courseId) => db.prepare(
  "SELECT student_id FROM enrollments WHERE course_id = ? AND status = 'active'").all(courseId).map((r) => r.student_id);

export function ensureCourseSettings(courseId) {
  db.prepare("INSERT OR IGNORE INTO course_settings (course_id) VALUES (?)").run(courseId);
  return db.prepare("SELECT * FROM course_settings WHERE course_id = ?").get(courseId);
}
