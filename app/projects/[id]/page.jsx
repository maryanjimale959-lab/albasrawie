import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import {
  PROJECT_STATUS_META, classProgress, doneMilestoneIds, getProject, projectMilestones,
  projectRoster, projectSubmissionFor,
} from "@/lib/projects";
import { dueLabel, fmtDate, firstName } from "@/lib/format";
import { submitProject, toggleMilestone, toggleProjectPublish } from "@/app/actions/projects";
import { gradeProject } from "@/app/actions/grades";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import GradeForm from "@/components/GradeForm";
import MilestoneList from "@/components/MilestoneList";
import { Empty, Pill, Progress, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project · Albasrawie" };

const INTENTS = [
  ["review", "Mark under review", "ghost"],
  ["revision", "Request revision", "danger"],
  ["complete", "Complete & grade", ""],
];

const pillOf = (s) => {
  const m = PROJECT_STATUS_META[s] || PROJECT_STATUS_META.not_started;
  return <Pill tone={m.tone}>{m.label}</Pill>;
};
const linksOf = (raw) => (raw || "").split(/[\s,]+/).filter((l) => /^https?:\/\//i.test(l));

export default async function ProjectPage({ params }) {
  const user = await requireUser();
  const p = await getProject(Number(params.id));
  if (!p) notFound();

  if (user.role === "student") {
    const course = await courseForStudent(user, p.course_id);
    if (!course || !p.published) notFound();
    const milestones = await projectMilestones(p.id);
    const done = [...(await doneMilestoneIds(p.id, user.id))];
    const sub = await projectSubmissionFor(p.id, user.id);
    return (
      <Shell user={user}>
        <StudentView p={p} course={course} milestones={milestones}
          done={done}
          sub={sub} />
      </Shell>
    );
  }

  const course = await courseForTeacher(user, p.course_id);
  if (!course) notFound();
  const milestones = await projectMilestones(p.id);
  return <Shell user={user}><TeacherView p={p} course={course} milestones={milestones} /></Shell>;
}

function Head({ p, course, back }) {
  const dl = dueLabel(p.deadline);
  return (
    <div className="page-head">
      <div>
        <Link href={back} className="small muted">← {course.name}</Link>
        <h1 style={{ marginTop: 6 }}>{p.title}</h1>
        <div className="chips" style={{ marginTop: "0.5rem" }}>
          <span className="chip">{course.name}</span>
          <span className="chip">{p.project_type === "group" ? "Group project" : "Individual"}</span>
          <span className="chip">{p.max_marks} marks</span>
          {p.start_date && <span className="chip">Starts {fmtDate(p.start_date)}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <span className={`due ${dl.tone}`}>{dl.text}</span>
        {p.deadline && <p className="small muted">{fmtDate(p.deadline)}</p>}
        {!p.published && <Pill tone="amber">Draft</Pill>}
      </div>
    </div>
  );
}

function Brief({ p }) {
  return (
    <section className="panel" aria-labelledby="brief-h">
      <h2 id="brief-h">Brief</h2>
      {p.description && <p className="prose">{p.description}</p>}
      {p.objectives && <div><h3>Objectives</h3><p className="prose small">{p.objectives}</p></div>}
      {p.instructions && <div><h3>Instructions</h3><p className="prose">{p.instructions}</p></div>}
      {!p.description && !p.objectives && !p.instructions && <p className="muted">Your teacher hasn't written the brief yet.</p>}
      {p.rubric && (
        <details className="rubric"><summary><strong>Rubric</strong></summary><p className="prose small muted">{p.rubric}</p></details>
      )}
      {linksOf(p.reference_links).length > 0 && (
        <div>
          <h3 className="small muted">References</h3>
          <ul className="small" style={{ paddingLeft: "1.1rem", display: "grid", gap: "0.3rem" }}>
            {linksOf(p.reference_links).map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer">{l}</a></li>)}
          </ul>
        </div>
      )}
      {p.attachment_path && (
        <div style={{ marginTop: "1rem", padding: "0.85rem", background: "var(--surface-2)", borderRadius: "var(--radius-sm, 8px)", border: "1px solid var(--line)" }}>
          <h3 className="small" style={{ margin: "0 0 0.4rem" }}>Project Resources & Starter Files</h3>
          <a href={`/api/f/${p.attachment_path}`} className="btn sm" download>
            Download {p.attachment_name || "Attachment"}
          </a>
        </div>
      )}
      <p className="small muted">Created {fmtDate(p.created_at)} · set by {p.teacher_name}</p>
    </section>
  );
}

/* --------------------------------- student --------------------------------- */

function MySubmission({ sub, p }) {
  if (!sub) return null;
  const released = sub.grade_released === 1 && sub.score !== null;
  return (
    <section className="panel" aria-labelledby="mine-h">
      <div className="section-title"><h2 id="mine-h">Your submission</h2>{pillOf(sub.status)}</div>
      <p className="small muted">
        Handed in {fmtDate(sub.submitted_at)}{p.deadline && String(sub.submitted_at) > String(p.deadline) ? " — after the deadline" : ""}.
      </p>
      {sub.description && <p className="prose small">{sub.description}</p>}
      {sub.demo_url && <p className="small"><strong>Demo: </strong><a href={sub.demo_url} target="_blank" rel="noreferrer">{sub.demo_url}</a></p>}
      {sub.repo_url && <p className="small"><strong>Repository: </strong><a href={sub.repo_url} target="_blank" rel="noreferrer">{sub.repo_url}</a></p>}
      {sub.screenshot_path && (
        <div className="code-box">
          <span>{sub.screenshot_name || "Screenshot"}</span>
          <a className="btn ghost sm" href={`/api/f/${sub.screenshot_path}`} target="_blank" rel="noopener">Open</a>
        </div>
      )}
      {released ? (
        <div className="grade-result">
          <div className="stat-value green">{sub.score}<span className="muted small">/{p.max_marks}</span></div>
          {sub.feedback ? <p className="prose small"><strong>Feedback:</strong> {sub.feedback}</p>
            : <p className="small muted">Mark released without written feedback.</p>}
        </div>
      ) : sub.status === "revision" && sub.feedback ? (
        <div className="alert info"><strong>Revision requested:</strong> {sub.feedback}</div>
      ) : (
        <p className="small muted">Your mark appears here once {firstName(p.teacher_name)} releases it.</p>
      )}
    </section>
  );
}

function SubmissionForm({ p }) {
  return (
    <section className="panel" aria-labelledby="handin-h">
      <h2 id="handin-h">Hand in your project</h2>
      <p className="small muted">Describe what you built and add the links a marker needs.</p>
      <ActionForm action={submitProject} submitLabel="Submit project">
        <input type="hidden" name="project_id" value={p.id} />
        <label>What you built<textarea name="description" rows="6" maxLength={8000} required placeholder="How it works, what you'd improve next…" /></label>
        <div className="row">
          <label>Demo link <span className="hint">optional</span><input name="demo_url" type="url" maxLength={300} placeholder="https://…" /></label>
          <label>Repository link <span className="hint">optional</span><input name="repo_url" type="url" maxLength={300} placeholder="https://…" /></label>
        </div>
        <label>Screenshot <span className="hint">optional — image, PDF or zip, 20 MB max</span><input type="file" name="screenshot" /></label>
      </ActionForm>
    </section>
  );
}

function StudentView({ p, course, milestones, done, sub }) {
  const mine = { done: done.length, total: milestones.length, percent: milestones.length ? Math.round((done.length / milestones.length) * 100) : 0 };
  return (
    <>
      <Head p={p} course={course} back="/projects" />
      <div className="stat-grid">
        <StatCard label="Milestones" value={`${mine.done}/${mine.total}`} hint="you've ticked off" />
        <StatCard label="Progress" value={`${mine.percent}%`} tone={mine.percent === 100 ? "green" : "warn"} />
        <StatCard label="Deadline" value={p.deadline ? fmtDate(p.deadline) : "—"} />
        <StatCard label="Status" value={sub ? (PROJECT_STATUS_META[sub.status] || PROJECT_STATUS_META.not_started).label : "Not started"} />
      </div>
      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <Brief p={p} />
          <section className="panel" aria-labelledby="ms-h">
            <div className="section-title"><h2 id="ms-h">Milestones</h2><span className="small muted">tick to save</span></div>
            {milestones.length === 0 ? (
              <p className="small muted">This project has no milestone checklist.</p>
            ) : (
              <>
                <MilestoneList action={toggleMilestone} projectId={p.id} milestones={milestones} done={done} />
                <Progress value={mine.percent} label={`${mine.done}/${mine.total} done`} />
              </>
            )}
          </section>
          {!sub || sub.status === "revision" ? <SubmissionForm p={p} /> : null}
        </div>
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <MySubmission sub={sub} p={p} />
          <Link href={`/courses/${course.id}`} className="btn ghost sm">Back to {course.name}</Link>
        </div>
      </div>
    </>
  );
}

/* --------------------------------- teacher --------------------------------- */

function ReviewRow({ p, r }) {
  const released = r.submission_id && r.grade_released === 1 && r.score !== null;
  return (
    <section className="panel sub-panel" aria-label={r.full_name}>
      <div className="section-title">
        <div>
          <h2><Link href={`/students/${r.student_id}`}>{r.full_name}</Link></h2>
          <p className="small muted">
            {r.matricule || "—"}{r.class_name ? ` · ${r.class_name}` : ""}
            {r.milestone_total ? ` · ${r.milestones_done}/${r.milestone_total} milestones` : " · no milestones"}
            {r.submitted_at ? ` · handed in ${fmtDate(r.submitted_at)}` : ""}
          </p>
        </div>
        {pillOf(r.status)}
      </div>
      <Progress value={r.percent} label={`${r.percent}%`} />
      {!r.submission_id ? (
        <p className="small muted">Not submitted yet.</p>
      ) : (
        <>
          <div className="sub-body">
            {r.description && <details open={r.description.length < 300}><summary>Description</summary><p className="prose small">{r.description}</p></details>}
            {r.demo_url && <p className="small"><strong>Demo: </strong><a href={r.demo_url} target="_blank" rel="noreferrer">{r.demo_url}</a></p>}
            {r.repo_url && <p className="small"><strong>Repository: </strong><a href={r.repo_url} target="_blank" rel="noreferrer">{r.repo_url}</a></p>}
            {r.screenshot_path && <a className="btn ghost sm" href={`/api/f/${r.screenshot_path}`} target="_blank" rel="noopener">Open {r.screenshot_name || "screenshot"}</a>}
            {released && <p className="small muted">Released: <strong>{r.score}</strong>/{p.max_marks}</p>}
          </div>
          <GradeForm
            action={gradeProject}
            fields={{ project_id: p.id, student_id: r.student_id }}
            max={p.max_marks}
            score={r.score}
            feedback={r.feedback || ""}
            intents={INTENTS}
          />
        </>
      )}
    </section>
  );
}

async function TeacherView({ p, course, milestones }) {
  const roster = await projectRoster(p.id);
  const cls = await classProgress(p.id);
  const submitted = roster.filter((r) => r.submission_id);
  return (
    <>
      <Head p={p} course={course} back="/dashboard" />
      <div className="actions">
        <form action={toggleProjectPublish}>
          <input type="hidden" name="project_id" value={p.id} />
          <button className="btn sm" type="submit">{p.published ? "Unpublish" : "Publish to students"}</button>
        </form>
        <Link href={`/courses/${course.id}/grades`} className="btn ghost sm">Grades for this course</Link>
      </div>

      <div className="stat-grid">
        <StatCard label="Students" value={cls.total_students} />
        <StatCard label="Milestones" value={milestones.length} />
        <StatCard label="Class progress" value={`${cls.avg_percent}%`} tone={cls.avg_percent === 100 ? "green" : "warn"} />
        <StatCard label="Submissions" value={submitted.length} tone="green" hint={`${cls.total_students - submitted.length} missing`} />
        <StatCard label="Grades released" value={roster.filter((r) => r.grade_released === 1 && r.score !== null).length} tone="green" />
      </div>

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel" aria-labelledby="per-h">
            <h2 id="per-h">Milestone progress</h2>
            {roster.length === 0 ? (
              <Empty title="No students enrolled" text="Share your course code so students can join." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Milestones</th><th>Progress</th><th>Submission</th></tr></thead>
                  <tbody>
                    {roster.map((r) => (
                      <tr key={r.student_id}>
                        <td><Link href={`/students/${r.student_id}`}><strong>{r.full_name}</strong></Link></td>
                        <td>{r.milestones_done}/{r.milestone_total || "0"}</td>
                        <td><Progress value={r.percent} /></td>
                        <td>{pillOf(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="rev-h" style={{ gap: "0.75rem" }}>
            <h2 id="rev-h">Submissions ({submitted.length}/{roster.length})</h2>
            {submitted.length === 0 ? (
              <p className="small muted">Nobody has handed in their project yet.</p>
            ) : submitted.map((r) => <ReviewRow key={r.student_id} p={p} r={r} />)}
          </section>
        </div>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <Brief p={p} />
          <section className="panel" aria-labelledby="ms-h">
            <h2 id="ms-h">Milestones</h2>
            {milestones.length === 0 ? <p className="small muted">This project has no checklist.</p>
              : <ol className="m-list">{milestones.map((m) => <li key={m.id}>{m.title}</li>)}</ol>}
          </section>
        </div>
      </div>
    </>
  );
}
