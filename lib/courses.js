import { db, audit } from "./db";
import { generateCourseCode, normalizeCode } from "./codes";

export function createCourse(teacherId, f) {
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO courses
      (teacher_id, name, description, category, organization, class_name, level, visibility)
      VALUES (?,?,?,?,?,?,?,?)`).run(teacherId, f.name, f.description || null, f.category || null,
      f.organization || null, f.class_name || null, f.level || null, f.visibility);
    const id = Number(info.lastInsertRowid);
    const code = generateCourseCode(f.name);
    db.prepare("INSERT INTO course_codes (code, course_id) VALUES (?,?)").run(code, id);
    db.prepare("UPDATE courses SET course_code = ? WHERE id = ?").run(code, id);
    audit(teacherId, "course.create", `course:${id}`, { name: f.name });
    return id;
  });
  return tx();
}

/** Teacher-owned course or null. All teacher actions go through this check. */
export function ownedCourse(teacherId, courseId) {
  return db.prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?").get(courseId, teacherId) || null;
}

export function regenerateCode(teacherId, courseId) {
  const c = ownedCourse(teacherId, courseId);
  if (!c) return { error: "Course not found." };
  const tx = db.transaction(() => {
    db.prepare("UPDATE course_codes SET active = 0 WHERE course_id = ?").run(courseId);
    const code = generateCourseCode(c.name);
    db.prepare("INSERT INTO course_codes (code, course_id) VALUES (?,?)").run(code, courseId);
    db.prepare("UPDATE courses SET course_code = ? WHERE id = ?").run(code, courseId);
    audit(teacherId, "course.code.regenerate", `course:${courseId}`);
  });
  tx();
  return { ok: true };
}

export function disableCode(teacherId, courseId) {
  const c = ownedCourse(teacherId, courseId);
  if (!c) return { error: "Course not found." };
  db.prepare("UPDATE course_codes SET active = 0 WHERE course_id = ?").run(courseId);
  audit(teacherId, "course.code.disable", `course:${courseId}`);
  return { ok: true };
}

export function setEnrollmentOpen(teacherId, courseId, open) {
  if (!ownedCourse(teacherId, courseId)) return { error: "Course not found." };
  db.prepare("UPDATE courses SET enrollment_open = ? WHERE id = ?").run(open ? 1 : 0, courseId);
  return { ok: true };
}

export function setArchived(teacherId, courseId, archived) {
  if (!ownedCourse(teacherId, courseId)) return { error: "Course not found." };
  db.prepare("UPDATE courses SET archived = ? WHERE id = ?").run(archived ? 1 : 0, courseId);
  audit(teacherId, archived ? "course.archive" : "course.unarchive", `course:${courseId}`);
  return { ok: true };
}

export function removeStudent(teacherId, courseId, studentId) {
  if (!ownedCourse(teacherId, courseId)) return { error: "Course not found." };
  db.prepare("UPDATE enrollments SET status = 'removed' WHERE course_id = ? AND student_id = ?").run(courseId, studentId);
  audit(teacherId, "enrollment.remove", `course:${courseId}`, { studentId });
  return { ok: true };
}

/** Server-side lookup for the confirmation step. Never trust the client. */
export function lookupCode(rawCode, studentId) {
  const code = normalizeCode(rawCode);
  const row = db.prepare(`
    SELECT cc.code, cc.active, cc.expires_at, c.id AS course_id, c.name, c.description, c.enrollment_open,
           c.archived, u.full_name AS teacher_name
    FROM course_codes cc JOIN courses c ON c.id = cc.course_id JOIN users u ON u.id = c.teacher_id
    WHERE cc.code = ?`).get(code);
  if (!row) return { error: "That course code doesn't exist. Check it for typos and try again." };
  if (!row.active) return { error: "This code has been turned off. Ask your teacher for a new one." };
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { error: "This invitation has expired. Ask your teacher for a new code." };
  if (row.archived) return { error: "This course is archived and can't accept new students." };
  if (!row.enrollment_open) return { error: "Enrollment for this course is closed." };
  const existing = studentId && db.prepare("SELECT status FROM enrollments WHERE student_id = ? AND course_id = ?").get(studentId, row.course_id);
  if (existing?.status === "active") return { error: "You're already enrolled in this course.", courseId: row.course_id, already: true };
  if (existing?.status === "removed") return { error: "You were removed from this course. Ask the teacher to add you back." };
  return { course: row };
}

export function enroll(studentId, rawCode) {
  const found = lookupCode(rawCode, studentId);
  if (found.error) return found;
  const { course } = found;
  try {
    db.transaction(() => {
      db.prepare("INSERT INTO enrollments (student_id, course_id) VALUES (?,?)").run(studentId, course.course_id);
      const student = db.prepare("SELECT full_name FROM users WHERE id = ?").get(studentId);
      const teacher = db.prepare("SELECT teacher_id FROM courses WHERE id = ?").get(course.course_id);
      db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)")
        .run(teacher.teacher_id, "enrollment", `${student.full_name} joined ${course.name}.`, `/courses/${course.course_id}`);
      db.prepare(`INSERT OR IGNORE INTO learning_activities (student_id, course_id, type, related_id, activity_date, verification, description)
        VALUES (?,?,?,?,date('now'),'verified',?)`).run(studentId, course.course_id, "course_joined", course.course_id, `Joined ${course.name}`);
      audit(studentId, "enrollment.create", `course:${course.course_id}`);
    })();
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return { error: "You're already enrolled in this course.", courseId: course.course_id, already: true };
    throw e;
  }
  return { ok: true, courseId: course.course_id };
}

export const teacherCourses = (teacherId) => db.prepare(`
  SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS student_count
  FROM courses c WHERE c.teacher_id = ? ORDER BY c.archived, c.created_at DESC`).all(teacherId);

export const studentCourses = (studentId) => db.prepare(`
  SELECT c.id, c.name, c.description, c.category, c.level, u.full_name AS teacher_name, e.enrolled_at
  FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = c.teacher_id
  WHERE e.student_id = ? AND e.status = 'active' AND c.archived = 0 ORDER BY e.enrolled_at DESC`).all(studentId);

export const courseRoster = (courseId) => db.prepare(`
  SELECT u.id, u.full_name, sp.student_id, sp.class_name, e.enrolled_at
  FROM enrollments e JOIN users u ON u.id = e.student_id
  LEFT JOIN student_profiles sp ON sp.user_id = u.id
  WHERE e.course_id = ? AND e.status = 'active' ORDER BY u.full_name`).all(courseId);
