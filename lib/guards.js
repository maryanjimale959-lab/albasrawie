import { db } from "./db";

export const getCourse = async (courseId) => (await db.prepare(`
  SELECT c.*, u.full_name AS teacher_name FROM courses c JOIN users u ON u.id = c.teacher_id WHERE c.id = ?`).get(courseId)) || null;

/** Course row if the student is actively enrolled, else null. */
export async function courseForStudent(user, courseId) {
  const c = await getCourse(courseId);
  if (!c) return null;
  if (user.role === "admin") return c;
  const ok = await db.prepare("SELECT 1 FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'").get(user.id, c.id);
  return ok ? c : null;
}

/** Course row if this teacher owns it (admin sees all), else null. */
export async function courseForTeacher(user, courseId) {
  const c = await getCourse(courseId);
  if (!c) return null;
  if (user.role === "admin") return c;
  return user.role === "teacher" && c.teacher_id === user.id ? c : null;
}

export async function canViewCourse(user, courseId) {
  if (!user) return null;
  return user.role === "teacher" || user.role === "admin" ? await courseForTeacher(user, courseId) : await courseForStudent(user, courseId);
}

/** True if `teacherId` teaches a course `studentId` is enrolled in. */
export async function teacherSeesStudent(teacherId, studentId) {
  return !!(await db.prepare(`
    SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE c.teacher_id = ? AND e.student_id = ? AND e.status = 'active'`).get(teacherId, studentId));
}

export const enrolledStudentIds = async (courseId) => (await db.prepare(
  "SELECT student_id FROM enrollments WHERE course_id = ? AND status = 'active'").all(courseId)).map((r) => r.student_id);

export async function ensureCourseSettings(courseId) {
  await db.prepare("INSERT IGNORE INTO course_settings (course_id) VALUES (?)").run(courseId);
  return await db.prepare("SELECT * FROM course_settings WHERE course_id = ?").get(courseId);
}
