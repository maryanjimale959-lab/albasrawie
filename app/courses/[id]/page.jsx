import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseRoster } from "@/lib/courses";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import { studentStats, activityFeed, upcomingWork } from "@/lib/activity";
import { fmtDate, fmtDateTime, dueLabel } from "@/lib/format";
import { regenerateCode, disableCode, toggleEnrollment, toggleArchive, inviteStudent } from "@/app/actions";
import Shell from "@/components/Shell";
import CourseTabs from "@/components/CourseTabs";
import CopyButton from "@/components/CopyButton";
import InviteForm from "@/components/InviteForm";
import { StatCard, Pill, Avatar, Empty } from "@/components/ui";
import CourseCover from "@/components/CourseCover";
import { Reveal } from "@/components/motion";
import { publicOrigin } from "@/lib/origin";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export default function CoursePage({ params }) {
  const user = requireUser();
  const id = Number(params.id);
  if (user.role === "student") {
    const course = courseForStudent(user, id);
    if (!course) notFound();
    return <Shell user={user}><CourseTabs courseId={course.id} active="" /><StudentView user={user} course={course} /></Shell>;
  }
  const course = courseForTeacher(user, id);
  if (!course) notFound();
  return <Shell user={user}><CourseTabs courseId={course.id} active="" /><TeacherView user={user} course={course} /></Shell>;
}

