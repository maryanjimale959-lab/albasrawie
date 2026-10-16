import { db } from "./db";

/** Local calendar date (YYYY-MM-DD) for a user's time zone. */
export function localDate(tz = "UTC", at = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Record one meaningful learning action. Duplicate (student, type, related)
 * events are ignored so a submission can never inflate the calendar twice.
 */
export async function logActivity(studentId, { courseId = null, type, relatedId = null, verification = "verified", description = null, date = null }) {
  await db.prepare(`INSERT IGNORE INTO learning_activities
    (student_id, course_id, type, related_id, activity_date, verification, description)
    VALUES (?,?,?,?,?,?,?)`).run(studentId, courseId, type, relatedId, date ?? localDate(await tzOf(studentId)), verification, description);
}

export const tzOf = async (studentId) => (await db.prepare("SELECT time_zone FROM users WHERE id = ?").get(studentId))?.time_zone || "UTC";

/** Heatmap cells: { date, count, top verification } for the last `days` days. */
export async function heatmap(studentId, days = 365) {
  const since = addDays(localDate(await tzOf(studentId)), -(days - 1));
  const rows = await db.prepare(`
    SELECT activity_date AS date, COUNT(*) AS count,
           MIN(CASE verification WHEN 'verified' THEN 1 WHEN 'teacher_confirmed' THEN 2 ELSE 3 END) AS \`rank\`
    FROM learning_activities WHERE student_id = ? AND activity_date >= ?
    GROUP BY activity_date ORDER BY activity_date`).all(studentId, since);
  return rows.map((r) => ({ ...r, level: r.count >= 5 ? 4 : r.count >= 3 ? 3 : r.count >= 2 ? 2 : 1 }));
}

/** All activities on one local day, for the day-detail panel. */
export const dayActivities = async (studentId, date) => await db.prepare(`
  SELECT la.*, c.name AS course_name FROM learning_activities la
  LEFT JOIN courses c ON c.id = la.course_id
  WHERE la.student_id = ? AND la.activity_date = ? ORDER BY la.created_at`).all(studentId, date);

/** Current and longest consecutive-day streaks, in the student's own time zone. */
export async function streaks(studentId) {
  const dates = new Set((await db.prepare("SELECT DISTINCT activity_date d FROM learning_activities WHERE student_id = ?").all(studentId)).map((r) => r.d));
  if (dates.size === 0) return { current: 0, longest: 0, activeDays: 0 };
  const today = localDate(await tzOf(studentId));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (dates.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  let longest = 0, run = 0, prev = null;
  for (const d of [...dates].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, activeDays: dates.size };
}

/** Per-week activity totals for the last n weeks (bars chart). */
export async function weeklyActivity(studentId, weeks = 12) {
  const cells = await heatmap(studentId, weeks * 7);
  const today = localDate(await tzOf(studentId));
  const start = addDays(today, -(weeks * 7 - 1));
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const from = addDays(start, i * 7), to = addDays(from, 6);
    out.push({ from, to, count: cells.filter((c) => c.date >= from && c.date <= to).reduce((n, c) => n + c.count, 0) });
  }
  return out;
}

/** Everything the student dashboard and profile need, in one call. */
export async function studentStats(studentId) {
  const counts = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM enrollments WHERE student_id = ? AND status = 'active') AS courses,
    (SELECT COUNT(*) FROM learning_activities WHERE student_id = ?) AS activities,
    (SELECT COUNT(DISTINCT activity_date) FROM learning_activities WHERE student_id = ?) AS learningDays`).get(studentId, studentId, studentId);
  const assignments = (await db.prepare(`SELECT
    (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
      JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = s.student_id AND e.status = 'active'
      WHERE s.student_id = ?) AS done,
    (SELECT COUNT(*) FROM assignments a JOIN enrollments e ON e.course_id = a.id AND e.student_id = ? AND e.status = 'active'
      WHERE a.published = 1 AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.student_id = ?)) AS pending`).all(studentId, studentId, studentId))[0];
  const projects = (await db.prepare(`SELECT
    (SELECT COUNT(*) FROM project_submissions ps JOIN projects p ON p.id = ps.project_id
      JOIN enrollments e ON e.course_id = p.course_id AND e.student_id = ps.student_id AND e.status = 'active'
      WHERE ps.student_id = ? AND ps.status = 'completed') AS done,
    (SELECT COUNT(*) FROM projects p JOIN enrollments e ON e.course_id = p.id AND e.student_id = ? AND e.status = 'active'
      WHERE p.published = 1 AND (SELECT COUNT(*) FROM project_progress pp WHERE pp.project_id = p.id AND pp.student_id = ?) > 0
      AND NOT EXISTS (SELECT 1 FROM project_submissions ps WHERE ps.project_id = p.id AND ps.student_id = ?)) AS inProgress`).all(studentId, studentId, studentId, studentId))[0];
  const att = await attendanceSummary(studentId);
  return { ...counts, assignments, projects, attendance: att, streak: await streaks(studentId) };
}

/** Attendance % = (present + late) / (sessions counted, excused excluded). */
export async function attendanceSummary(studentId) {
  /* COALESCE matters: SUM() over no rows comes back NULL, and a null renders as
     a blank stat card — the numbers must read 0 when a student has no register. */
  const row = await db.prepare(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END), 0) AS present,
      COALESCE(SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END), 0) AS late,
      COALESCE(SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
      COALESCE(SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END), 0) AS excused
    FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id AND s.status = 'closed'
    WHERE r.student_id = ?`).get(studentId);
  const counted = row.total - row.excused;
  return { ...row, percent: counted > 0 ? Math.round(((row.present + row.late) / counted) * 100) : null };
}

