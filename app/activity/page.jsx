import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { heatmap, streaks, dayActivities, activityLink, localDate, tzOf } from "@/lib/activity";
import { studentCourses } from "@/lib/courses";
import { fmtDate } from "@/lib/format";
import { logStudyActivity, deleteStudyLog } from "@/app/actions/activity";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import Heatmap from "@/components/Heatmap";
import { Pill, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning activity · Albasrawie" };

const TYPE_LABEL = {
  course_joined: "Joined a course",
  assignment_submitted: "Assignment submitted",
  project_submitted: "Project submitted",
  project_milestone: "Project milestone",
  study_logged: "Study session",
  external_project: "External project",
  quiz_completed: "Quiz completed",
};

export default function ActivityPage({ searchParams }) {
  const user = requireUser("student");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day || "") ? searchParams.day : null;
  const cells = heatmap(user.id);
  const st = streaks(user.id);
  const courses = studentCourses(user.id);
  const detail = day ? dayActivities(user.id, day) : [];
  const recent = db.prepare(`
    SELECT la.*, c.name AS course_name FROM learning_activities la LEFT JOIN courses c ON c.id = la.course_id
    WHERE la.student_id = ? ORDER BY la.activity_date DESC, la.created_at DESC LIMIT 40`).all(user.id);

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <h1>Learning activity</h1>
          <p className="muted">Your calendar of meaningful work — submissions, milestones, quizzes and logged study. Logins never count.</p>
        </div>
        <div className="profile-stats">
          <div><b style={{ color: "var(--ok)" }}>{st.current}</b><span>Current streak</span></div>
          <div><b>{st.longest}</b><span>Longest</span></div>
          <div><b>{st.activeDays}</b><span>Active days</span></div>
        </div>
      </div>

      <section className="panel">
        <h2>Calendar</h2>
        <Heatmap cells={cells} dayLink={(d) => `/activity?day=${d}`} />
        <p className="small muted">Click any green square to see what you did that day.</p>
      </section>

      {day && (
        <section className="panel" style={{ borderColor: "var(--accent)" }}>
          <div className="section-title">
            <h2>Activity on {fmtDate(day)}</h2>
            <Link href="/activity" className="btn ghost sm">Close</Link>
          </div>
          {detail.length === 0 ? <p className="muted small">No recorded activity that day.</p> : (
            <div className="feed">
              {detail.map((a) => (
                <Link key={a.id} href={activityLink(a)} className="feed-item">
                  <span className={`feed-dot ${a.verification === "self_reported" ? "self" : ""}`} />
                  <span className="feed-main">
                    <strong style={{ fontSize: "0.925rem" }}>{a.description || TYPE_LABEL[a.type] || a.type}</strong>
                    <p className="small muted">{a.course_name ? `${a.course_name} · ` : ""}{TYPE_LABEL[a.type] || a.type}</p>
                  </span>
                  <Pill tone={a.verification === "verified" ? "green" : a.verification === "teacher_confirmed" ? "blue" : "neutral"}>
                    {a.verification === "verified" ? "Verified" : a.verification === "teacher_confirmed" ? "Teacher-confirmed" : "Self-reported"}
                  </Pill>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="layout-2">
        <section className="panel">
          <h2>History</h2>
          {recent.length === 0 ? (
            <Empty title="Nothing recorded yet" text="Submit an assignment or log a study session below to start your calendar." />
          ) : (
            <div className="feed">
              {recent.map((a) => (
                <div key={a.id} className="feed-item" style={{ cursor: "default" }}>
                  <span className={`feed-dot ${a.verification === "self_reported" ? "self" : ""}`} />
                  <span className="feed-main">
                    <strong style={{ fontSize: "0.925rem" }}>{a.description || TYPE_LABEL[a.type] || a.type}</strong>
                    <p className="small muted">{a.course_name ? `${a.course_name} · ` : ""}{TYPE_LABEL[a.type] || a.type}</p>
                  </span>
                  <span className="feed-date">{fmtDate(a.activity_date)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel">
            <h2>Log learning outside Albasrawie</h2>
            <p className="small muted">Worked on a project at home or studied offline? Log it here. Self-reported entries are always labelled and never presented as verified work.</p>
            <LogForm courses={courses} today={localDate(tzOf(user.id))} />
          </section>

          <section className="panel">
            <h2>My logged sessions</h2>
            <StudyLogs userId={user.id} />
          </section>
        </div>
      </div>
    </Shell>
  );
}

function LogForm({ courses, today }) {
  return (
    <ActionForm action={logStudyActivity} submitLabel="Log activity" className="form">
      <label>Title<input name="title" placeholder="e.g. Finished my chess app UI" required maxLength={120} /></label>
      <div className="row">
        <label>Date<input type="date" name="log_date" defaultValue={today} max={today} required /></label>
        <label>Minutes<input type="number" name="minutes" min="0" max="1440" defaultValue={45} required /></label>
      </div>
      <label>Course (optional)
        <select name="course_id" defaultValue="">
          <option value="">Not linked to a course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Type
        <select name="kind" defaultValue="study">
          <option value="study">Study session</option>
          <option value="external">External project work</option>
        </select>
      </label>
    </ActionForm>
  );
}

function StudyLogs({ userId }) {
  const rows = db.prepare(`
    SELECT sl.*, c.name AS course_name FROM study_logs sl LEFT JOIN courses c ON c.id = sl.course_id
    WHERE sl.student_id = ? ORDER BY sl.log_date DESC, sl.id DESC LIMIT 15`).all(userId);
  if (rows.length === 0) return <p className="muted small">No manual logs yet.</p>;
  return (
    <div className="work-list">
      {rows.map((r) => (
        <div key={r.id} className="work-item">
          <div className="grow"><h3>{r.title}</h3><p className="small muted">{fmtDate(r.log_date)} · {r.minutes} min{r.course_name ? ` · ${r.course_name}` : ""}</p></div>
          <form action={deleteStudyLog}><input type="hidden" name="id" value={r.id} /><button className="btn danger sm" type="submit">Remove</button></form>
        </div>
      ))}
    </div>
  );
}
