import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { teacherCourses } from "@/lib/courses";
import { attendanceSummary } from "@/lib/activity";
import * as att from "@/lib/attendance";
import { fmtDate, fmtDateTime } from "@/lib/format";
import Shell from "@/components/Shell";
import { StatCard, Pill, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance · Albasrawie" };

const TONE = { present: "green", late: "amber", absent: "red", excused: "neutral" };

export default async function AttendanceLanding() {
  const user = await requireUser();
  return <Shell user={user}>{user.role === "student" ? <StudentLanding user={user} /> : <TeacherLanding user={user} />}</Shell>;
}

async function StudentLanding({ user }) {
  const summary = await attendanceSummary(user.id);
  const open = await att.openSessionsForStudent(user.id);
  const history = (await att.studentHistory(user.id)).slice(0, 15);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My attendance</h1>
          <p className="muted">Mark yourself present when a session is open, and review your history.</p>
        </div>
        <Link href="/attendance/join" className="btn ghost sm">Enter a code</Link>
      </div>

      <div className="stat-grid">
        <StatCard label="Attendance" value={summary.percent === null ? "—" : `${summary.percent}%`}
          hint={summary.total ? `${summary.present + summary.late}/${summary.total - summary.excused} counted sessions` : "No closed sessions yet"}
          tone={summary.percent !== null && summary.percent < 70 ? "danger" : ""} />
        <StatCard label="Present" value={summary.present} tone="green" />
        <StatCard label="Late" value={summary.late} tone={summary.late ? "warn" : ""} />
        <StatCard label="Absent" value={summary.absent} tone={summary.absent ? "danger" : ""} />
        <StatCard label="Excused" value={summary.excused} />
      </div>

      <section className="panel" aria-labelledby="open-h">
        <h2 id="open-h">Open right now</h2>
        {open.length === 0 ? (
          <p className="small muted">No session is accepting marks at the moment. When your teacher starts one, it will appear here.</p>
        ) : (
          <div className="work-list">
            {open.map((s) => (
              <Link key={s.id} href={`/attendance/join?session=${s.id}`} className="work-item" style={{ borderColor: "var(--accent)" }}>
                <div className="grow">
                  <h3>{s.course_name}</h3>
                  <p className="small muted">Session of {fmtDate(s.session_date)} · closes {fmtDateTime(s.closes_at)}</p>
                </div>
                <Pill tone="blue">Mark present</Pill>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="hist-h">
        <h2 id="hist-h">Recent history</h2>
        {history.length === 0 ? (
          <Empty title="Nothing recorded yet" text="Your attendance marks will show up here across all your courses." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Course</th><th>Status</th><th>How</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td><strong>{fmtDate(h.session_date)}</strong></td>
                    <td><Link href={`/courses/${h.course_id}/attendance`}>{h.course_name}</Link></td>
                    <td><Pill tone={TONE[h.status]}>{h.status}</Pill></td>
                    <td className="small muted">{h.method === "manual" ? "by teacher" : h.method.toUpperCase()}</td>
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

async function TeacherLanding({ user }) {
  const courses = user.role === "admin"
    ? await db.prepare(`
        SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS student_count
        FROM courses c ORDER BY c.archived, c.created_at DESC`).all()
    : await teacherCourses(user.id);

  const cards = [];
  for (const c of courses) {
    const open = await att.openSession(c.id);
    const rate = await att.courseAttendanceRate(c.id);
    const sessions = (await att.courseSessions(c.id)).length;
    cards.push({ c, open, rate, sessions });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Attendance</h1>
          <p className="muted">Start a session from any course — a code and QR appear for your class.</p>
        </div>
      </div>

      {courses.length === 0 ? (
        <Empty title="No courses yet" text="Create a course first, then attendance becomes available for it.">
          <Link href="/courses/new" className="btn">Create a course</Link>
        </Empty>
      ) : (
        <div className="grid-cards">
          {cards.map((card) => {
            const { c, open, rate, sessions } = card;
            return (
              <div key={c.id} className={`course-card ${c.archived ? "archived" : ""}`}>
                <div className="course-card-body">
                  <h3>{c.name}{c.archived ? " (archived)" : ""}</h3>
                  <p className="small muted">{c.student_count} student{c.student_count === 1 ? "" : "s"} · {sessions} session{sessions === 1 ? "" : "s"}</p>
                  <div className="chips">
                    <Pill tone={rate === null ? "neutral" : rate >= 80 ? "green" : rate >= 60 ? "amber" : "red"}>
                      {rate === null ? "no data" : `${Math.round(rate)}%`}
                    </Pill>
                    {open && <Pill tone="blue">open now</Pill>}
                  </div>
                  <div className="actions">
                    <Link href={`/courses/${c.id}/attendance`} className="btn sm">{open ? "View open session" : "Start attendance"}</Link>
                    <Link href={`/courses/${c.id}/attendance`} className="btn ghost sm">History</Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
