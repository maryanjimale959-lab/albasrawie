import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseForTeacher } from "@/lib/guards";
import * as att from "@/lib/attendance";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { closeSession, reopenSession, correctRecord } from "@/app/actions/attendance";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { StatCard, Pill, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance session · Albasrawie" };

const TONE = { present: "green", late: "amber", absent: "red", excused: "neutral" };
const STATUSES = ["present", "late", "excused", "absent"];

export default function SessionDetailPage({ params }) {
  const user = requireUser();
  if (user.role === "student") notFound(); // students use /attendance, never this page

  const session = att.getSession(Number(params.sessionId));
  if (!session || session.course_id !== Number(params.id)) notFound();
  const course = courseForTeacher(user, session.course_id);
  if (!course) notFound();

  const stats = att.sessionStats(session.id);
  const records = att.sessionRecords(session.id);
  const enrolled = db.prepare("SELECT COUNT(*) n FROM enrollments WHERE course_id = ? AND status = 'active'").get(session.course_id).n;
  const unmarked = Math.max(0, enrolled - stats.marked);

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <Link href={`/courses/${course.id}/attendance`} className="small muted">← {course.name} attendance</Link>
          <h1 style={{ marginTop: 6 }}>Session of {fmtDate(session.session_date)}</h1>
          <p className="muted small">
            Opened {fmtDateTime(session.opened_at)} · code <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800 }}>{session.code}</span>
          </p>
        </div>
        <div className="actions">
          <Pill tone={session.status === "open" ? "green" : "neutral"}>{session.status}</Pill>
          {session.status === "open" ? (
            <form action={closeSession}>
              <input type="hidden" name="session_id" value={session.id} />
              <button className="btn danger sm" type="submit">Close session</button>
            </form>
          ) : (
            <form action={reopenSession}>
              <input type="hidden" name="session_id" value={session.id} />
              <button className="btn ghost sm" type="submit">Reopen (10 min)</button>
            </form>
          )}
          <Link className="btn ghost sm" href={`/courses/${course.id}/attendance/${session.id}/export`}>Export CSV</Link>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Marked" value={`${stats.marked}/${enrolled}`} hint={unmarked > 0 ? `${unmarked} unmarked` : "everyone accounted for"} tone={unmarked === 0 ? "green" : ""} />
        <StatCard label="Present" value={stats.present} tone="green" />
        <StatCard label="Late" value={stats.late} tone={stats.late ? "warn" : ""} />
        <StatCard label="Absent" value={stats.absent} tone={stats.absent ? "danger" : ""} />
        <StatCard label="Excused" value={stats.excused} />
      </div>

      <section className="panel" aria-labelledby="recs-h">
        <h2 id="recs-h">Records</h2>
        {records.length === 0 ? (
          <Empty title="No records yet" text="Nobody has been marked for this session." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Student ID</th><th>Status</th><th>Method</th><th>Marked at</th><th>Note</th><th><span className="sr-only">Correct</span></th></tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.full_name}</strong></td>
                    <td>{r.roll_no || "—"}</td>
                    <td><Pill tone={TONE[r.status]}>{r.status}</Pill></td>
                    <td className="small muted">{r.method === "manual" ? "by teacher" : r.method.toUpperCase()}</td>
                    <td className="small muted">{fmtDateTime(r.marked_at)}</td>
                    <td className="small muted">{r.note || ""}</td>
                    <td>
                      <ActionForm action={correctRecord} submitLabel="Save" className="form correction">
                        <input type="hidden" name="record_id" value={r.id} />
                        <div className="correction-fields">
                          <select name="status" defaultValue={r.status} aria-label={`New status for ${r.full_name}`}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <input name="reason" placeholder="Reason for correction (required)" maxLength={500} />
                        </div>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">Corrections keep the original mark in the audit log and require a reason note.</p>
      </section>
    </Shell>
  );
}
