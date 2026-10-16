import crypto from "crypto";
import { db } from "./db";

// Unambiguous alphabet (no 0/O/1/I/L), same spirit as course codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** UTC "YYYY-MM-DD HH:MM:SS" — matches what UTC_TIMESTAMP() stores in this DB. */
export const stamp = (d = new Date()) => d.toISOString().slice(0, 19).replace("T", " ");

/** Parse a stored stamp ("YYYY-MM-DD HH:MM:SS", UTC) into a Date. */
export const parseStamp = (s) => (s ? new Date(String(s).replace(" ", "T") + "Z") : null);

/** Random 6-char uppercase session code, unique among sessions that are still open. */
export async function generateAttendanceCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = "";
    for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
    const taken = await db.prepare("SELECT 1 FROM attendance_sessions WHERE code = ? AND status = 'open'").get(code);
    if (!taken) return code;
  }
  throw new Error("Could not generate an attendance code");
}

export const getSession = async (sessionId) => await db.prepare(`
  SELECT s.*, c.name AS course_name, c.teacher_id AS course_teacher_id
  FROM attendance_sessions s JOIN courses c ON c.id = s.course_id WHERE s.id = ?`).get(sessionId) || null;

export const openSession = async (courseId) => await db.prepare(`
  SELECT * FROM attendance_sessions WHERE course_id = ? AND status = 'open'
  ORDER BY opened_at DESC LIMIT 1`).get(courseId) || null;

/** True while the teacher can still accept marks: open and not past closes_at. */
export const isAccepting = (s) => !!s && s.status === "open" && (!s.closes_at || parseStamp(s.closes_at) > new Date());

/** Late window: more than 5 minutes after the session was opened. */
export const isLateNow = (s) => !!s?.opened_at && Date.now() > parseStamp(s.opened_at).getTime() + 5 * 60_000;

export const sessionStats = async (sessionId) => await db.prepare(`
  SELECT COUNT(*) AS marked,
    COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) AS present,
    COALESCE(SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END), 0) AS late,
    COALESCE(SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
    COALESCE(SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END), 0) AS excused
  FROM attendance_records WHERE session_id = ?`).get(sessionId);

/** All records of one session with the student identity, newest status first. */
export const sessionRecords = async (sessionId) => await db.prepare(`
  SELECT r.id, r.status, r.method, r.marked_at, r.note, r.student_id, u.full_name, sp.student_id AS roll_no
  FROM attendance_records r JOIN users u ON u.id = r.student_id
  LEFT JOIN student_profiles sp ON sp.user_id = u.id
  WHERE r.session_id = ? ORDER BY u.full_name`).all(sessionId);

/** Roster of the session's course with each student's current mark (null when unmarked). */
export async function rosterForSession(sessionId) {
  const s = await getSession(sessionId);
  if (!s) return [];
  const enrolled = (await db.prepare(`
    SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND status = 'active'`).get(s.course_id)).total;
  const rows = await db.prepare(`
    SELECT u.id AS user_id, u.full_name, sp.student_id AS roll_no, sp.class_name,
           r.id AS record_id, r.status, r.method, r.marked_at
    FROM enrollments e JOIN users u ON u.id = e.student_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN attendance_records r ON r.student_id = u.id AND r.session_id = ?
    WHERE e.course_id = ? AND e.status = 'active' ORDER BY u.full_name`).all(sessionId, s.course_id);
  return { enrolled, rows };
}

/** Session list for a course with per-session marked/total counts and a present+late rate. */
export const courseSessions = async (courseId) => await db.prepare(`
  SELECT s.*,
    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS marked,
    (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = s.course_id AND e.status = 'active') AS enrolled,
    CASE WHEN (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status != 'excused') > 0
      THEN ROUND(100.0 * (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status IN ('present','late'))
        / (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status != 'excused'))
      ELSE NULL END AS rate
  FROM attendance_sessions s WHERE s.course_id = ? ORDER BY s.opened_at DESC`).all(courseId);

/** Course-wide rate over closed sessions: (present + late) / (counted, excused excluded). */
export const courseAttendanceRate = async (courseId) => (await db.prepare(`
  SELECT ROUND(100.0 * SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN r.status != 'excused' THEN 1 ELSE 0 END), 0)) AS rate
  FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
  WHERE s.course_id = ? AND s.status = 'closed'`).get(courseId))?.rate ?? null;

export const getRecord = async (sessionId, studentId) => await db.prepare(
  "SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?").get(sessionId, studentId) || null;

