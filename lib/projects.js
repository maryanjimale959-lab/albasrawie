import { db } from "./db";
import { enrolledStudentIds } from "./guards";

export const PROJECT_STATUS_META = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "blue" },
  submitted: { label: "Submitted", tone: "blue" },
  under_review: { label: "Under review", tone: "amber" },
  revision: { label: "Revision requested", tone: "red" },
  completed: { label: "Completed", tone: "green" },
};

/* ------------------------------ rows ------------------------------- */

export async function getProject(id) {
  return (await db.prepare(`
    SELECT p.*, c.name AS course_name, c.teacher_id, c.archived, u.full_name AS teacher_name
    FROM projects p JOIN courses c ON c.id = p.course_id JOIN users u ON u.id = c.teacher_id
    WHERE p.id = ?`).get(id)) || null;
}

export const projectMilestones = async (projectId) => await db.prepare(
  "SELECT * FROM project_milestones WHERE project_id = ? ORDER BY position, id").all(projectId);

export const doneMilestoneIds = async (projectId, studentId) => new Set(
  (await db.prepare("SELECT milestone_id FROM project_progress WHERE project_id = ? AND student_id = ?").all(projectId, studentId)).map((r) => r.milestone_id));

export const projectSubmissionFor = async (projectId, studentId) => (await db.prepare(
  "SELECT * FROM project_submissions WHERE project_id = ? AND student_id = ?").get(projectId, studentId)) || null;

