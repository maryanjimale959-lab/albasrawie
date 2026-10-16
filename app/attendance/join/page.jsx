import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseForStudent } from "@/lib/guards";
import * as att from "@/lib/attendance";
import { normalizeCode } from "@/lib/codes";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { joinAttendance } from "@/app/actions/attendance";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { Pill } from "@/components/ui";
import { LiveTimer } from "@/components/motion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mark attendance · Albasrawie" };

const TONE = { present: "green", late: "amber", absent: "red", excused: "neutral" };

export default async function AttendanceJoinPage({ searchParams }) {
  const user = await requireUser("student");
  const sessionId = /^\d+$/.test(String(searchParams.session || "")) ? Number(searchParams.session) : null;
  const markedId = /^\d+$/.test(String(searchParams.marked || "")) ? Number(searchParams.marked) : null;
  const prefill = normalizeCode(String(searchParams.code || ""));

  // Success panel right after marking.
  if (markedId) {
    const done = await db.prepare(`
      SELECT r.status, r.method, r.marked_at, s.session_date, s.id AS session_id, c.id AS course_id, c.name AS course_name
      FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id JOIN courses c ON c.id = s.course_id
      WHERE r.session_id = ? AND r.student_id = ?`).get(markedId, user.id);
    if (done) {
      return (
        <Shell user={user}>
          <section className="panel" style={{ maxWidth: 560, margin: "2rem auto" }}>
            <div className="code-hero">
              <svg width="72" height="72" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                <circle className="check-circle" cx="28" cy="28" r="26" stroke="var(--ok)" strokeWidth="3" />
                <path className="check-mark" d="M17 29.5 24.5 37 39 21" stroke="var(--ok)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 style={done.status === "present" ? { color: "var(--ok)" } : undefined}>You&apos;re marked {done.status}!</h2>
              <Pill tone={TONE[done.status] || "neutral"}>{done.status}</Pill>
              <p className="muted">{done.course_name} · session of {fmtDate(done.session_date)}</p>
              <p className="small muted">Recorded {fmtDateTime(done.marked_at)} via {done.method === "qr" ? "QR link" : done.method === "code" ? "code entry" : "teacher"}.</p>
            </div>
            <div className="actions" style={{ justifyContent: "center" }}>
              <Link href={`/courses/${done.course_id}/attendance`} className="btn ghost sm">My attendance</Link>
              <Link href="/dashboard" className="btn sm">Back to dashboard</Link>
            </div>
          </section>
        </Shell>
      );
    }
  }

  // Session arrived via QR/link or the "Mark present" button.
  let session = sessionId ? await att.getSession(sessionId) : null;
  let note = null;
  if (session) {
    const enrolled = !!(await courseForStudent(user, session.course_id));
    const expired = session.closes_at && att.parseStamp(session.closes_at) <= new Date();
    if (!enrolled) { session = null; note = "You're not enrolled in that course."; }
    else if (session.status !== "open" || expired) { note = "This session is closed — ask your teacher to reopen it."; }
    else {
      const mine = await att.getRecord(session.id, user.id);
      if (mine) note = `You're already recorded as ${mine.status} for this session.`;
    }
  }

  const open = await att.openSessionsForStudent(user.id);

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <Link href="/attendance" className="small muted">← My attendance</Link>
          <h1 style={{ marginTop: 6 }}>Mark attendance</h1>
          <p className="muted">Use the code or QR your teacher shows at the start of class.</p>
        </div>
      </div>

      {note && <div className="alert info">{note}</div>}

      <div className="layout-2">
        {session && !note ? (
          <section className="panel" aria-labelledby="confirm-h">
            <h2 id="confirm-h">Confirm your attendance</h2>
            <div className="code-hero">
              <p className="small muted">{session.course_name} · session of {fmtDate(session.session_date)}</p>
              <span className="code">{session.code}</span>
              {session.closes_at && !att.isLateNow(session) && (
                <p className="small muted"><LiveTimer target={session.closes_at} label="Session closes in" /></p>
              )}
              {att.isLateNow(session)
                ? <p className="small" style={{ color: "#b45309", fontWeight: 800 }}>It&apos;s more than 5 minutes after opening — this will be recorded as late.</p>
                : <p className="small muted">Opens until {fmtDateTime(session.closes_at)}.</p>}
            </div>
            <ActionForm action={joinAttendance} submitLabel="Mark me present">
              <input type="hidden" name="session_id" value={session.id} />
              <label>Session code
                <input name="code" defaultValue={prefill || session.code} maxLength={10}
                  autoCapitalize="characters" autoComplete="off" style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.3rem", letterSpacing: "0.1em", textAlign: "center" }} required />
              </label>
            </ActionForm>
          </section>
        ) : (
          <section className="panel" aria-labelledby="code-h">
            <h2 id="code-h">Enter your teacher&apos;s code</h2>
            <p className="small muted">Type the 6-character code from the classroom screen. It only works while attendance is open.</p>
            <ActionForm action={joinAttendance} submitLabel="Mark present">
              <label>Code
                <input name="code" defaultValue={prefill} placeholder="K7M2QX" maxLength={10}
                  autoCapitalize="characters" autoComplete="off" style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.5rem", letterSpacing: "0.15em", textAlign: "center" }} required />
              </label>
            </ActionForm>
          </section>
        )}

        <section className="panel" aria-labelledby="mine-h">
          <h2 id="mine-h">My open sessions</h2>
          {open.length === 0
            ? <p className="small muted">Nothing open right now.</p>
            : (
              <div className="work-list">
                {open.map((s) => (
                  <Link key={s.id} href={`/attendance/join?session=${s.id}`} className="work-item">
                    <div className="grow"><h3>{s.course_name}</h3><p className="small muted">Session of {fmtDate(s.session_date)}</p></div>
                    <Pill tone="blue">Open</Pill>
                  </Link>
                ))}
              </div>
            )}
        </section>
      </div>
    </Shell>
  );
}
