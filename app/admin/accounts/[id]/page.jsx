import Link from "next/link";
import { redirect } from "next/navigation";
import { requireConsoleUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Avatar, Pill, Empty, StatCard } from "@/components/ui";
import { auditLabel, resolveTargets } from "@/lib/auditLabels";
import { studentStats, activityFeed, upcomingWork } from "@/lib/activity";
import { studentCourses } from "@/lib/courses";
import AdminTabs from "@/components/AdminTabs";
import { approveTeacher, changeRole, resetPassword, restoreAccount, suspendAccount } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const roleWord = (r) => (r === "admin" ? "administrator" : r);
const roleTone = (r) => (r === "admin" ? "violet" : r === "teacher" ? "blue" : "neutral");
const statusTone = (s) => (s === "active" ? "green" : s === "pending" ? "amber" : "red");
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export default async function AdminAccountPage({ params, searchParams }) {
  const me = await requireConsoleUser();
  const id = Number(params.id);
  if (!id) redirect("/admin/accounts");

  const acct = await db.prepare(`
    SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at, u.avatar_url, u.time_zone,
           sp.student_id AS student_ref, sp.class_name, sp.bio AS student_bio,
           tp.organization, tp.department, tp.bio AS teacher_bio
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
    WHERE u.id = ?`).get(id);
  if (!acct) redirect(`/admin/accounts?msg=${encodeURIComponent("That account no longer exists.")}`);

  const lastLogin = (await db.prepare(
    "SELECT MAX(created_at) at FROM sessions WHERE user_id = ?").get(id))?.at || null;
  const msg = (searchParams.msg || "").toString();

  return (
    <>
      <AdminTabs active="accounts" />
      {msg && <div className="alert ok">{msg}</div>}

      <div className="page-head">
        <div>
          <p className="muted small" style={{ marginBottom: ".35rem" }}>
            <Link href="/admin/accounts">Accounts</Link> / {acct.full_name}
          </p>
          <div style={{ display: "flex", gap: ".7rem", alignItems: "center", flexWrap: "wrap" }}>
            <Avatar name={acct.full_name} size={44} img={acct.avatar_url} />
            <div>
              <h1 style={{ marginBottom: 0 }}>{acct.full_name}</h1>
              <p className="muted">{acct.email}</p>
            </div>
            <div className="chips">
              <Pill tone={roleTone(acct.role)}>{roleWord(acct.role)}</Pill>
              <Pill tone={statusTone(acct.status)}>{acct.status}</Pill>
            </div>
          </div>
          <div className="chips" style={{ marginTop: ".7rem" }}>
            <span className="chip">Joined {fmtDate(acct.created_at)}</span>
            <span className="chip">Last sign-in {lastLogin ? fmtDateTime(lastLogin) : "never"}</span>
            <span className="chip">{acct.time_zone}</span>
            {acct.organization && <span className="chip">{acct.organization}</span>}
            {acct.department && <span className="chip">{acct.department}</span>}
            {acct.student_ref && <span className="chip">Student ID {acct.student_ref}</span>}
            {acct.class_name && <span className="chip">{acct.class_name}</span>}
          </div>
          {(acct.teacher_bio || acct.student_bio) && (
            <p className="small" style={{ marginTop: ".6rem", maxWidth: "60ch" }}>
              {acct.teacher_bio || acct.student_bio}
            </p>
          )}
        </div>
        <div className="chips">
          {acct.role !== "admin" && (
            <Link className="btn ghost sm" href={acct.role === "teacher" ? "/teach" : "/"}>
              {acct.role === "teacher" ? "The teacher page" : "The student page"}
            </Link>
          )}
        </div>
      </div>

      {acct.role === "teacher" ? <TeacherWorkspace acct={acct} /> : null}
      {acct.role === "student" ? <StudentWorkspace acct={acct} /> : null}
      {acct.role === "admin" ? <AdminWorkspace acct={acct} /> : null}

      <ManagePanel me={me} acct={acct} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * What a teacher spends the account doing
 * ------------------------------------------------------------------ */
async function TeacherWorkspace({ acct }) {
  const totals = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM courses WHERE teacher_id = ?) AS courses,
      (SELECT COUNT(*) FROM courses WHERE teacher_id = ? AND archived = 0) AS live_courses,
      (SELECT COUNT(*) FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE c.teacher_id = ? AND e.status = 'active') AS learners,
      (SELECT COUNT(*) FROM assignments a JOIN courses c ON c.id = a.course_id WHERE c.teacher_id = ?) AS assignments,
      (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
        JOIN courses c ON c.id = a.course_id WHERE c.teacher_id = ?) AS submissions,
      (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
        JOIN courses c ON c.id = a.course_id WHERE c.teacher_id = ? AND s.status IN ('submitted','late','revision')) AS to_mark,
      (SELECT COUNT(*) FROM attendance_sessions ses JOIN courses c ON c.id = ses.course_id WHERE c.teacher_id = ?) AS classes,
      (SELECT COUNT(*) FROM attendance_sessions ses JOIN courses c ON c.id = ses.course_id
        WHERE c.teacher_id = ? AND ses.status = 'open') AS open_classes,
      (SELECT COUNT(*) FROM announcements an JOIN courses c ON c.id = an.course_id WHERE c.teacher_id = ?) AS announcements,
      (SELECT COUNT(*) FROM materials m JOIN courses c ON c.id = m.course_id WHERE c.teacher_id = ?) AS materials
  `).get(acct.id, acct.id, acct.id, acct.id, acct.id, acct.id, acct.id, acct.id, acct.id, acct.id);

  const courses = await db.prepare(`
    SELECT c.id, c.name, c.course_code, c.archived, c.created_at, c.category,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS learners,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.published = 1) AS assignments,
      (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE a.course_id = c.id AND s.status IN ('submitted','late','revision')) AS to_mark,
      (SELECT COUNT(*) FROM attendance_sessions ses WHERE ses.course_id = c.id) AS classes,
      (SELECT MAX(ses.session_date) FROM attendance_sessions ses WHERE ses.course_id = c.id) AS last_class
    FROM courses c WHERE c.teacher_id = ? ORDER BY c.archived, c.created_at DESC`).all(acct.id);

  const log = await db.prepare(`
    SELECT id, action, target, details, created_at FROM audit_logs
    WHERE user_id = ? AND action <> 'user.login' ORDER BY id DESC LIMIT 8`).all(acct.id);
  const about = await resolveTargets(log);

  return (
    <>
      <section className="panel">
        <h2>How this teacher works</h2>
        <p className="small muted">
          This is the account as they see it: the courses they run, who is on their rosters, the register
          they keep and the marking still on their desk. It is read-only — nothing here changes their work.
        </p>
        <div className="stat-grid">
          <StatCard label="Courses" value={totals.live_courses} icon="book" hint={`${totals.courses - totals.live_courses} archived`} />
          <StatCard label="Learners" value={totals.learners} icon="users" delay={60} />
          <StatCard label="Classes taken" value={totals.classes} icon="cap" hint={totals.open_classes ? `${totals.open_classes} open right now` : "none open right now"} delay={120} />
          <StatCard label="Awaiting marking" value={totals.to_mark} icon="clock" tone={totals.to_mark ? "warn" : ""} hint={`${totals.submissions} handed in`} delay={180} />
        </div>
        <div className="chips">
          <span className="chip">{totals.assignments} assignments set</span>
          <span className="chip">{totals.materials} materials shared</span>
          <span className="chip">{totals.announcements} announcements posted</span>
        </div>
      </section>

      <section className="panel">
        <h2>Their courses ({courses.length})</h2>
        {courses.length === 0 ? (
          <Empty icon="book" title="No courses yet" text="This teacher has signed up but has not created a course. The next step for them is the new-course form." />
        ) : (
          <div className="table-wrap stack-cards">
            <table>
              <thead>
                <tr><th>Course</th><th>Code</th><th>Learners</th><th>Work</th><th>Register</th><th>Open</th></tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Course">
                      <strong>{c.name}</strong>
                      <div className="muted small">{c.category || "no subject"} · created {fmtDate(c.created_at)}{c.archived ? " · archived" : ""}</div>
                    </td>
                    <td data-label="Code" className="small">{c.course_code || "—"}</td>
                    <td data-label="Learners" className="small">{c.learners}</td>
                    <td data-label="Work" className="small">
                      {c.assignments} set{c.to_mark ? ` · ${c.to_mark} to mark` : ""}
                    </td>
                    <td data-label="Register" className="small">
                      {c.classes} taken{c.last_class ? ` · last ${fmtDate(c.last_class)}` : ""}
                    </td>
                    <td data-label="Open"><Link className="btn ghost sm" href={`/courses/${c.id}`}>Look inside</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>What they have done lately</h2>
        {log.length === 0 ? <p className="muted small">Nothing recorded yet.</p> : (
          <div className="feed">
            {log.map((a) => (
              <div className="feed-item" key={a.id}>
                <span className="feed-dot" aria-hidden="true" />
                <div className="feed-main">
                  <strong>{auditLabel(a.action)}</strong>
                  <div className="muted small">{fmtDateTime(a.created_at)}{a.target ? ` · ${about(a.target)}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link className="btn ghost sm" href={`/admin/audit?q=${encodeURIComponent(acct.full_name)}`}>Every entry for this account</Link>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * What a student spends the account doing
 * ------------------------------------------------------------------ */
async function StudentWorkspace({ acct }) {
  const s = await studentStats(acct.id);
  const courses = await db.prepare(`
    SELECT c.id, c.name, u.full_name AS teacher_name, e.enrolled_at,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.published = 1) AS set_work,
      (SELECT COUNT(*) FROM assignment_submissions sub JOIN assignments a ON a.id = sub.assignment_id
        WHERE a.course_id = c.id AND sub.student_id = e.student_id) AS handed_in,
      (SELECT COUNT(*) FROM attendance_sessions ses WHERE ses.course_id = c.id AND ses.status = 'closed') AS classes,
      (SELECT COUNT(*) FROM attendance_records r JOIN attendance_sessions ses ON ses.id = r.session_id
        WHERE r.student_id = e.student_id AND ses.course_id = c.id AND ses.status = 'closed'
        AND r.status IN ('present','late')) AS here,
      (SELECT ROUND(AVG(sub.score)) FROM assignment_submissions sub JOIN assignments a ON a.id = sub.assignment_id
        WHERE a.course_id = c.id AND sub.student_id = e.student_id AND sub.status = 'graded' AND sub.grade_released = 1) AS avg_score,
      (SELECT MAX(a.max_marks) FROM assignment_submissions sub JOIN assignments a ON a.id = sub.assignment_id
        WHERE a.course_id = c.id AND sub.student_id = e.student_id AND sub.status = 'graded' AND sub.grade_released = 1) AS out_of
    FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = c.teacher_id
    WHERE e.student_id = ? AND e.status = 'active' AND c.archived = 0 ORDER BY c.name`).all(acct.id);
  const { items, openSessions } = await upcomingWork(acct.id);
  const feed = await activityFeed(acct.id, 8);
  const enrolled = await studentCourses(acct.id);

  return (
    <>
      <section className="panel">
        <h2>How this student works</h2>
        <p className="small muted">
          The account as they see it: the courses they joined, whether they turned up, what they handed in
          and what is still open. Read-only — marking for them stays with their teachers.
        </p>
        <div className="stat-grid">
          <StatCard label="Courses joined" value={Number(s.courses)} icon="book" />
          <StatCard label="Attendance" value={s.attendance.percent === null ? "—" : `${s.attendance.percent}%`}
            icon="cap" tone={s.attendance.percent !== null && s.attendance.percent < 75 ? "warn" : ""}
            hint={Number(s.attendance.total) === 0
              ? "no closed register yet"
              : `${Number(s.attendance.present)} present · ${Number(s.attendance.late)} late · ${Number(s.attendance.absent)} absent`} delay={60} />
          <StatCard label="Work handed in" value={Number(s.assignments.done)} icon="clock"
            hint={`${Number(s.assignments.pending)} still open`} delay={120} />
          <StatCard label="Learning days" value={Number(s.learningDays)} icon="users"
            hint={s.streak.current ? `${s.streak.current}-day streak` : "no streak running"} delay={180} />
        </div>
        {acct.student_ref && (
          <div className="chips">
            <span className="chip">{Number(s.activities)} logged activities</span>
            <span className="chip">{Number(s.projects.done)} projects completed</span>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Their courses ({courses.length})</h2>
        {courses.length === 0 ? (
          <Empty icon="book" title="No course yet" text="This account has not joined a course. It needs a code from one of its teachers, or you can enrol them from the course page." />
        ) : (
          <div className="table-wrap stack-cards">
            <table>
              <thead>
                <tr><th>Course</th><th>Teacher</th><th>Attendance</th><th>Handed in</th><th>Released marks</th><th>Open</th></tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Course">
                      <strong>{c.name}</strong>
                      <div className="muted small">joined {fmtDate(c.enrolled_at)}</div>
                    </td>
                    <td data-label="Teacher" className="small">{c.teacher_name}</td>
                    <td data-label="Attendance" className="small">{Number(c.here || 0)}/{c.classes} · {pct(c.here || 0, c.classes)}</td>
                    <td data-label="Handed in" className="small">{c.handed_in}/{c.set_work}</td>
                    <td data-label="Released marks" className="small">{c.avg_score === null ? "—" : `${c.avg_score}${c.out_of ? ` / ${c.out_of}` : ""}`}</td>
                    <td data-label="Open"><Link className="btn ghost sm" href={`/courses/${c.id}`}>Look inside</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <section className="panel">
          <h2>Still open</h2>
          {items.length === 0 && openSessions.length === 0 ? (
            <p className="muted small">Nothing outstanding. Every deadline they have is met.</p>
          ) : (
            <div className="feed">
              {openSessions.map((o) => (
                <div className="feed-item" key={`s${o.id}`}>
                  <span className="feed-dot" aria-hidden="true" />
                  <div className="feed-main">
                    <strong>Attendance is open</strong>
                    <div className="muted small">{o.course_name} · code {o.code} · {fmtDate(o.session_date)}</div>
                  </div>
                </div>
              ))}
              {items.map((i) => (
                <div className="feed-item" key={`i${i.kind}${i.id}`}>
                  <span className="feed-dot" aria-hidden="true" />
                  <div className="feed-main">
                    <strong>{i.title}</strong>
                    <div className="muted small">{i.course_name} · due {i.due ? fmtDateTime(i.due) : "no date"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Their activity</h2>
          {feed.length === 0 ? <p className="muted small">Nothing logged yet.</p> : (
            <div className="feed">
              {feed.map((a) => (
                <div className="feed-item" key={a.id}>
                  <span className="feed-dot" aria-hidden="true" />
                  <div className="feed-main">
                    <strong>{a.description || a.type}</strong>
                    <div className="muted small">{a.course_name || "no course"} · {fmtDate(a.activity_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="small muted">{enrolled.length} active enrolment{enrolled.length === 1 ? "" : "s"} on the account right now.</p>
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Another administrator
 * ------------------------------------------------------------------ */
async function AdminWorkspace({ acct }) {
  const log = await db.prepare(`
    SELECT id, action, target, details, created_at FROM audit_logs
    WHERE user_id = ? AND action <> 'user.login' ORDER BY id DESC LIMIT 12`).all(acct.id);
  const about = await resolveTargets(log);
  const counts = await db.prepare(`
    SELECT (SELECT COUNT(*) FROM courses WHERE teacher_id = ?) AS courses,
           (SELECT COUNT(*) FROM enrollments WHERE student_id = ? AND status = 'active') AS enrolments,
           (SELECT COUNT(*) FROM audit_logs WHERE user_id = ?) AS entries`).get(acct.id, acct.id, acct.id);

  return (
    <section className="panel">
      <h2>What this administrator has done</h2>
      <p className="small muted">
        An administrator has no classroom of their own, so there is no dashboard to look at — this is the
        record of the decisions they have taken.
      </p>
      <div className="chips">
        <span className="chip">{Number(counts.courses)} courses taught by them</span>
        <span className="chip">{Number(counts.enrolments)} enrolments</span>
        <span className="chip">{Number(counts.entries)} logged actions</span>
      </div>
      {log.length === 0 ? <p className="muted small" style={{ marginTop: "1rem" }}>Nothing recorded yet.</p> : (
        <div className="feed">
          {log.map((a) => (
            <div className="feed-item" key={a.id}>
              <span className="feed-dot" aria-hidden="true" />
              <div className="feed-main">
                <strong>{auditLabel(a.action)}</strong>
                <div className="muted small">{fmtDateTime(a.created_at)}{a.target ? ` · ${about(a.target)}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The decisions only the console can take
 * ------------------------------------------------------------------ */
function ManagePanel({ me, acct }) {
  const self = acct.id === me.id;
  return (
    <section className="panel">
      <h2>Manage this account</h2>
      {self ? (
        <p className="small">
          This is the account you are signed in with. Change your own name, email and password in{" "}
          <Link href="/settings">Settings</Link>; the console will not suspend or re-role you, so the
          platform cannot be locked out by accident.
        </p>
      ) : (
        <>
          <div className="row" style={{ alignItems: "start" }}>
            <div>
              <h3 className="small" style={{ textTransform: "uppercase", letterSpacing: ".06em" }}>Standing</h3>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                {acct.status === "pending" && (
                  <form action={approveTeacher}>
                    <input type="hidden" name="user_id" value={acct.id} />
                    <input type="hidden" name="next" value={`accounts/${acct.id}`} />
                    <button className="btn sm" type="submit">Approve the application</button>
                  </form>
                )}
                {acct.status === "suspended" ? (
                  <form action={restoreAccount}>
                    <input type="hidden" name="user_id" value={acct.id} />
                    <input type="hidden" name="next" value={`accounts/${acct.id}`} />
                    <button className="btn sm" type="submit">Restore access</button>
                  </form>
                ) : (
                  <form action={suspendAccount}>
                    <input type="hidden" name="user_id" value={acct.id} />
                    <input type="hidden" name="next" value={`accounts/${acct.id}`} />
                    <button className="btn danger sm" type="submit">Suspend</button>
                  </form>
                )}
              </div>
              <p className="small muted">Suspending signs the account out everywhere at once.</p>
            </div>

            <div>
              <h3 className="small" style={{ textTransform: "uppercase", letterSpacing: ".06em" }}>Role</h3>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "end" }}>
                {acct.role !== "teacher" && <RoleButton acct={acct} role="teacher" label="Make teacher" />}
                {acct.role !== "admin" && <RoleButton acct={acct} role="admin" label="Make administrator" />}
              </div>
              {acct.role !== "student" && (
                <form action={changeRole} className="row" style={{ marginTop: ".6rem", alignItems: "end" }}>
                  <input type="hidden" name="user_id" value={acct.id} />
                    <input type="hidden" name="next" value={`accounts/${acct.id}`} />
                  <input type="hidden" name="role" value="student" />
                  <label>Student ID<input name="student_id" placeholder="STU-2041" required /></label>
                  <label>Class<input name="class_name" placeholder="Grade 10 A" required /></label>
                  <button className="btn ghost sm" type="submit">Move back to student</button>
                </form>
              )}
              {acct.role === "teacher" && (
                <p className="small muted">
                  This teacher still runs courses. Archive them first if you move the account back to student.
                </p>
              )}
            </div>

            <div>
              <h3 className="small" style={{ textTransform: "uppercase", letterSpacing: ".06em" }}>Password</h3>
              <form action={resetPassword} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "end" }}>
                <input type="hidden" name="user_id" value={acct.id} />
                    <input type="hidden" name="next" value={`accounts/${acct.id}`} />
                <label style={{ minWidth: 190 }}>New password
                  <input name="password" placeholder="at least 8 characters" minLength={8} required autoComplete="new-password" />
                </label>
                <button className="btn ghost sm" type="submit">Reset it</button>
              </form>
              <p className="small muted">
                The sign-in pages tell people to ask you when they lose access. This is that answer: it sets
                a new password and signs their open sessions out.
              </p>
            </div>
          </div>

          <p className="small muted" style={{ marginTop: "1rem" }}>
            Every action on this page is written to the activity log with your name on it.
          </p>
        </>
      )}
    </section>
  );
}

function RoleButton({ acct, role, label }) {
  return (
    <form action={changeRole}>
      <input type="hidden" name="user_id" value={acct.id} />
                    <input type="hidden" name="next" value={`accounts/${acct.id}`} />
      <input type="hidden" name="role" value={role} />
      <button className="btn ghost sm" type="submit">{label}</button>
    </form>
  );
}
