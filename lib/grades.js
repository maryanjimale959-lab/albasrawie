import { db } from "./db";
import { ensureCourseSettings } from "./guards";
import { releasedAssignmentRows } from "./assignments";
import { releasedProjectRows } from "./projects";

/** sum(score) / sum(max_marks) over the released rows of one category. */
function category(rows, weight) {
  const max = rows.reduce((n, r) => n + (r.max_marks || 0), 0);
  const score = rows.reduce((n, r) => n + (r.score ?? 0), 0);
  return {
    rows,
    count: rows.length,
    score,
    max,
    percent: max > 0 ? Math.round((score / max) * 100) : null,
    weight,
  };
}

/**
 * Grade book for one student in one course.
 * Quizzes carry no data yet, so their weight is skipped and the remaining
 * category weights are renormalised over the categories that do have grades.
 */
export async function courseGrade(studentId, courseId) {
  const settings = await ensureCourseSettings(courseId);
  const assignments = category(await releasedAssignmentRows(studentId, courseId), settings.weight_assignments);
  const projects = category(await releasedProjectRows(studentId, courseId), settings.weight_projects);
  const quizzes = { rows: [], count: 0, score: 0, max: 0, percent: null, weight: settings.weight_quizzes };

  const present = [assignments, projects, quizzes].filter((c) => c.count > 0 && c.percent !== null);
  const weightSum = present.reduce((n, c) => n + c.weight, 0);
  const overall = weightSum > 0
    ? Math.round(present.reduce((n, c) => n + c.percent * c.weight, 0) / weightSum)
    : null;
  return { assignments, projects, quizzes, overall, weights: settings, hasGrades: present.length > 0 };
}

/** Merged, newest-first list of everything released for a student in a course. */
export async function releasedGradeRows(studentId, courseId) {
  const rows = [
    ...(await releasedAssignmentRows(studentId, courseId)).map((r) => ({ ...r, kind: "assignment" })),
    ...(await releasedProjectRows(studentId, courseId)).map((r) => ({ ...r, kind: "project" })),
  ];
  return rows.sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
}

/** One entry per active enrollment — what the student grades page shows. */
export async function studentCourseGrades(studentId, { courseId = null } = {}) {
  const courses = await db.prepare(`
    SELECT c.id, c.name, u.full_name AS teacher_name
    FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = c.teacher_id
    WHERE e.student_id = ? AND e.status = 'active' ${courseId ? "AND c.id = ?" : ""}
    ORDER BY c.archived, c.name`).all(...(courseId ? [studentId, Number(courseId)] : [studentId]));
  const out = [];
  for (const c of courses) out.push({ ...c, grade: await courseGrade(studentId, c.id) });
  return out;
}

/** Roster + overall percentage for the teacher grades view. */
export async function rosterGrades(courseId) {
  const students = await db.prepare(`
    SELECT u.id, u.full_name, sp.student_id AS matricule, sp.class_name
    FROM enrollments e JOIN users u ON u.id = e.student_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE e.course_id = ? AND e.status = 'active' ORDER BY u.full_name`).all(courseId);
  const out = [];
  for (const s of students) {
    const g = await courseGrade(s.id, courseId);
    out.push({ ...s, grade: g });
  }
  return out;
}

/** Course-wide averages per category, used on the teacher grades panel. */
export async function courseGradeSummary(courseId) {
  const roster = await rosterGrades(courseId);
  const scored = roster.filter((r) => r.grade.overall !== null);
  const avg = (list) => (list.length ? Math.round(list.reduce((n, r) => n + r, 0) / list.length) : null);
  return {
    roster,
    scoredCount: scored.length,
    studentCount: roster.length,
    averageOverall: avg(scored.map((r) => r.grade.overall)),
    averageAssignments: avg(scored.map((r) => r.grade.assignments.percent).filter((n) => n !== null)),
    averageProjects: avg(scored.map((r) => r.grade.projects.percent).filter((n) => n !== null)),
    releasedCount: roster.reduce((n, r) => n + r.grade.assignments.count + r.grade.projects.count, 0),
  };
}

/** Scores the teacher has entered but not yet shown to students (assignments). */
export async function pendingReleaseCount(courseId) {
  return (await db.prepare(`
    SELECT COUNT(*) n FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ? AND s.grade_released = 0 AND s.score IS NOT NULL`).get(courseId)).n;
}

/** Percentage tone for the pill / stat colouring. */
export const gradeTone = (p) => (p === null ? "neutral" : p >= 80 ? "green" : p >= 50 ? "blue" : p >= 40 ? "amber" : "red");