/** { done, total, percent } of one student's milestones on one project. */
export async function studentProgress(projectId, studentId, milestoneTotal = null) {
  const total = milestoneTotal ?? (await db.prepare("SELECT COUNT(*) n FROM project_milestones WHERE project_id = ?").get(projectId)).n;
  const done = (await db.prepare("SELECT COUNT(*) n FROM project_progress WHERE project_id = ? AND student_id = ?").get(projectId, studentId)).n;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/** How far along the class is on average (missing students count as 0%). */
export async function classProgress(projectId) {
  const project = await db.prepare("SELECT course_id FROM projects WHERE id = ?").get(projectId);
  const students = project ? await enrolledStudentIds(project.course_id) : [];
  const total = (await db.prepare("SELECT COUNT(*) n FROM project_milestones WHERE project_id = ?").get(projectId)).n;
  const done = (await db.prepare("SELECT student_id, COUNT(*) n FROM project_progress WHERE project_id = ? GROUP BY student_id")
    .all(projectId)).filter((r) => students.includes(r.student_id));
  const sum = done.reduce((n, r) => n + Math.min(1, total ? r.n / total : 0), 0);
  return { total_students: students.length, milestone_total: total, avg_percent: students.length ? Math.round((sum / students.length) * 100) : 0 };
}

/* ----------------------------- listings ----------------------------- */

/** Published projects in the student's active courses, with progress + own submission. */
export async function studentProjects(studentId, { courseId = null } = {}) {
  const rows = await db.prepare(`
    SELECT p.id, p.title, p.course_id, p.deadline, p.max_marks, p.project_type, c.name AS course_name,
      (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id = p.id) AS milestone_total,
      (SELECT COUNT(*) FROM project_progress pp WHERE pp.project_id = p.id AND pp.student_id = ?) AS milestones_done,
      s.id AS submission_id, s.status AS submission_status, s.score, s.grade_released
    FROM projects p
    JOIN enrollments e ON e.course_id = p.course_id AND e.student_id = ? AND e.status = 'active'
    JOIN courses c ON c.id = p.course_id
    LEFT JOIN project_submissions s ON s.project_id = p.id AND s.student_id = ?
    WHERE p.published = 1 ${courseId ? "AND p.course_id = ?" : ""}
    ORDER BY (p.deadline IS NULL), p.deadline ASC, p.id DESC`)
    .all(...(courseId ? [studentId, studentId, studentId, Number(courseId)] : [studentId, studentId, studentId]));
  return rows.map((r) => ({
    ...r,
    percent: r.milestone_total > 0 ? Math.round((r.milestones_done / r.milestone_total) * 100) : 0,
    status: r.submission_status || (r.milestones_done > 0 ? "in_progress" : "not_started"),
  }));
}

/** The teacher's projects with class averages (admin: any course when courseId given). */
export async function teacherProjects(user, { courseId = null } = {}) {
  const sql = (where) => `
    SELECT p.*, c.name AS course_name,
      (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id = p.id) AS milestone_total,
      (SELECT COUNT(*) FROM project_submissions s WHERE s.project_id = p.id) AS submitted,
      (SELECT COUNT(*) FROM project_submissions s WHERE s.project_id = p.id AND s.status = 'completed' AND s.grade_released = 1) AS graded
    FROM projects p JOIN courses c ON c.id = p.course_id WHERE ${where}
    ORDER BY p.published, (p.deadline IS NULL), p.deadline ASC, p.id DESC`;
  const rows = courseId
    ? await db.prepare(sql("c.teacher_id = ? AND p.course_id = ?")).all(user.id, Number(courseId))
    : await db.prepare(sql("c.teacher_id = ?")).all(user.id);
  const list = [];
  for (const r of rows) list.push({ ...r, ...(await classProgress(r.id)) });
  if (list.length || user.role !== "admin" || !courseId) return list;
  const others = await db.prepare(sql("p.course_id = ?")).all(Number(courseId));
  const out = [];
  for (const r of others) out.push({ ...r, ...(await classProgress(r.id)) });
  return out;
}

/** Roster + milestone progress + submission for one project (teacher view). */
export async function projectRoster(projectId) {
  const p = await db.prepare("SELECT course_id FROM projects WHERE id = ?").get(projectId);
  const total = (await db.prepare("SELECT COUNT(*) n FROM project_milestones WHERE project_id = ?").get(projectId)).n;
  const doneBy = await db.prepare("SELECT student_id, COUNT(*) n FROM project_progress WHERE project_id = ? GROUP BY student_id").all(projectId);
  const doneMap = new Map(doneBy.map((r) => [r.student_id, r.n]));
  const roster = await db.prepare(`
    SELECT u.id AS student_id, u.full_name, sp.student_id AS matricule, sp.class_name,
      s.id AS submission_id, s.status AS submission_status, s.description, s.demo_url, s.repo_url,
      s.screenshot_path, s.screenshot_name, s.submitted_at, s.score, s.grade_released, s.feedback
    FROM enrollments e JOIN users u ON u.id = e.student_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN project_submissions s ON s.project_id = ? AND s.student_id = u.id
    WHERE e.course_id = ? AND e.status = 'active' ORDER BY u.full_name`).all(projectId, p?.course_id ?? 0);
  return roster.map((r) => {
    const done = doneMap.get(r.student_id) || 0;
    return {
      ...r,
      milestones_done: done,
      milestone_total: total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      status: r.submission_status || (done > 0 ? "in_progress" : "not_started"),
    };
  });
}

/* -------------------------- personal projects ------------------------ */

export const personalProjectsFor = async (studentId) => await db.prepare(`
  SELECT * FROM personal_projects WHERE student_id = ? ORDER BY (completed_on IS NULL), completed_on DESC, id DESC`).all(studentId);

export const getPersonalProject = async (id) => (await db.prepare("SELECT * FROM personal_projects WHERE id = ?").get(id)) || null;

/** Released project scores used by the grades engine. */
export const releasedProjectRows = async (studentId, courseId) => await db.prepare(`
  SELECT s.id, s.score, p.max_marks, p.title, p.id AS parent_id, s.feedback, s.submitted_at, s.status
  FROM project_submissions s JOIN projects p ON p.id = s.project_id
  WHERE s.student_id = ? AND p.course_id = ? AND s.grade_released = 1 AND s.score IS NOT NULL`).all(studentId, courseId);
