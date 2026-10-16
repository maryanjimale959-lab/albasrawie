import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { teacherCourses, studentCourses } from "@/lib/courses";
import { studentStats, heatmap, activityFeed, upcomingWork, weeklyActivity, activityLink, streaks } from "@/lib/activity";
import { dueLabel, fmtDate, firstName } from "@/lib/format";
import { goToJoin } from "@/app/actions";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import HeatmapChart from "@/components/Heatmap";
import CourseCover from "@/components/CourseCover";
import { StatCard, Pill, Avatar, Bars, Empty } from "@/components/ui";
import { Reveal, CountUp } from "@/components/motion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · Albasrawie" };

export default async function Dashboard() {
  const user = await requireUser();
  /* An administrator has no classroom of their own to look at — their home is
     the console. Any page that bounces a mismatched role back here lands them
     where they actually work. */
  if (user.role === "admin") redirect("/admin");
  return <Shell user={user}>{user.role === "teacher" ? <TeacherHome user={user} /> : <StudentHome user={user} />}</Shell>;
}

async function StudentHome({ user }) {
  const courses = await studentCourses(user.id);
  const sp = await db.prepare("SELECT * FROM student_profiles WHERE user_id = ?").get(user.id);
  const s = await studentStats(user.id);
  const cells = await heatmap(user.id);
  const feed = await activityFeed(user.id, 10);
  const { items, openSessions } = await upcomingWork(user.id);
  const weeks = await weeklyActivity(user.id, 12);
  const att = s.attendance;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="hero-eyebrow"><span className="status-dot" /> {today}</p>
            <h1>Welcome back, {firstName(user.full_name)}</h1>
            <p className="hero-sub">
              {s.streak.current > 0
                ? <>You&apos;re on a <strong>{s.streak.current}-day learning streak</strong> — {courses.length} active course{courses.length === 1 ? "" : "s"} keeping you moving.</>
                : <>You have {courses.length} active course{courses.length === 1 ? "" : "s"}. Log some study time to start a streak.</>}
            </p>
            {sp?.bio && (
              <p className="hero-bio" style={{ marginTop: "0.5rem", color: "rgba(255, 255, 255, 0.9)", fontSize: "0.92rem", fontStyle: "italic" }}>
                &ldquo;{sp.bio}&rdquo;
              </p>
            )}
            <div className="hero-actions">
              <Link href="/join" className="btn btn-hero-join">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2" /><path d="M8.5 2h7" /><path d="M7 15h10" /></svg>
                Join a course
              </Link>
              <Link href="/activity" className="btn btn-hero-ghost">Log activity</Link>
              {!sp?.bio && (
                <Link href="/settings" className="btn btn-hero-ghost" style={{ fontSize: "0.85rem" }}>
                  Add bio
                </Link>
              )}
            </div>
          </div>
          <div className="hero-stats">
            <div className="hero-chip pop-in">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
              <span>
                <span className="hc-label">Current streak</span>
                <span className="hc-value"><CountUp value={s.streak.current} /> {s.streak.current === 1 ? "day" : "days"}</span>
              </span>
            </div>
            <div className="hero-chip pop-in" style={{ animationDelay: "0.15s" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              <span>
                <span className="hc-label">Learning days</span>
                <span className="hc-value"><CountUp value={s.streak.activeDays} /></span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="stat-grid">
        <StatCard label="Active courses" value={s.courses} icon="book" delay={0} />
        <StatCard label="Assignments done" value={s.assignments.done} tone="green" icon="check" delay={50} />
        <StatCard label="Assignments pending" value={s.assignments.pending} tone={s.assignments.pending > 0 ? "warn" : ""} icon="clock" delay={100} />
        <StatCard label="Projects completed" value={s.projects.done} tone="green" icon="folder" delay={150} />
        <StatCard label="Projects in progress" value={s.projects.inProgress} icon="layers" delay={200} />
        <StatCard label="Attendance" value={att.percent === null ? "—" : `${att.percent}%`} hint={att.total ? `${att.present + att.late}/${att.total - att.excused} counted sessions` : "No closed sessions yet"} icon="calendar" delay={250} />
        <StatCard label="Learning days" value={s.streak.activeDays} tone="green" icon="zap" delay={300} />
        <StatCard label="Longest streak" value={s.streak.longest} hint="days" icon="flame" delay={350} />
      </div>

      {/* Heatmap */}
      <Reveal>
        <section className="panel" aria-labelledby="hm-h">
          <div className="section-title">
            <h2 id="hm-h">Learning activity</h2>
            <Link href="/activity" className="btn ghost sm">Log activity</Link>
          </div>
          <HeatmapChart cells={cells} dayLink={(d) => `/activity?day=${d}`} />
          <p className="small muted">
            {s.streak.activeDays} active days in the last year · current streak <strong>{s.streak.current}</strong> · longest <strong>{s.streak.longest}</strong>.
            Only meaningful work counts: submissions, milestones, quizzes and logged study sessions — not logins.
          </p>
        </section>
      </Reveal>

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <Reveal>
            <section className="panel" aria-labelledby="up-h">
              <h2 id="up-h">Upcoming work</h2>
              {openSessions.length > 0 && (
                <div className="work-list">
                  {openSessions.map((ss) => (
                    <Link key={`s${ss.id}`} href={`/attendance/join?session=${ss.id}`} className="work-item" style={{ borderColor: "var(--accent)" }}>
                      <div className="grow"><h3>Attendance is open: {ss.course_name}</h3><p className="small muted">Session on {fmtDate(ss.session_date)} — mark yourself present</p></div>
                      <Pill tone="blue"><span className="status-dot" /> Now</Pill>
                    </Link>
                  ))}
                </div>
              )}
              {items.length === 0 && openSessions.length === 0 ? (
                <p className="muted small">Nothing due. You&apos;re on top of everything.</p>
              ) : (
                <div className="work-list">
                  {items.map((w) => {
                    const due = dueLabel(w.due);
                    return (
                      <Link key={`${w.kind}${w.id}`} href={w.kind === "assignment" ? `/assignments/${w.id}` : `/projects/${w.id}`} className="work-item">
                        <div className="grow">
                          <h3>{w.title}</h3>
                          <p className="small muted">{w.course_name} · {w.kind === "assignment" ? "Assignment" : "Project"}</p>
                        </div>
                        <span className={`due ${due.tone}`}>{due.text}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={80}>
            <section className="panel" aria-labelledby="feed-h">
              <h2 id="feed-h">Recent activity</h2>
              {feed.length === 0 ? (
                <p className="muted small">Your completed work will show up here.</p>
              ) : (
                <div className="feed">
                  {feed.map((a) => (
                    <Link key={a.id} href={activityLink(a)} className="feed-item">
                      <span className={`feed-dot ${a.verification === "self_reported" ? "self" : ""}`} />
                      <span className="feed-main">
                        <strong style={{ fontSize: "0.925rem" }}>{a.description || a.type}</strong>
                        <p className="small muted">{a.course_name ? `${a.course_name} · ` : ""}{a.verification === "self_reported" ? "Self-reported" : a.verification === "teacher_confirmed" ? "Teacher-confirmed" : "Verified"}</p>
                      </span>
                      <span className="feed-date">{fmtDate(a.activity_date)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </Reveal>
        </div>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <Reveal>
            <section className="panel" aria-labelledby="join-h">
              <h2 id="join-h">Join a course</h2>
              <ActionForm action={goToJoin} submitLabel="Find course" className="form">
                <label>Course code<input name="code" placeholder="PY-7K4M9" autoCapitalize="characters" autoComplete="off" required /></label>
              </ActionForm>
            </section>
          </Reveal>

          <Reveal delay={80}>
            <section className="panel" aria-labelledby="wk-h">
              <h2 id="wk-h">Last 12 weeks</h2>
              <Bars data={weeks.map((w) => ({ label: `Week of ${w.from}`, short: new Date(w.from + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: w.count }))} unit="activities" />
              <p className="small muted">{weeks.reduce((n, w) => n + w.count, 0)} activity items in the last 12 weeks.</p>
            </section>
          </Reveal>

          {courses.length > 0 && (
            <Reveal delay={160}>
              <section className="panel" aria-labelledby="mc-h">
                <h2 id="mc-h">My courses</h2>
                <div className="work-list">
                  {courses.map((c) => (
                    <Link key={c.id} href={`/courses/${c.id}`} className="work-item">
                      <CourseCover name={c.name} className="work-cover" />
                      <div className="grow"><h3>{c.name}</h3><p className="small muted">{c.teacher_name}</p></div>
                      <Pill tone="neutral">Open</Pill>
                    </Link>
                  ))}
                </div>
              </section>
            </Reveal>
          )}
        </div>
      </div>

      {courses.length === 0 && (
        <Empty title="No courses yet" text="Ask your teacher for a course code, then enter it above to join." icon="book">
          <Link href="/join" className="btn">Enter a course code</Link>
        </Empty>
      )}
    </>
  );
}

async function TeacherHome({ user }) {
  const courses = await teacherCourses(user.id);
  const live = courses.filter((c) => !c.archived);
  if (user.status === "pending") {
    return (
      <>
        <h1>Hi, {firstName(user.full_name)}</h1>
        <div className="alert info">Your teacher account is waiting for approval by a platform administrator. You can create courses as soon as it&apos;s approved.</div>
      </>
    );
  }
  const ids = courses.map((c) => c.id);
  const inIds = ids.length ? `(${ids.join(",")})` : "(NULL)";
  const q = async (sql) => await db.prepare(sql).get();
  const pendingGrading = (await q(`SELECT COUNT(*) n FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id IN ${inIds} AND s.status IN ('submitted','revision')`)).n
    + (await q(`SELECT COUNT(*) n FROM project_submissions p JOIN projects pr ON pr.id = p.project_id WHERE pr.course_id IN ${inIds} AND p.status IN ('submitted','under_review')`)).n;
  const openSessions = (await q(`SELECT COUNT(*) n FROM attendance_sessions s WHERE s.course_id IN ${inIds} AND s.status = 'open'`)).n;
  const totalAssignments = (await q(`SELECT COUNT(*) n FROM assignments WHERE course_id IN ${inIds}`)).n;
  const totalProjects = (await q(`SELECT COUNT(*) n FROM projects WHERE course_id IN ${inIds}`)).n;
  const totalStudents = live.reduce((n, c) => n + c.student_count, 0);

  const recentSubs = await db.prepare(`
    SELECT s.id, s.submitted_at, s.status, a.title, a.id AS aid, c.name AS course, u.full_name, u.id AS uid
    FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id JOIN users u ON u.id = s.student_id
    WHERE a.course_id IN ${inIds} AND s.status IN ('submitted','revision') ORDER BY s.submitted_at DESC LIMIT 6`).all();
  const dueSoon = await db.prepare(`
    SELECT kind, id, title, course_name, due FROM (
      SELECT 'assignment' AS kind, a.id, a.title, c.name AS course_name, a.due_at AS due FROM assignments a JOIN courses c ON c.id = a.course_id
      WHERE a.course_id IN ${inIds} AND a.published = 1 AND a.due_at IS NOT NULL
      UNION ALL
      SELECT 'project' AS kind, p.id, p.title, c.name, p.deadline FROM projects p JOIN courses c ON c.id = p.course_id
      WHERE p.course_id IN ${inIds} AND p.published = 1 AND p.deadline IS NOT NULL) AS upcoming
    WHERE due > UTC_TIMESTAMP() ORDER BY due ASC LIMIT 5`).all();
  const missingStudents = await db.prepare(`
    SELECT u.id, u.full_name, c.name AS course_name, COUNT(*) AS missing
    FROM assignments a JOIN courses c ON c.id = a.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.status = 'active'
    JOIN users u ON u.id = e.student_id
    WHERE a.course_id IN ${inIds} AND a.published = 1 AND a.due_at IS NOT NULL AND a.due_at < UTC_TIMESTAMP()
      AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.student_id = u.id)
    GROUP BY u.id, c.id, u.full_name, c.name ORDER BY missing DESC LIMIT 6`).all();
  const lowAttendance = await db.prepare(`
    SELECT u.id, u.full_name, c.name AS course_name,
      ROUND(100.0 * SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) / COUNT(*)) AS rate
    FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id AND s.status = 'closed'
    JOIN courses c ON c.id = s.course_id JOIN users u ON u.id = r.student_id
    WHERE s.course_id IN ${inIds} GROUP BY u.id, c.id, u.full_name, c.name HAVING rate < 70 AND COUNT(*) >= 2 ORDER BY rate ASC LIMIT 5`).all();

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="hero-eyebrow"><span className="status-dot" /> Teacher workspace</p>
            <h1>Hi, {firstName(user.full_name)}</h1>
            <p className="hero-sub">{live.length} active course{live.length === 1 ? "" : "s"} · {totalStudents} enrolled student{totalStudents === 1 ? "" : "s"} · {pendingGrading} submission{pendingGrading === 1 ? "" : "s"} waiting for review.</p>
            <div className="hero-actions">
              <Link href="/courses/new" className="btn" style={{ background: "#fff", color: "#1e1b4b" }}>Create a course</Link>
              <Link href="/analytics" className="btn ghost">View analytics</Link>
            </div>
          </div>
          <div className="hero-stats">
            <div className="hero-chip pop-in">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              <span>
                <span className="hc-label">Students</span>
                <span className="hc-value"><CountUp value={totalStudents} /></span>
              </span>
            </div>
            <div className="hero-chip pop-in" style={{ animationDelay: "0.15s" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span>
                <span className="hc-label">To review</span>
                <span className="hc-value"><CountUp value={pendingGrading} /></span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard label="Courses" value={courses.length} icon="book" delay={0} />
        <StatCard label="Students" value={totalStudents} icon="users" delay={50} />
        <StatCard label="Assignments" value={totalAssignments} icon="clipboard" delay={100} />
        <StatCard label="Projects" value={totalProjects} icon="folder" delay={150} />
        <StatCard label="Awaiting review" value={pendingGrading} tone={pendingGrading > 0 ? "warn" : "green"} icon="eye" delay={200} />
        <StatCard label="Open attendance" value={openSessions} tone={openSessions > 0 ? "green" : ""} hint={openSessions > 0 ? "sessions running now" : ""} icon="calendar" delay={250} />
      </div>

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <Reveal>
            <section className="panel">
              <h2>Ready to grade</h2>
              {recentSubs.length === 0 ? <p className="muted small">No submissions waiting right now.</p> : (
                <div className="work-list">
                  {recentSubs.map((s) => (
                    <Link key={s.id} href={`/assignments/${s.aid}`} className="work-item">
                      <Avatar name={s.full_name} size={34} />
                      <div className="grow"><h3>{s.title}</h3><p className="small muted">{s.full_name} · {s.course}</p></div>
                      <span className="feed-date">{fmtDate(s.submitted_at.slice(0, 10))}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={80}>
            <section className="panel">
              <h2>Students missing work</h2>
              {courses.length === 0 ? <p className="muted small">Nothing to check yet — this appears once a course has past-due work.</p> : missingStudents.length === 0 ? <p className="muted small">Everyone has submitted their past-due work. Well done.</p> : (
                <div className="work-list">
                  {missingStudents.map((m) => (
                    <Link key={`${m.id}${m.course_name}`} href={`/students/${m.id}`} className="work-item">
                      <Avatar name={m.full_name} size={34} />
                      <div className="grow"><h3>{m.full_name}</h3><p className="small muted">{m.course_name}</p></div>
                      <Pill tone="red">{m.missing} missing</Pill>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={160}>
            <section className="panel">
              <h2>Needs support — low attendance</h2>
              {lowAttendance.length === 0 ? <p className="muted small">No attendance concerns right now.</p> : (
                <div className="work-list">
                  {lowAttendance.map((m) => (
                    <Link key={`${m.id}${m.course_name}`} href={`/students/${m.id}`} className="work-item">
                      <Avatar name={m.full_name} size={34} />
                      <div className="grow"><h3>{m.full_name}</h3><p className="small muted">{m.course_name}</p></div>
                      <Pill tone="amber">{m.rate}% attendance</Pill>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </Reveal>
        </div>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <Reveal>
            <section className="panel">
              <h2>Upcoming deadlines</h2>
              {dueSoon.length === 0 ? <p className="muted small">Nothing scheduled.</p> : (
                <div className="work-list">
                  {dueSoon.map((w) => {
                    const due = dueLabel(w.due);
                    return (
                      <Link key={`${w.kind}${w.id}`} href={w.kind === "assignment" ? `/assignments/${w.id}` : `/projects/${w.id}`} className="work-item">
                        <div className="grow"><h3>{w.title}</h3><p className="small muted">{w.course_name}</p></div>
                        <span className={`due ${due.tone}`}>{due.text}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={80}>
            <section className="panel">
              <h2>My courses</h2>
              {courses.length === 0 ? (
                <Empty title="Create your first course" text="You'll get a code to share with your students right away." icon="book">
                  <Link href="/courses/new" className="btn">Create a course</Link>
                </Empty>
              ) : (
                <div className="work-list">
                  {courses.map((c) => (
                    <Link key={c.id} href={`/courses/${c.id}`} className={`work-item ${c.archived ? "archived" : ""}`}>
                      <CourseCover name={c.name} className="work-cover" />
                      <div className="grow"><h3>{c.name}{c.archived ? " (archived)" : ""}</h3><p className="small muted">{c.student_count} student{c.student_count === 1 ? "" : "s"}</p></div>
                      {c.course_code && <span className="chip" style={{ fontFamily: "ui-monospace, monospace" }}>{c.course_code}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </Reveal>
        </div>
      </div>
    </>
  );
}