/** Chronological feed rows for dashboards. */
export async function activityFeed(studentId, limit = 12) {
  return await db.prepare(`
    SELECT la.id, la.type, la.description, la.activity_date, la.verification, la.course_id, la.related_id,
           c.name AS course_name
    FROM learning_activities la LEFT JOIN courses c ON c.id = la.course_id
    WHERE la.student_id = ? ORDER BY la.activity_date DESC, la.created_at DESC LIMIT ?`).all(studentId, limit);
}

/** Deadlines and missing work for the student's "upcoming" panel. */
export async function upcomingWork(studentId) {
  const items = await db.prepare(`
    SELECT 'assignment' AS kind, a.id, a.course_id, c.name AS course_name, a.title, a.due_at AS due
    FROM assignments a JOIN enrollments e ON e.course_id = a.id AND e.student_id = ? AND e.status = 'active'
    JOIN courses c ON c.id = a.course_id
    WHERE a.published = 1 AND a.due_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.student_id = ?)
    UNION ALL
    SELECT 'project' AS kind, p.id, p.course_id, c.name AS course_name, p.title, p.deadline AS due
    FROM projects p JOIN enrollments e ON e.course_id = p.id AND e.student_id = ? AND e.status = 'active'
    JOIN courses c ON c.id = p.course_id
    WHERE p.published = 1 AND p.deadline IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM project_submissions s WHERE s.project_id = p.id AND s.student_id = ? AND s.status IN ('submitted','under_review','completed'))
    ORDER BY due ASC LIMIT 8`).all(studentId, studentId, studentId, studentId);
  const openSessions = await db.prepare(`
    SELECT s.id, s.course_id, c.name AS course_name, s.code, s.session_date
    FROM attendance_sessions s JOIN enrollments e ON e.course_id = s.course_id AND e.student_id = ? AND e.status = 'active'
    JOIN courses c ON c.id = s.course_id WHERE s.status = 'open'`).all(studentId);
  return { items, openSessions };
}

/** Link an activity row to its app page, when one exists. */
export function activityLink(a) {
  if (a.type === "course_joined" && a.course_id) return `/courses/${a.course_id}`;
  if (a.type === "assignment_submitted" && a.course_id) return `/assignments/${a.related_id}`;
  if (a.type === "project_submitted" && a.course_id) return `/projects/${a.related_id}`;
  if (a.course_id) return `/courses/${a.course_id}`;
  return "/activity";
}
