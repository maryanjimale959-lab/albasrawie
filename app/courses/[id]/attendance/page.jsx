import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { courseForTeacher, courseForStudent } from "@/lib/guards";
import { attendanceSummary } from "@/lib/activity";
import * as att from "@/lib/attendance";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { publicOrigin } from "@/lib/origin";
import { startSession, markRecord, closeSession } from "@/app/actions/attendance";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import CourseTabs from "@/components/CourseTabs";
import { StatCard, Pill, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance · Albasrawie" };

const TONE = { present: "green", late: "amber", absent: "red", excused: "neutral" };

export default async function CourseAttendancePage({ params }) {
  const user = await requireUser();
  const id = Number(params.id);

  if (user.role === "student") {
    const course = await courseForStudent(user, id);
    if (!course) notFound();
    return <Shell user={user}><StudentAttendance course={course} user={user} /></Shell>;
  }

  const course = await courseForTeacher(user, id);
  if (!course) notFound();

  const open = await att.openSession(course.id);
  let qr = null;
  if (open && att.isAccepting(open)) {
    const origin = publicOrigin(headers());
    const url = `${origin}/attendance/join?session=${open.id}&code=${open.code}`;
    qr = { url, dataUrl: await QRCode.toDataURL(url, { width: 320, margin: 1 }) };
  }

  return <Shell user={user}><TeacherAttendance course={course} open={open} qr={qr} /></Shell>;
}

function Head({ course, sub }) {
  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/courses/${course.id}`} className="small muted">← {course.name}</Link>
          <h1 style={{ marginTop: 6 }}>Attendance</h1>
          {sub && <p className="muted">{sub}</p>}
        </div>
      </div>
      <CourseTabs courseId={course.id} active="attendance" />
    </>
  );
}

async function TeacherAttendance({ course, open, qr }) {
  const sessions = await att.courseSessions(course.id);
  const rate = await att.courseAttendanceRate(course.id);
  const roster = open ? await att.rosterForSession(open.id) : null;
  const stats = open ? await att.sessionStats(open.id) : null;
  const accepting = open && att.isAccepting(open);

  return (
    <>
      <Head course={course} sub={rate === null ? "No closed sessions yet." : `Course rate over closed sessions: ${Math.round(rate)}%`} />

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          {open ? (
            <section className="panel" aria-labelledby="open-h">
              <div className="section-title">
                <h2 id="open-h">Session of {fmtDate(open.session_date)}</h2>
                <Pill tone={accepting ? "green" : "amber"}>{accepting ? "Open" : "Waiting to close"}</Pill>
              </div>

              {accepting && (
                <div className="code-hero">
                  <p className="small muted">Students can join until {fmtDateTime(open.closes_at)} with:</p>
                  <span className="code">{open.code}</span>
                  {qr && (
                    <div className="qr-box">
                      <img src={qr.dataUrl} alt={`QR code for attendance session ${open.code}`} />
                    </div>
                  )}
                  {qr && <p className="small muted">{qr.url}</p>}
                </div>
              )}

              <div className="stat-grid">
                <StatCard label="Marked" value={`${stats.marked}/${roster.enrolled}`} tone={stats.marked === roster.enrolled ? "green" : ""} />
                <StatCard label="Present" value={stats.present} tone="green" />
                <StatCard label="Late" value={stats.late} tone={stats.late ? "warn" : ""} />
                <StatCard label="Absent" value={stats.absent} tone={stats.absent ? "danger" : ""} />
                <StatCard label="Excused" value={stats.excused} />
              </div>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Student ID</th><th>Status</th><th><span className="sr-only">Mark</span></th></tr></thead>
                  <tbody>
                    {roster.rows.map((s) => (
                      <tr key={s.user_id}>
                        <td><strong>{s.full_name}</strong></td>
                        <td>{s.roll_no || "—"}</td>
                        <td>{s.status ? <Pill tone={TONE[s.status]}>{s.status}</Pill> : <span className="small muted">unmarked</span>}</td>
                        <td>
                          {accepting ? (
                            <div className="actions roster-actions">
                              {["present", "late", "excused", "absent"].map((st) => (
                                <form key={st} action={markRecord}>
                                  <input type="hidden" name="session_id" value={open.id} />
                                  <input type="hidden" name="student_id" value={s.user_id} />
                                  <input type="hidden" name="status" value={st} />
                                  <button
                                    type="submit"
                                    className={`btn sm ${s.status === st ? "" : st === "absent" ? "danger" : "ghost"}`}
                                    title={`Mark ${s.full_name} ${st}`}
                                  >{st[0].toUpperCase() + st.slice(1)}</button>
                                </form>
                              ))}
                            </div>
                          ) : (
                            <span className="small muted">session expired</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {roster.rows.length === 0 && <p className="muted small">No enrolled students yet — nothing to mark.</p>}
              </div>

              <div className="actions">
                <Link href={`/courses/${course.id}/attendance`} className="btn ghost sm">Refresh counts</Link>
                <form action={closeSession}>
                  <input type="hidden" name="session_id" value={open.id} />
                  <button className="btn danger sm" type="submit">Close session</button>
                </form>
              </div>
              <p className="small muted">Closing marks everyone still unmarked as absent. Use the session page to correct records afterwards.</p>
            </section>
          ) : (
            <section className="panel" aria-labelledby="start-h">
              <h2 id="start-h">Start attendance</h2>
              <p className="muted small">Opens a 6-character code and QR students can use to mark themselves present. A new session also closes any leftover open one.</p>
              <ActionForm action={startSession} submitLabel="Start session">
                <input type="hidden" name="course_id" value={course.id} />
                <div className="row">
                  <label>Open for (minutes)<span className="hint">default 10</span>
                    <input type="number" name="duration" min="1" max="180" defaultValue="10" />
                  </label>
                </div>
              </ActionForm>
            </section>
          )}

          <section className="panel" aria-labelledby="hist-h">
            <h2 id="hist-h">Previous sessions</h2>
            {sessions.filter((s) => !open || s.id !== open.id).length === 0 ? (
              <Empty title="No past sessions" text="Sessions you close will appear here with their attendance rate." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Marked</th><th>Rate</th><th>Status</th><th><span className="sr-only">Detail</span></th></tr></thead>
                  <tbody>
                    {sessions.filter((s) => !open || s.id !== open.id).map((s) => (
                      <tr key={s.id}>
                        <td><strong>{fmtDate(s.session_date)}</strong></td>
                        <td>{s.marked}/{s.enrolled}</td>
                        <td>{s.rate === null ? "—" : `${Math.round(s.rate)}%`}</td>
                        <td><Pill tone={s.status === "open" ? "blue" : "neutral"}>{s.status}</Pill></td>
                        <td><Link className="btn ghost sm" href={`/courses/${course.id}/attendance/${s.id}`}>Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel" aria-labelledby="how-h">
            <h2 id="how-h">How it works</h2>
            <ol className="small muted" style={{ paddingLeft: "1.2rem", margin: 0, display: "grid", gap: ".35rem" }}>
              <li>Start a session — a code and QR appear for your class.</li>
              <li>Students scan or type the code within the window; later than ~5 minutes is recorded as late.</li>
              <li>Mark anyone by hand in the roster, then close the session. Unmarked students become absent.</li>
              <li>Correct any record later from the session page — every correction needs a reason and is audited.</li>
            </ol>
          </section>
          <section className="panel" aria-labelledby="rates-h">
            <h2 id="rates-h">Course stats</h2>
            <div className="stat-grid">
              <StatCard label="Sessions" value={sessions.length} />
              <StatCard label="Attendance rate" value={rate === null ? "—" : `${Math.round(rate)}%`} hint="present + late, over closed sessions" />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

async function StudentAttendance({ course, user }) {
  const summary = await attendanceSummary(user.id);
  const openSessions = (await att.openSessionsForStudent(user.id)).filter((s) => s.course_id === course.id);
  const history = await att.studentHistory(user.id);

  return (
    <>
      <Head course={course} sub="Your attendance in this course." />

      <div className="stat-grid">
        <StatCard label="Attendance" value={summary.percent === null ? "—" : `${summary.percent}%`} hint={summary.total ? `${summary.present + summary.late}/${summary.total - summary.excused} counted sessions` : "No closed sessions yet"} tone={summary.percent !== null && summary.percent < 70 ? "danger" : ""} />
        <StatCard label="Present" value={summary.present} tone="green" />
        <StatCard label="Late" value={summary.late} tone={summary.late ? "warn" : ""} />
        <StatCard label="Absent" value={summary.absent} tone={summary.absent ? "danger" : ""} />
        <StatCard label="Excused" value={summary.excused} />
      </div>

      {openSessions.length > 0 && (
        <section className="panel" aria-labelledby="now-h">
          <h2 id="now-h">Attendance is open</h2>
          <div className="work-list">
            {openSessions.map((s) => (
              <Link key={s.id} href={`/attendance/join?session=${s.id}`} className="work-item" style={{ borderColor: "var(--accent)" }}>
                <div className="grow">
                  <h3>{course.name}</h3>
                  <p className="small muted">Session on {fmtDate(s.session_date)} — mark yourself present</p>
                </div>
                <Pill tone="blue">Now</Pill>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="myhist-h">
        <h2 id="myhist-h">My attendance history</h2>
        {history.length === 0 ? (
          <Empty title="Nothing recorded yet" text="Your marks will appear here after your teacher runs the first session." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Course</th><th>Status</th><th>How</th><th>Marked at</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td><strong>{fmtDate(h.session_date)}</strong></td>
                    <td>{h.course_name}</td>
                    <td><Pill tone={TONE[h.status]}>{h.status}</Pill></td>
                    <td className="small muted">{h.method === "manual" ? "by teacher" : h.method.toUpperCase()}</td>
                    <td className="small muted">{fmtDateTime(h.marked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
