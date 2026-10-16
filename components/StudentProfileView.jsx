import Link from "next/link";
import { db } from "@/lib/db";
import { studentStats, heatmap, streaks, activityFeed, dayActivities } from "@/lib/activity";
import { fmtDate, fmtDateTime, firstName } from "@/lib/format";
import Heatmap from "./Heatmap";
import { StatCard, Pill, Avatar } from "./ui";
import { CountUp, Reveal } from "./motion";

const TYPE_LABEL = {
  course_joined: "joined a course", assignment_submitted: "submitted an assignment",
  project_submitted: "submitted a project", project_milestone: "completed a milestone",
  study_logged: "logged study time", external_project: "logged external project work", quiz_completed: "completed a quiz",
};

/**
 * Full learning profile. `viewer` decides visibility:
 * - the student themselves: everything + manage links
 * - a teacher of one of their courses: academic stats + that course's portfolio items
 * - personal projects only when portfolio_public = 1 (or own view)
 */
export default async function StudentProfileView({ student, viewer, selectedDay = null }) {
  const isSelf = viewer.id === student.id;
  const sp = await db.prepare("SELECT * FROM student_profiles WHERE user_id = ?").get(student.id);
  const s = await studentStats(student.id);
  const cells = await heatmap(student.id);
  const feed = await activityFeed(student.id, 8);
  const courses = await db.prepare(`
    SELECT c.id, c.name FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ? AND e.status = 'active' AND c.archived = 0 ORDER BY c.name`).all(student.id);
  let viewableCourses = courses;
  if (!(isSelf || viewer.role === "admin")) {
    const owned = new Set();
    for (const c of courses) if (await db.prepare("SELECT 1 FROM courses WHERE id = ? AND teacher_id = ?").get(c.id, viewer.id)) owned.add(c.id);
    viewableCourses = courses.filter((c) => owned.has(c.id));
  }

  const courseProjects = (await db.prepare(`
    SELECT ps.*, p.title, p.course_id, c.name AS course_name, u.full_name AS teacher_name
    FROM project_submissions ps JOIN projects p ON p.id = ps.project_id
    JOIN courses c ON c.id = p.course_id JOIN users u ON u.id = c.teacher_id
    WHERE ps.student_id = ? AND ps.status = 'completed' ORDER BY ps.submitted_at DESC`).all(student.id))
    .filter((r) => isSelf || viewer.role === "admin" || viewableCourses.some((c) => c.id === r.course_id));
  const personalProjects = (isSelf || sp?.portfolio_public === 1)
    ? await db.prepare("SELECT * FROM personal_projects WHERE student_id = ? ORDER BY created_at DESC").all(student.id)
    : [];
  const studyLogs = (await db.prepare("SELECT COUNT(*) n FROM study_logs WHERE student_id = ?").get(student.id)).n;
  const dayItems = selectedDay ? await dayActivities(student.id, selectedDay) : [];

  return (
    <>
      <section className="profile-hero pop-in">
        <div className="profile-head">
          <Avatar name={student.full_name} size={72} img={student.avatar_url} ring />
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1>{student.full_name}</h1>
            <p className="muted small">
              {sp?.student_id && <>Student ID <strong>{sp.student_id}</strong> · </>}
              {sp?.class_name && <>{sp.class_name} · </>}
              joined {fmtDate(student.created_at.slice(0, 10))}
            </p>
            {sp?.bio ? (
              <p className="bio small" style={{ marginTop: 6, fontStyle: "italic", opacity: 0.95 }}>&ldquo;{sp.bio}&rdquo;</p>
            ) : isSelf ? (
              <p className="bio small muted" style={{ marginTop: 6 }}>
                <Link href="/settings" style={{ color: "#7fc1fe", textDecoration: "underline" }}>Add a bio in Settings</Link>
              </p>
            ) : null}
          </div>
          {isSelf && <Link href="/settings" className="btn on-navy sm">Edit profile</Link>}
        </div>
        <div className="profile-stats" style={{ marginTop: "1.4rem" }}>
          <div className="pop-in"><b><CountUp value={s.courses} /></b><span>Courses</span></div>
          <div className="pop-in" style={{ animationDelay: "0.08s" }}><b><CountUp value={s.streak.activeDays} /></b><span>Learning days</span></div>
          <div className="pop-in" style={{ animationDelay: "0.16s" }}><b style={{ color: "#4ade80" }}><CountUp value={s.streak.current} /></b><span>Current streak</span></div>
          <div className="pop-in" style={{ animationDelay: "0.24s" }}><b><CountUp value={s.streak.longest} /></b><span>Longest streak</span></div>
        </div>
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Learning activity</h2>
          <span className="small muted">Click any date box to see what {isSelf ? "you" : firstName(student.full_name)} did that day</span>
        </div>
        <Heatmap cells={cells} dayLink={(d) => isSelf ? `/activity?day=${d}` : `/students/${student.id}?day=${d}#activity-day`} />

        {selectedDay && (
          <div id="activity-day" style={{ marginTop: "1.25rem", padding: "1.1rem", background: "var(--surface-2)", borderRadius: "var(--radius-sm, 10px)", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Activity on {selectedDay} ({dayItems.length})</h3>
              <Link href={isSelf ? "/profile" : `/students/${student.id}`} className="btn ghost sm" style={{ padding: "4px 8px", fontSize: "0.78rem" }}>Close</Link>
            </div>
            {dayItems.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>No learning activities recorded on {selectedDay}.</p>
            ) : (
              <div className="feed" style={{ marginTop: "0.5rem" }}>
                {dayItems.map((a) => (
                  <div key={a.id} className="feed-item" style={{ cursor: "default", padding: "0.4rem 0" }}>
                    <span className={`feed-dot ${a.verification === "self_reported" ? "self" : ""}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: "0.9rem" }}>{a.description || a.type.replace(/_/g, " ")}</strong>
                      <p className="small muted" style={{ margin: "2px 0 0" }}>
                        {a.course_name ? `${a.course_name} · ` : ""}
                        <span style={{ textTransform: "capitalize" }}>{a.verification.replace(/_/g, " ")}</span>
                      </p>
                    </div>
                    {a.created_at && <span className="small muted">{fmtDateTime(a.created_at)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="stat-grid">
        <StatCard label="Assignments completed" value={s.assignments.done} tone="green" />
        <StatCard label="Projects completed" value={s.projects.done} tone="green" />
        <StatCard label="Projects in progress" value={s.projects.inProgress} />
        <StatCard label="Attendance" value={s.attendance.percent === null ? "—" : `${s.attendance.percent}%`} hint={s.attendance.total ? `${s.attendance.present} present · ${s.attendance.late} late · ${s.attendance.absent} absent` : ""} />
        <StatCard label="Logged study sessions" value={studyLogs} />
      </div>

      <div className="layout-2">
        <section className="panel">
          <h2>Portfolio</h2>
          {courseProjects.length === 0 && personalProjects.length === 0 ? (
            <p className="muted small">{isSelf ? "Completed projects will appear here. Add personal projects any time." : "No portfolio items are visible to you."}</p>
          ) : (
            <div className="portfolio-grid">
              {courseProjects.map((r) => (
                <div key={`c${r.id}`} className="portfolio-card">
                  {r.screenshot_path && <img src={`/api/f/${r.screenshot_path}`} alt="" loading="lazy" />}
                  <div className="portfolio-body">
                    <div className="section-title"><h3>{r.title}</h3><Pill tone="green">Course-verified</Pill></div>
                    <p className="small muted">{r.course_name} · completed {fmtDate(r.submitted_at.slice(0, 10))}</p>
                    {r.description && <p className="small" style={{ maxHeight: "6em", overflow: "hidden" }}>{r.description}</p>}
                    <div className="actions">
                      {r.demo_url && <a href={r.demo_url} target="_blank" rel="noreferrer" className="btn sm">Demo</a>}
                      {r.repo_url && <a href={r.repo_url} target="_blank" rel="noreferrer" className="btn ghost sm">Repository</a>}
                    </div>
                    {r.grade_released === 1 && r.score !== null && <Pill tone="blue">{r.score} pts</Pill>}
                    {r.feedback && <p className="small muted">“{r.feedback}” — {r.teacher_name}</p>}
                  </div>
                </div>
              ))}
              {personalProjects.map((r) => (
                <div key={`p${r.id}`} className="portfolio-card">
                  {r.image_path && <img src={`/api/f/${r.image_path}`} alt="" loading="lazy" />}
                  <div className="portfolio-body">
                    <div className="section-title"><h3>{r.title}</h3><Pill tone="neutral">Personal · self-reported</Pill></div>
                    {r.completed_on && <p className="small muted">Finished {fmtDate(r.completed_on)}</p>}
                    {r.description && <p className="small" style={{ maxHeight: "6em", overflow: "hidden" }}>{r.description}</p>}
                    {r.technologies && <div className="chips">{r.technologies.split(",").map((t) => <span key={t} className="chip">{t.trim()}</span>)}</div>}
                    <div className="actions">
                      {r.demo_url && <a href={r.demo_url} target="_blank" rel="noreferrer" className="btn sm">Demo</a>}
                      {r.repo_url && <a href={r.repo_url} target="_blank" rel="noreferrer" className="btn ghost sm">Repository</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {isSelf && <Link href="/projects?tab=personal" className="btn ghost sm">Manage personal projects</Link>}
        </section>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel">
            <h2>Courses</h2>
            {viewableCourses.length === 0 ? <p className="muted small">No shared courses.</p> : (
              <div className="work-list">
                {viewableCourses.map((c) => (
                  <Link key={c.id} href={`/courses/${c.id}`} className="work-item"><div className="grow"><h3>{c.name}</h3></div><Pill tone="neutral">Open</Pill></Link>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Recent activity</h2>
            {feed.length === 0 ? <p className="muted small">Nothing yet.</p> : (
              <div className="feed">
                {feed.map((a) => (
                  <div key={a.id} className="feed-item" style={{ cursor: "default" }}>
                    <span className={`feed-dot ${a.verification === "self_reported" ? "self" : ""}`} />
                    <span className="feed-main"><strong style={{ fontSize: "0.9rem" }}>{a.description || `You ${TYPE_LABEL[a.type] || a.type}`}</strong></span>
                    <span className="feed-date">{fmtDate(a.activity_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