function CourseHero({ course }) {
  return (
    <section className="hero">
      <div className="hero-grid" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: "1.1rem", alignItems: "center", flexWrap: "wrap" }}>
          <CourseCover name={course.name} className="pop-in" />
          <div>
            <h1>{course.name}</h1>
            <Meta course={course} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Meta({ course }) {
  const bits = [course.category, course.level, course.class_name, course.organization].filter(Boolean);
  return bits.length ? <div className="chips" style={{ marginTop: "0.5rem" }}>{bits.map((b) => <span key={b} className="chip" style={{ background: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.22)", color: "#fff" }}>{b}</span>)}</div> : null;
}

function StudentView({ user, course }) {
  const s = studentStats(user.id);
  const { items } = upcomingWork(user.id);
  const courseItems = items.filter((w) => w.course_id === course.id);
  const att = db.prepare(`
    SELECT COUNT(*) total, SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) here
    FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id AND s.status = 'closed'
    WHERE r.student_id = ? AND s.course_id = ?`).get(user.id, course.id);
  const ann = db.prepare("SELECT a.*, u.full_name t FROM announcements a JOIN users u ON u.id = a.teacher_id WHERE a.course_id = ? ORDER BY a.created_at DESC LIMIT 3").all(course.id);
  const mats = db.prepare("SELECT * FROM materials WHERE course_id = ? AND published = 1 ORDER BY created_at DESC LIMIT 3").all(course.id);
  const feed = activityFeed(user.id, 6).filter((a) => a.course_id === course.id);
  const doneA = db.prepare(`SELECT COUNT(*) n FROM assignments a JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ? WHERE a.course_id = ? AND a.published = 1`).get(user.id, course.id).n;
  const totA = db.prepare("SELECT COUNT(*) n FROM assignments WHERE course_id = ? AND published = 1").get(course.id).n;
  const doneP = db.prepare(`SELECT COUNT(*) n FROM projects p JOIN project_submissions s ON s.project_id = p.id AND s.student_id = ? AND s.status = 'completed' WHERE p.course_id = ?`).get(user.id, course.id).n;
  const totP = db.prepare("SELECT COUNT(*) n FROM projects WHERE course_id = ? AND published = 1").get(course.id).n;

  return (
    <>
      <CourseHero course={course} />
      <div className="page-head" style={{ marginTop: "-0.5rem" }}>
        <div />
        <Pill tone="blue">{totA} assignments · {totP} projects</Pill>
      </div>

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel">
            <h2>About this course</h2>
            <p className="prose">{course.description || "Your teacher hasn't added a description yet."}</p>
          </section>

          <div className="stat-grid">
            <StatCard label="Assignments done" value={`${doneA}/${totA}`} tone="green" />
            <StatCard label="Projects completed" value={`${doneP}/${totP}`} tone="green" />
            <StatCard label="Attendance here" value={att.total ? `${Math.round((att.here / att.total) * 100)}%` : "—"} hint={`${att.total} closed session${att.total === 1 ? "" : "s"}`} />
            <StatCard label="Overall streak" value={s.streak.current} hint="days" tone={s.streak.current ? "green" : ""} />
          </div>

          <section className="panel">
            <h2>Upcoming in this course</h2>
            {courseItems.length === 0 ? <p className="muted small">Nothing due.</p> : (
              <div className="work-list">
                {courseItems.map((w) => {
                  const due = dueLabel(w.due);
                  return (
                    <Link key={`${w.kind}${w.id}`} href={w.kind === "assignment" ? `/assignments/${w.id}` : `/projects/${w.id}`} className="work-item">
                      <div className="grow"><h3>{w.title}</h3><p className="small muted">{w.kind === "assignment" ? "Assignment" : "Project"}</p></div>
                      <span className={`due ${due.tone}`}>{due.text}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-title"><h2>Announcements</h2><Link className="small" href={`/courses/${course.id}/announcements`}>See all →</Link></div>
            {ann.length === 0 ? <p className="muted small">No announcements yet.</p> : ann.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid var(--line)", padding: "0.6rem 0" }}>
                <strong>{a.title}</strong>
                <p className="small muted" style={{ maxHeight: "4.5em", overflow: "hidden" }}>{a.content}</p>
                <p className="small muted">{a.t} · {fmtDateTime(a.created_at)}</p>
              </div>
            ))}
          </section>
        </div>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel">
            <h2>Your teacher</h2>
            <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
              <Avatar name={course.teacher_name} size={40} />
              <div><strong>{course.teacher_name}</strong></div>
            </div>
          </section>
          <section className="panel">
            <div className="section-title"><h2>New materials</h2><Link className="small" href={`/courses/${course.id}/materials`}>All →</Link></div>
            {mats.length === 0 ? <p className="muted small">Nothing uploaded yet.</p> : mats.map((m) => (
              <div key={m.id} className="work-item" style={{ marginBottom: 6 }}>
                <div className="grow"><h3>{m.title}</h3><p className="small muted">{m.module || fmtDate(m.created_at.slice(0, 10))}</p></div>
                {m.url ? <a className="btn sm" href={m.url} target="_blank" rel="noreferrer">Open</a> : m.file_path ? <a className="btn sm" href={`/api/f/${m.file_path}`}>Download</a> : null}
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Your activity here</h2>
            {feed.length === 0 ? <p className="muted small">Complete work to see it tracked.</p> : (
              <div className="feed">{feed.map((a) => (
                <div key={a.id} className="feed-item" style={{ cursor: "default" }}>
                  <span className={`feed-dot ${a.verification === "self_reported" ? "self" : ""}`} />
                  <span className="feed-main"><strong style={{ fontSize: ".9rem" }}>{a.description}</strong></span>
                  <span className="feed-date">{fmtDate(a.activity_date)}</span>
                </div>
              ))}</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

async function TeacherView({ user, course }) {
  const origin = publicOrigin(headers());
  const active = db.prepare("SELECT code FROM course_codes WHERE course_id = ? AND active = 1").get(course.id);
  const code = active?.code;
  const link = code ? `${origin}/join/${code}` : null;
  const qr = link ? await QRCode.toDataURL(link, { width: 320, margin: 1 }) : null;
  const roster = courseRoster(course.id);
  const invitation = code ? `You have been invited to join ${course.name}. Enter course code ${code} to join.` : null;
  const totA = db.prepare("SELECT COUNT(*) n FROM assignments WHERE course_id = ?").get(course.id).n;
  const totP = db.prepare("SELECT COUNT(*) n FROM projects WHERE course_id = ?").get(course.id).n;
  const openSess = db.prepare("SELECT COUNT(*) n FROM attendance_sessions WHERE course_id = ? AND status = 'open'").get(course.id).n;
  const pending = db.prepare(`
    SELECT COUNT(*) n FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ? AND s.status IN ('submitted','revision')`).get(course.id).n;
  const recentAnn = db.prepare("SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC LIMIT 2").all(course.id);

  return (
    <>
      <CourseHero course={course} />
      <div className="page-head" style={{ marginTop: "-0.5rem" }}>
        <div />
        <form action={toggleArchive}>
          <input type="hidden" name="course_id" value={course.id} />
          <input type="hidden" name="archive" value={course.archived ? "0" : "1"} />
          <button className="btn ghost sm" type="submit">{course.archived ? "Restore course" : "Archive course"}</button>
        </form>
      </div>

      <div className="stat-grid">
        <StatCard label="Students" value={roster.length} />
        <StatCard label="Assignments" value={totA} />
        <StatCard label="Projects" value={totP} />
        <StatCard label="Awaiting review" value={pending} tone={pending ? "warn" : ""} />
        <StatCard label="Open attendance" value={openSess} tone={openSess ? "green" : ""} />
      </div>

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel">
            <h2>About</h2>
            <p className="prose">{course.description || "No description yet."}</p>
            <Link href={`/courses/${course.id}/members`} className="btn ghost sm">Manage students ({roster.length})</Link>
          </section>
          <section className="panel">
            <div className="section-title"><h2>Recent announcements</h2><Link className="small" href={`/courses/${course.id}/announcements`}>Write one →</Link></div>
            {recentAnn.length === 0 ? <p className="muted small">None yet.</p> : recentAnn.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid var(--line)", padding: ".5rem 0" }}>
                <strong>{a.title}</strong><p className="small muted" style={{ maxHeight: "3em", overflow: "hidden" }}>{a.content}</p>
              </div>
            ))}
          </section>
        </div>

        <section className="panel" aria-labelledby="share-h">
          <h2 id="share-h">Share this course</h2>
          <div className="code-box">
            <span className={`code ${code ? "" : "off"}`}>{code || "No active code"}</span>
            {code && <CopyButton text={code} label="Copy code" />}
          </div>
          {link && (
            <>
              <div className="link-box">{link}</div>
              <div className="actions"><CopyButton text={link} label="Copy link" /><CopyButton text={invitation} label="Copy invitation" /></div>
              <p className="small muted">“{invitation}”</p>
              {qr && (
                <div className="share-qr">
                  <img src={qr} alt="QR code that opens the course invitation on a phone" />
                  <span className="qr-cap">Scan with a phone camera to open the invitation</span>
                </div>
              )}
              <div className="phone-hint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
                <span>To open on a phone, connect it to the <strong>same Wi-Fi</strong>, then scan the QR code or open the link above.</span>
              </div>
            </>
          )}
          {!code && <p className="small muted">Students can't join until you generate a new code.</p>}
          <div className="actions">
            <form action={regenerateCode}><input type="hidden" name="course_id" value={course.id} /><button className="btn sm" type="submit">{code ? "Generate new code" : "Generate code"}</button></form>
            {code && <form action={disableCode}><input type="hidden" name="course_id" value={course.id} /><button className="btn ghost sm" type="submit">Turn off code</button></form>}
          </div>
          <form action={toggleEnrollment} className="actions" style={{ alignItems: "center" }}>
            <input type="hidden" name="course_id" value={course.id} />
            <input type="hidden" name="open" value={course.enrollment_open ? "0" : "1"} />
            <span className="small">Enrollment is <strong>{course.enrollment_open ? "open" : "closed"}</strong></span>
            <button className="btn ghost sm" type="submit">{course.enrollment_open ? "Close enrollment" : "Open enrollment"}</button>
          </form>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
          <h3>Invite an existing student</h3>
          <InviteForm courseId={course.id} action={inviteStudent} />
        </section>
      </div>
    </>
  );
}
