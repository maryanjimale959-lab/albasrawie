"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, audit } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { courseForTeacher, courseForStudent } from "@/lib/guards";
import { normalizeCode } from "@/lib/codes";
import * as att from "@/lib/attendance";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

/** Teacher/admin guard for every attendance mutation. Students are never allowed here. */
function teacherUser() {
  const u = requireUser();
  if (u.role !== "teacher" && u.role !== "admin") redirect("/dashboard");
  if (u.role === "teacher" && u.status !== "active") redirect("/dashboard");
  return u;
}

function refreshAttendancePaths(courseId, sessionId = null) {
  revalidatePath(`/courses/${courseId}/attendance`);
  if (sessionId) revalidatePath(`/courses/${courseId}/attendance/${sessionId}`);
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

const STATUSES = ["present", "late", "excused", "absent"];
const statusField = z.string().refine((v) => STATUSES.includes(v), "Pick a valid attendance status.");

const startSchema = z.object({
  duration: z.string().regex(/^\d{1,3}$/, "Enter the opening time in whole minutes."),
});

/** Open a new session: fresh 6-char code, closes after `duration` minutes (default 10). */
export async function startSession(_prev, fd) {
  const user = teacherUser();
  const courseId = Number(fd.get("course_id"));
  const course = Number.isInteger(courseId) ? courseForTeacher(user, courseId) : null;
  if (!course) return { error: "Course not found or not yours to teach." };
  const r = startSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const minutes = Math.min(180, Math.max(1, Number(r.data.duration) || 10));
  const sessionId = att.openAttendance({ teacherId: user.id, courseId, minutes });
  audit(user.id, "attendance.start", `course:${courseId}`, { sessionId, minutes });
  refreshAttendancePaths(courseId, sessionId);
  return { error: null };
}

const markSchema = z.object({
  status: statusField,
});

/** Teacher manual mark — upsert so the teacher can switch a student between statuses. */
export async function markRecord(fd) {
  const user = teacherUser();
  const r = markSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const sessionId = Number(fd.get("session_id"));
  const studentId = Number(fd.get("student_id"));
  const s = att.getSession(sessionId);
  if (!s) return { error: "Session not found." };
  if (!courseForTeacher(user, s.course_id)) return { error: "You don't teach this course." };
  if (s.status !== "open") return { error: "This session is closed. Reopen it to change marks." };
  const enrolled = db.prepare("SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ? AND status = 'active'").get(s.course_id, studentId);
  if (!enrolled) return { error: "That student isn't in this course." };
  att.upsertRecord({ sessionId, studentId, status: r.data.status, method: "manual", markedBy: user.id });
  audit(user.id, "attendance.mark", `session:${sessionId}`, { studentId, status: r.data.status });
  refreshAttendancePaths(s.course_id, sessionId);
  return { error: null };
}

/** Close a session: everyone still unmarked becomes absent (method 'manual'). */
export async function closeSession(fd) {
  const user = teacherUser();
  const sessionId = Number(fd.get("session_id"));
  const s = att.getSession(sessionId);
  if (!s) return { error: "Session not found." };
  if (!courseForTeacher(user, s.course_id)) return { error: "You don't teach this course." };
  if (s.status !== "open") return { error: "This session is already closed." };
  att.closeSessionTx(sessionId);
  audit(user.id, "attendance.close", `session:${sessionId}`);
  refreshAttendancePaths(s.course_id, sessionId);
  return { error: null };
}

/** Reopen a closed session for another 10-minute window; existing marks stay put. */
export async function reopenSession(fd) {
  const user = teacherUser();
  const sessionId = Number(fd.get("session_id"));
  const s = att.getSession(sessionId);
  if (!s) return { error: "Session not found." };
  if (!courseForTeacher(user, s.course_id)) return { error: "You don't teach this course." };
  if (s.status !== "closed") return { error: "This session is already open." };
  att.reopenSessionTx(sessionId);
  audit(user.id, "attendance.reopen", `session:${sessionId}`);
  refreshAttendancePaths(s.course_id, sessionId);
  return { error: null };
}

const correctSchema = z.object({
  status: statusField,
  reason: z.string().min(3, "A correction needs a short reason note.").max(500),
});

/** Correct one record after the fact — the reason note is mandatory and audited. */
export async function correctRecord(_prev, fd) {
  const user = teacherUser();
  const r = correctSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const recordId = Number(fd.get("record_id"));
  const rec = db.prepare(`
    SELECT r.*, s.course_id FROM attendance_records r
    JOIN attendance_sessions s ON s.id = r.session_id WHERE r.id = ?`).get(recordId);
  if (!rec) return { error: "Record not found." };
  if (!courseForTeacher(user, rec.course_id)) return { error: "You don't teach this course." };
  db.prepare("UPDATE attendance_records SET status = ?, note = ?, marked_at = datetime('now'), marked_by = ? WHERE id = ?")
    .run(r.data.status, r.data.reason, user.id, recordId);
  audit(user.id, "attendance.correct", `session:${rec.session_id}`, {
    studentId: rec.student_id, from: rec.status, to: r.data.status, reason: r.data.reason,
  });
  refreshAttendancePaths(rec.course_id, rec.session_id);
  return { error: null };
}

const joinSchema = z.object({
  code: z.string().min(4, "Enter the 6-character code shown on your teacher's screen."),
});

/**
 * Student self-marking. The code must match an open, unexpired session in one of
 * the student's enrolled courses. method = 'qr' when they arrived through the
 * QR/link (session id carried along), 'code' when they typed a bare code.
 */
export async function joinAttendance(_prev, fd) {
  const user = requireUser("student");
  const r = joinSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const code = normalizeCode(r.data.code);
  const rawSession = clean(String(fd.get("session_id") || ""));

  let session = null;
  let method = "code";
  if (rawSession && /^\d+$/.test(rawSession)) {
    method = "qr";
    session = att.getSession(Number(rawSession));
    if (!session) return { error: "That session no longer exists. Ask your teacher for a fresh code." };
    if (normalizeCode(session.code) !== code) return { error: "That code doesn't match this session. Check it with your teacher." };
  } else {
    session = att.findOpenSessionByCode(code, user.id);
    if (!session) return { error: "No open session uses that code. Codes only work while attendance is open." };
  }

  if (session.status !== "open") return { error: "Attendance for this session is closed." };
  if (session.closes_at && att.parseStamp(session.closes_at) <= new Date())
    return { error: "This session's code has expired. Ask your teacher to reopen it." };
  if (!courseForStudent(user, session.course_id)) return { error: "You're not enrolled in this course." };

  const existing = att.getRecord(session.id, user.id);
  if (existing) {
    return {
      error: existing.status === "present"
        ? "You're already marked present for this session."
        : `You're already recorded as ${existing.status} for this session. Ask your teacher to correct it.`,
    };
  }

  const status = att.isLateNow(session) ? "late" : "present";
  att.upsertRecord({ sessionId: session.id, studentId: user.id, status, method, markedBy: user.id });
  audit(user.id, "attendance.join", `session:${session.id}`, { status, method });
  refreshAttendancePaths(session.course_id, session.id);
  redirect(`/attendance/join?marked=${session.id}`);
}
