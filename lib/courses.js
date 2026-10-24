import { db, audit } from "./db";
import { logActivity } from "./activity";
import { generateCourseCode, normalizeCode } from "./codes";

export async function createCourse(teacherId, f) {
  const tx = db.transaction(async () => {
    const info = await db.prepare(`INSERT INTO courses
      (teacher_id, name, description, category, organization, class_name, level, visibility)
      VALUES (?,?,?,?,?,?,?,?)`).run(teacherId, f.name, f.description || null, f.category || null,
      f.organization || null, f.class_name || null, f.level || null, f.visibility);
    const id = Number(info.lastInsertRowid);
    const code = await generateCourseCode(f.name);
    await db.prepare("INSERT INTO course_codes (code, course_id) VALUES (?,?)").run(code, id);
    await db.prepare("UPDATE courses SET course_code = ? WHERE id = ?").run(code, id);
    await audit(teacherId, "course.create", `course:${id}`, { name: f.name });
    return id;
  });
  return await tx();
}

/** Teacher-owned course or null. All teacher actions go through this check. */
export async function ownedCourse(teacherId, courseId) {
  return (await db.prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?").get(courseId, teacherId)) || null;
}

export async function regenerateCode(teacherId, courseId) {
  const c = await ownedCourse(teacherId, courseId);
  if (!c) return { error: "Course not found." };
  const tx = db.transaction(async () => {
    await db.prepare("UPDATE course_codes SET active = 0 WHERE course_id = ?").run(courseId);
    const code = await generateCourseCode(c.name);
    await db.prepare("INSERT INTO course_codes (code, course_id) VALUES (?,?)").run(code, courseId);
    await db.prepare("UPDATE courses SET course_code = ? WHERE id = ?").run(code, courseId);
    await audit(teacherId, "course.code.regenerate", `course:${courseId}`);
  });
  await tx();
  return { ok: true };
}

export async function disableCode(teacherId, courseId) {
  const c = await ownedCourse(teacherId, courseId);
  if (!c) return { error: "Course not found." };
  await db.prepare("UPDATE course_codes SET active = 0 WHERE course_id = ?").run(courseId);
  audit(teacherId, "course.code.disable", `course:${courseId}`);
  return { ok: true };
}

export async function setEnrollmentOpen(teacherId, courseId, open) {
  if (!(await ownedCourse(teacherId, courseId))) return { error: "Course not found." };
  await db.prepare("UPDATE courses SET enrollment_open = ? WHERE id = ?").run(open ? 1 : 0, courseId);
  return { ok: true };
}

export async function setArchived(teacherId, courseId, archived) {
  if (!(await ownedCourse(teacherId, courseId))) return { error: "Course not found." };
  await db.prepare("UPDATE courses SET archived = ? WHERE id = ?").run(archived ? 1 : 0, courseId);
  audit(teacherId, archived ? "course.archive" : "course.unarchive", `course:${courseId}`);
  return { ok: true };
}

export async function removeStudent(teacherId, courseId, studentId) {
  if (!(await ownedCourse(teacherId, courseId))) return { error: "Course not found." };
  await db.prepare("UPDATE enrollments SET status = 'removed' WHERE course_id = ? AND student_id = ?").run(courseId, studentId);
  audit(teacherId, "enrollment.remove", `course:${courseId}`, { studentId });
  return { ok: true };
}

/** Server-side lookup for the confirmation step. Never trust the client. */
export async function lookupCode(rawCode, studentId) {
  const code = normalizeCode(rawCode);
  const row = await db.prepare(`
    SELECT cc.code, cc.active, cc.expires_at, c.id AS course_id, c.name, c.description, c.enrollment_open,
           c.archived, u.full_name AS teacher_name
    FROM course_codes cc JOIN courses c ON c.id = cc.course_id JOIN users u ON u.id = c.teacher_id
    WHERE cc.code = ?`).get(code);
  if (!row) return { error: "That course code doesn't exist. Check it for typos and try again." };
  if (!row.active) return { error: "This code has been turned off. Ask your teacher for a new one." };
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { error: "This invitation has expired. Ask your teacher for a new code." };
  if (row.archived) return { error: "This course is archived and can't accept new students." };
  if (!row.enrollment_open) return { error: "Enrollment for this course is closed." };
  const existing = studentId && (await db.prepare("SELECT status FROM enrollments WHERE student_id = ? AND course_id = ?").get(studentId, row.course_id));
  if (existing?.status === "active") return { error: "You're already enrolled in this course.", courseId: row.course_id, already: true };
  if (existing?.status === "removed") return { error: "You were removed from this course. Ask the teacher to add you back." };
  return { course: row };
}

export async function enroll(studentId, rawCode) {
  const found = await lookupCode(rawCode, studentId);
  if (found.error) return found;
  const { course } = found;
  try {
    await db.transaction(async () => {
      await db.prepare("INSERT INTO enrollments (student_id, course_id) VALUES (?,?)").run(studentId, course.course_id);
      const student = await db.prepare("SELECT full_name FROM users WHERE id = ?").get(studentId);
      const teacher = await db.prepare("SELECT teacher_id FROM courses WHERE id = ?").get(course.course_id);
      await db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)")
        .run(teacher.teacher_id, "enrollment", `${student.full_name} joined ${course.name}.`, `/courses/${course.course_id}`);
      await logActivity(studentId, {
        courseId: course.course_id, type: "course_joined", relatedId: course.course_id,
        verification: "verified", description: `Joined ${course.name}`,
      });
      await audit(studentId, "enrollment.create", `course:${course.course_id}`);
    })();
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return { error: "You're already enrolled in this course.", courseId: course.course_id, already: true };
    throw e;
  }
  return { ok: true, courseId: course.course_id };
}

export const teacherCourses = async (teacherId) => await db.prepare(`
  SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS student_count
  FROM courses c WHERE c.teacher_id = ? ORDER BY c.archived, c.created_at DESC`).all(teacherId);

export const studentCourses = async (studentId) => await db.prepare(`
  SELECT c.id, c.name, c.description, c.category, c.level, u.full_name AS teacher_name, e.enrolled_at
  FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = c.teacher_id
  WHERE e.student_id = ? AND e.status = 'active' AND c.archived = 0 ORDER BY e.enrolled_at DESC`).all(studentId);

export const courseRoster = async (courseId) => await db.prepare(`
  SELECT u.id, u.full_name, sp.student_id, sp.class_name, e.enrolled_at
  FROM enrollments e JOIN users u ON u.id = e.student_id
  LEFT JOIN student_profiles sp ON sp.user_id = u.id
  WHERE e.course_id = ? AND e.status = 'active' ORDER BY u.full_name`).all(courseId);

export async function deleteCourse(teacherId, courseId) {
  const c = await ownedCourse(teacherId, courseId);
  if (!c) return { error: "Course not found or access denied." };
  await db.transaction(async () => {
    await db.prepare("DELETE FROM courses WHERE id = ?").run(courseId);
    await audit(teacherId, "course.delete", `course:${courseId}`, { name: c.name });
  });
  return { ok: true };
}
