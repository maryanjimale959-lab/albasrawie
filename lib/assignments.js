import { db } from "./db";

/* ------------------------------------------------------------------ *
 * Date helpers. Everything is stored in UTC as "YYYY-MM-DD HH:MM:SS" *
 * (same shape as datetime('now')), so string compares are valid.      *
 * ------------------------------------------------------------------ */

/** "2026-05-01T14:30" (datetime-local) or "2026-05-01" -> stored UTC datetime. */
export function toDbDateTime(value) {
  if (!value) return null;
  const v = String(value).trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return `${v}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} 23:59:00`;
  return null;
}

/** Stored UTC datetime -> value for a datetime-local input. */
export const toInputDateTime = (value) => (value ? String(value).slice(0, 16).replace(" ", "T") : "");

export const overdue = (dueAt) => {
  const due = toDbDateTime(dueAt);
  return due ? new Date().toISOString().slice(0, 19).replace("T", " ") > due : false;
};

/** Submission types a teacher allows, parsed from the CSV column. */
export const allowedTypes = (row) => String(row?.allowed_types || "").split(",").map((t) => t.trim()).filter(Boolean);

/** 'late' when the (UTC) submit instant is after the due moment, else 'submitted'. */
export function submissionStatus(dueAt, at = new Date()) {
  const due = toDbDateTime(dueAt);
  if (!due) return "submitted";
  return at.toISOString().slice(0, 19).replace("T", " ") > due ? "late" : "submitted";
}

/** Student-facing status: missing rows count as "not_started". */
export const displayStatus = (row) => (row.submission_id ? row.submission_status : "not_started");

export const STATUS_META = {
  not_started: { label: "Not started", tone: "neutral" },
  missing: { label: "Not submitted", tone: "red" },
  submitted: { label: "Submitted", tone: "blue" },
  late: { label: "Late", tone: "amber" },
  graded: { label: "Graded", tone: "green" },
  revision: { label: "Revision requested", tone: "red" },
};

/* --------------------------- queries ------------------------------ */

export function getAssignment(id) {
  return db.prepare(`
    SELECT a.*, c.name AS course_name, c.teacher_id, c.archived, u.full_name AS teacher_name
    FROM assignments a JOIN courses c ON c.id = a.course_id JOIN users u ON u.id = c.teacher_id
    WHERE a.id = ?`).get(id) || null;
}

export const submissionFor = (assignmentId, studentId) => db.prepare(
  "SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?").get(assignmentId, studentId) || null;

/** Every published assignment in the student's active courses + their own submission. */
export function studentAssignments(studentId, { courseId = null } = {}) {
  const rows = db.prepare(`
    SELECT a.id, a.title, a.course_id, a.due_at, a.max_marks, a.published, c.name AS course_name,
           s.id AS submission_id, s.status AS submission_status, s.score, s.grade_released, s.submitted_at
    FROM assignments a
    JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = ? AND e.status = 'active'
    JOIN courses c ON c.id = a.course_id
    LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ?
    WHERE a.published = 1 ${courseId ? "AND a.course_id = ?" : ""}
    ORDER BY (a.due_at IS NULL), a.due_at ASC, a.id DESC`)
    .all(...(courseId ? [studentId, studentId, Number(courseId)] : [studentId, studentId]));
  return rows.map((r) => ({ ...r, status: displayStatus(r) }));
}

/** Counts per student-facing status, for the filter chips and stat cards. */
export function statusCounts(list) {
  const out = {};
  for (const r of list) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

/** Assignments owned by the teacher (admins: any course) with submission tallies. */
export function teacherAssignments(user, { courseId = null } = {}) {
  const byTeacher = db.prepare(`
    SELECT a.*, c.name AS course_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = a.course_id AND e.status = 'active') AS total,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submitted,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.grade_released = 1 AND s.score IS NOT NULL) AS graded,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'late') AS late
    FROM assignments a JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ? ${courseId ? "AND a.course_id = ?" : ""}
    ORDER BY a.published, (a.due_at IS NULL), a.due_at ASC, a.id DESC`)
    .all(...(courseId ? [user.id, Number(courseId)] : [user.id]));
  if (byTeacher.length || user.role !== "admin" || !courseId) return byTeacher;
  return db.prepare(`
    SELECT a.*, c.name AS course_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = a.course_id AND e.status = 'active') AS total,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submitted,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.grade_released = 1 AND s.score IS NOT NULL) AS graded,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'late') AS late
    FROM assignments a JOIN courses c ON c.id = a.course_id
    WHERE a.course_id = ? ORDER BY a.published, a.due_at ASC, a.id DESC`).all(Number(courseId));
}

/** Full roster with each student's submission row (null when nothing handed in). */
export function rosterSubmissions(assignmentId) {
  return db.prepare(`
    SELECT u.id AS student_id, u.full_name, sp.student_id AS matricule, sp.class_name,
           s.id AS submission_id, s.status AS submission_status, s.content, s.link,
           s.file_path, s.file_name, s.submitted_at, s.score, s.grade_released, s.feedback
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN assignment_submissions s ON s.assignment_id = ? AND s.student_id = u.id
    WHERE e.course_id = (SELECT course_id FROM assignments WHERE id = ?) AND e.status = 'active'
    ORDER BY u.full_name`).all(assignmentId, assignmentId);
}

export const assignmentCounts = (assignmentId) => {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = (SELECT course_id FROM assignments WHERE id = ?) AND e.status = 'active') AS total,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = ?) AS submitted,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = ? AND s.status = 'late') AS late,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = ? AND s.grade_released = 1 AND s.score IS NOT NULL) AS graded,
      (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = ? AND s.status = 'revision') AS revision`)
    .get(assignmentId, assignmentId, assignmentId, assignmentId, assignmentId);
  return { ...row, missing: row.total - row.submitted };
};

/** Released scores used by the grades engine. */
export const releasedAssignmentRows = (studentId, courseId) => db.prepare(`
  SELECT s.id, s.score, a.max_marks, a.title, a.id AS parent_id, s.feedback, s.submitted_at, s.status
  FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
  WHERE s.student_id = ? AND a.course_id = ? AND s.grade_released = 1 AND s.score IS NOT NULL`).all(studentId, courseId);