/** Full attendance history of one student across all courses, newest first. */
export const studentHistory = async (studentId) => await db.prepare(`
  SELECT r.id, r.status, r.method, r.marked_at, r.note,
         s.id AS session_id, s.session_date, s.status AS session_status,
         c.id AS course_id, c.name AS course_name
  FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
  JOIN courses c ON c.id = s.course_id
  WHERE r.student_id = ? ORDER BY s.session_date DESC, s.opened_at DESC`).all(studentId);

/** Open, not-yet-expired sessions in the student's active courses that they haven't marked. */
export const openSessionsForStudent = async (studentId) => await db.prepare(`
  SELECT s.id, s.session_date, s.code, s.opened_at, s.closes_at, c.id AS course_id, c.name AS course_name
  FROM attendance_sessions s
  JOIN enrollments e ON e.course_id = s.course_id AND e.student_id = ? AND e.status = 'active'
  JOIN courses c ON c.id = s.course_id
  WHERE s.status = 'open' AND (s.closes_at IS NULL OR s.closes_at > UTC_TIMESTAMP())
    AND NOT EXISTS (SELECT 1 FROM attendance_records r WHERE r.session_id = s.id AND r.student_id = ?)
  ORDER BY s.opened_at DESC`).all(studentId, studentId);

/** Open session matching a code among the student's enrolled courses, or null. */
export async function findOpenSessionByCode(code, studentId) {
  return await db.prepare(`
    SELECT s.*, c.name AS course_name FROM attendance_sessions s
    JOIN enrollments e ON e.course_id = s.course_id AND e.student_id = ? AND e.status = 'active'
    JOIN courses c ON c.id = s.course_id
    WHERE s.code = ? AND s.status = 'open'
    ORDER BY s.opened_at DESC LIMIT 1`).get(studentId, code) || null;
}

/** Insert or update one mark. UNIQUE (session_id, student_id) makes this an upsert. */
export async function upsertRecord({ sessionId, studentId, status, method = "manual", markedBy = null, note = null }) {
  await db.prepare(`
    INSERT INTO attendance_records (session_id, student_id, status, method, marked_at, marked_by, note)
    VALUES (?,?,?,?, UTC_TIMESTAMP(), ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status), method = VALUES(method),
      marked_at = UTC_TIMESTAMP(), marked_by = VALUES(marked_by),
      note = COALESCE(VALUES(note), note)`
  ).run(sessionId, studentId, status, method, markedBy, note);
}

/**
 * Close a session and mark every enrolled student without a record absent.
 * Called only from the teacher's "Close session" action (or when a new session
 * is started), never automatically while a session is open.
 */
export const closeSessionTx = async (sessionId) => await db.transaction(async () => {
  const s = await db.prepare("SELECT * FROM attendance_sessions WHERE id = ?").get(sessionId);
  if (!s) return false;
  await db.prepare("UPDATE attendance_sessions SET status = 'closed', closes_at = COALESCE(closes_at, ?) WHERE id = ?")
    .run(stamp(), sessionId);
  await db.prepare(`
    INSERT IGNORE INTO attendance_records (session_id, student_id, status, method, marked_at, marked_by)
    SELECT ?, e.student_id, 'absent', 'manual', UTC_TIMESTAMP(), ?
    FROM enrollments e
    WHERE e.course_id = ? AND e.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM attendance_records r WHERE r.session_id = ? AND r.student_id = e.student_id)`)
    .run(sessionId, s.created_by, s.course_id, sessionId);
  return true;
})();

/** Start a new session; any still-open previous session for the course is closed first. */
export async function openAttendance({ teacherId, courseId, minutes }) {
  return await db.transaction(async () => {
    for (const prev of await db.prepare("SELECT id FROM attendance_sessions WHERE course_id = ? AND status = 'open'").all(courseId)) {
      await closeSessionTx(prev.id);
    }
    const code = await generateAttendanceCode();
    const now = new Date();
    const info = await db.prepare(`
      INSERT INTO attendance_sessions (course_id, session_date, code, opened_at, closes_at, status, created_by)
      VALUES (?,?,?,?,?,'open',?)`)
      .run(courseId, now.toISOString().slice(0, 10), code, stamp(now), stamp(new Date(now.getTime() + minutes * 60_000)), teacherId);
    return Number(info.lastInsertRowid);
  })();
}

/** Reopen a closed session for another window; existing marks are kept for manual correction. */
export async function reopenSessionTx(sessionId, minutes = 10) {
  const now = new Date();
  await db.prepare("UPDATE attendance_sessions SET status = 'open', closes_at = ? WHERE id = ?")
    .run(stamp(new Date(now.getTime() + minutes * 60_000)), sessionId);
}
