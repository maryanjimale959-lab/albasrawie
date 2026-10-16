import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import {
  STATUS_META, allowedTypes, assignmentCounts, getAssignment, rosterSubmissions, submissionFor, toInputDateTime,
} from "@/lib/assignments";
import { dueLabel, fmtDate, fmtDateTime, firstName } from "@/lib/format";
import { submitAssignment, toggleAssignmentPublish, updateAssignment } from "@/app/actions/assignments";
import { gradeAssignment } from "@/app/actions/grades";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import GradeForm from "@/components/GradeForm";
import { Empty, Pill, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assignment · Albasrawie" };

const TYPE_LABEL = { text: "Typed answer", link: "Link", file: "File" };
const FILTERS = [["", "All"], ["missing", "Missing"], ["submitted", "Submitted"], ["late", "Late"], ["graded", "Graded"], ["revision", "Revision"]];
const INTENTS = [
  ["feedback", "Save feedback", "ghost"],
  ["release", "Grade & release", ""],
  ["revision", "Request revision", "danger"],
  ["reopen", "Reopen", "ghost"],
];

const pillOf = (s) => { const m = STATUS_META[s] || STATUS_META.not_started; return <Pill tone={m.tone}>{m.label}</Pill>; };

export default async function AssignmentPage({ params, searchParams }) {
  const user = await requireUser();
  const id = Number(params.id);
  const a = await getAssignment(id);
  if (!a) notFound();

  if (user.role === "student") {
    const course = await courseForStudent(user, a.course_id);
    if (!course || !a.published) notFound();
    const sub = await submissionFor(a.id, user.id);
    return <Shell user={user}><StudentView user={user} a={a} course={course} sub={sub} /></Shell>;
  }

  const course = await courseForTeacher(user, a.course_id);
  if (!course) notFound();
  return <Shell user={user}><TeacherView user={user} a={a} course={course} filter={String(searchParams.filter || "")} /></Shell>;
}

function Head({ a, course, back }) {
  const dl = dueLabel(a.due_at);
  return (
    <div className="page-head">
      <div>
        <Link href={back} className="small muted">← {course.name}</Link>
        <h1 style={{ marginTop: 6 }}>{a.title}</h1>
        <div className="chips" style={{ marginTop: "0.5rem" }}>
          <span className="chip">{course.name}</span>
          <span className="chip">{a.max_marks} marks</span>
          {allowedTypes(a).map((t) => <span key={t} className="chip">{TYPE_LABEL[t] || t}</span>)}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <span className={`due ${dl.tone}`}>{dl.text}</span>
        {a.due_at && <p className="small muted">{fmtDateTime(a.due_at)}</p>}
        {!a.published && <Pill tone="amber">Draft</Pill>}
      </div>
    </div>
  );
}

function Brief({ a }) {
  return (
    <section className="panel" aria-labelledby="brief-h">
      <h2 id="brief-h">Instructions</h2>
      {a.description && <p className="prose">{a.description}</p>}
      {a.instructions ? <p className="prose">{a.instructions}</p> : !a.description && <p className="muted">No written instructions — ask your teacher for details.</p>}
      {a.rubric && (
        <details className="rubric">
          <summary><strong>Rubric</strong></summary>
          <p className="prose small muted">{a.rubric}</p>
        </details>
      )}
      {a.attachment_path && (
        <div className="code-box">
          <span>{a.attachment_name || "Attachment"}</span>
          <a className="btn ghost sm" href={`/api/f/${a.attachment_path}`} target="_blank" rel="noopener">Open file</a>
        </div>
      )}
      <p className="small muted">Created {fmtDate(a.created_at)} · set by {a.teacher_name}</p>
    </section>
  );
}

/* --------------------------------- student --------------------------------- */

function YourSubmission({ sub, a }) {
  if (!sub) return null;
  const released = sub.grade_released === 1 && sub.score !== null;
  return (
    <section className="panel" aria-labelledby="mine-h">
      <div className="section-title">
        <h2 id="mine-h">Your submission</h2>
        {pillOf(sub.status)}
      </div>
      <p className="small muted">Handed in {fmtDateTime(sub.submitted_at)}{a.due_at && sub.status === "late" ? " — after the deadline" : ""}.</p>
      {sub.content && (
        <div><h3 className="small muted">Typed answer</h3><p className="prose">{sub.content}</p></div>
      )}
      {sub.link && <div><h3 className="small muted">Link</h3><a href={sub.link} target="_blank" rel="noreferrer">{sub.link}</a></div>}
      {sub.file_path && (
        <div className="code-box">
          <span>{sub.file_name || "Your file"}</span>
          <a className="btn ghost sm" href={`/api/f/${sub.file_path}`} target="_blank" rel="noopener">Open file</a>
        </div>
      )}
      {released ? (
        <div className="grade-result">
          <div className="stat-value green">{sub.score}<span className="muted small">/{a.max_marks}</span></div>
          {sub.feedback && <p className="prose small"><strong>Feedback:</strong> {sub.feedback}</p>}
          {!sub.feedback && <p className="small muted">Your teacher released the mark without written feedback.</p>}
        </div>
      ) : sub.feedback && sub.status === "revision" ? (
        <div className="alert info"><strong>Revision requested:</strong> {sub.feedback}</div>
      ) : (
        <p className="small muted">Your mark will appear here once {firstName(a.teacher_name)} releases it.</p>
      )}
    </section>
  );
}

function SubmissionForm({ a }) {
  const types = allowedTypes(a);
  return (
    <section className="panel" aria-labelledby="handin-h">
      <h2 id="handin-h">Hand it in</h2>
      <p className="small muted">
        You may submit {types.map((t) => TYPE_LABEL[t].toLowerCase()).join(", ")}.
        {a.due_at ? ` On time means before ${fmtDateTime(a.due_at)}.` : ""}
      </p>
      <ActionForm action={submitAssignment} submitLabel="Submit assignment">
        <input type="hidden" name="assignment_id" value={a.id} />
        {types.includes("text") && (
          <label>Typed answer <span className="hint">paste or write your work here</span>
            <textarea name="content" rows="8" placeholder="Your answer…" />
          </label>
        )}
        {types.includes("link") && (
          <label>Link <span className="hint">a page, repository or doc URL</span>
            <input name="link" type="url" placeholder="https://…" maxLength={600} />
          </label>
        )}
        {types.includes("file") && (
          <label>File <span className="hint">PDF, Office, image, video, zip, txt or md — 20 MB max</span>
            <input type="file" name="file" />
          </label>
        )}
        <p className="small muted">Fill in one of the fields above. Submitting again is possible when your teacher asks for a revision.</p>
      </ActionForm>
    </section>
  );
}

function StudentView({ a, course, sub }) {
  return (
    <>
      <Head a={a} course={course} back="/assignments" />
      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <Brief a={a} />
          {!sub || sub.status === "revision" ? <SubmissionForm a={a} /> : null}
        </div>
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel" aria-labelledby="status-h">
            <div className="section-title"><h2 id="status-h">Status</h2>{pillOf(sub ? sub.status : "not_started")}</div>
            {sub?.grade_released === 1 && sub.score !== null
              ? <p><strong>{sub.score}</strong>/{a.max_marks} released</p>
              : <p className="small muted">{sub ? "Waiting to be graded." : `Nothing handed in yet. Due ${a.due_at ? fmtDateTime(a.due_at) : "no date"}.`}</p>}
          </section>
          <YourSubmission sub={sub} a={a} />
          <Link href={`/courses/${course.id}`} className="btn ghost sm">Back to {course.name}</Link>
        </div>
      </div>
    </>
  );
}

/* --------------------------------- teacher --------------------------------- */

function EditBasics({ a }) {
  const types = allowedTypes(a);
  return (
    <section className="panel" aria-labelledby="edit-h">
      <h2 id="edit-h">Edit details</h2>
      <ActionForm action={updateAssignment} submitLabel="Save changes">
        <input type="hidden" name="assignment_id" value={a.id} />
        <label>Title<input name="title" maxLength={150} defaultValue={a.title} required /></label>
        <label>Short description<textarea name="description" rows="2" maxLength={2000} defaultValue={a.description || ""} /></label>
        <label>Instructions<textarea name="instructions" rows="5" maxLength={4000} defaultValue={a.instructions || ""} /></label>
        <div className="row">
          <label>Due<input type="datetime-local" name="due_at" defaultValue={toInputDateTime(a.due_at)} /></label>
          <label>Max marks<input type="number" name="max_marks" min="1" max="1000" defaultValue={a.max_marks} required /></label>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
          <legend style={{ fontWeight: 700, fontSize: "0.9rem" }}>Allowed submission types</legend>
          <div className="chips">
            {Object.keys(TYPE_LABEL).map((t) => (
              <label key={t} className="check-chip">
                <input type="checkbox" name="types" value={t} defaultChecked={types.includes(t)} />
                <span>{TYPE_LABEL[t]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>Rubric<textarea name="rubric" rows="3" maxLength={4000} defaultValue={a.rubric || ""} /></label>
      </ActionForm>
      <p className="small muted">The attachment stays as published; delete and recreate the assignment to swap the file. Existing submissions keep the status they were given.</p>
    </section>
  );
}

function RosterRow({ a, r }) {
  const released = r.submission_id && r.grade_released === 1 && r.score !== null;
  return (
    <section className="panel sub-panel" aria-label={r.full_name}>
      <div className="section-title">
        <div>
          <h2><Link href={`/students/${r.student_id}`}>{r.full_name}</Link></h2>
          <p className="small muted">{r.matricule || "—"}{r.class_name ? ` · ${r.class_name}` : ""}{r.submitted_at ? ` · handed in ${fmtDateTime(r.submitted_at)}` : ""}</p>
        </div>
        {pillOf(r.submission_id ? r.submission_status : "not_started")}
      </div>

      {!r.submission_id ? (
        <p className="small muted">Not submitted. Remind them in class — nothing to grade yet.</p>
      ) : (
        <>
          <div className="sub-body">
            {r.content && <details><summary>Typed answer</summary><p className="prose small">{r.content}</p></details>}
            {r.link && <p className="small"><strong>Link: </strong><a href={r.link} target="_blank" rel="noreferrer">{r.link}</a></p>}
            {r.file_path && <a className="btn ghost sm" href={`/api/f/${r.file_path}`} target="_blank" rel="noopener">Open {r.file_name || "file"}</a>}
            {released && <p className="small muted">Already released: <strong>{r.score}</strong>/{a.max_marks}</p>}
          </div>
          <GradeForm
            action={gradeAssignment}
            fields={{ assignment_id: a.id, student_id: r.student_id }}
            max={a.max_marks}
            score={r.score}
            feedback={r.feedback || ""}
            intents={INTENTS}
          />
        </>
      )}
    </section>
  );
}

async function TeacherView({ user, a, course, filter }) {
  const counts = await assignmentCounts(a.id);
  const roster = await rosterSubmissions(a.id);
  const shown = roster.filter((r) => {
    if (filter === "missing") return !r.submission_id;
    if (filter === "late") return r.submission_status === "late";
    if (!filter) return true;
    return r.submission_status === filter;
  });

  return (
    <>
      <Head a={a} course={course} back={user.role === "student" ? "/assignments" : "/dashboard"} />
      <div className="actions">
        <form action={toggleAssignmentPublish}>
          <input type="hidden" name="assignment_id" value={a.id} />
          <button className="btn sm" type="submit">{a.published ? "Unpublish" : "Publish to students"}</button>
        </form>
        <Link href={`/courses/${course.id}/grades`} className="btn ghost sm">Grades for this course</Link>
      </div>

      <div className="stat-grid">
        <StatCard label="Enrolled" value={counts.total} />
        <StatCard label="Submitted" value={counts.submitted} tone="green" hint={`${counts.missing} missing`} />
        <StatCard label="Late" value={counts.late} tone={counts.late ? "warn" : ""} />
        <StatCard label="Released" value={counts.graded} tone="green" />
        <StatCard label="Revisions out" value={counts.revision} tone={counts.revision ? "danger" : ""} />
      </div>

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel" aria-labelledby="table-h">
            <h2 id="table-h">Class submissions</h2>
            {roster.length === 0 ? (
              <p className="small muted">No students are enrolled in this course yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Student</th><th>Status</th><th>Handed in</th><th>Score</th></tr>
                  </thead>
                  <tbody>
                    {roster.map((r) => (
                      <tr key={r.student_id}>
                        <td><Link href={`/students/${r.student_id}`}><strong>{r.full_name}</strong></Link><div className="small muted">{r.matricule || "—"}</div></td>
                        <td>{pillOf(r.submission_id ? r.submission_status : "not_started")}</td>
                        <td className="small muted">{r.submitted_at ? fmtDateTime(r.submitted_at) : "Not submitted"}</td>
                        <td>{r.grade_released === 1 && r.score !== null ? <><strong>{r.score}</strong>/{a.max_marks}</> : <span className="muted small">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="subs-h" style={{ gap: "0.75rem" }}>
            <div className="section-title">
              <h2 id="subs-h">Submissions ({counts.submitted}/{counts.total})</h2>
            </div>
            <div className="chips" role="group" aria-label="Filter submissions">
              {FILTERS.map(([value, label]) => {
                const on = filter === value;
                const n = value === "missing" ? counts.missing : value === "late" ? counts.late : value === "graded" ? counts.graded
                  : value === "revision" ? counts.revision : value === "submitted" ? counts.submitted : counts.total;
                return (
                  <Link key={value || "all"} href={`/assignments/${a.id}${value ? `?filter=${value}` : ""}`} className="chip"
                    style={on ? { background: "var(--brand)", color: "var(--brand-ink)" } : undefined} aria-current={on ? "page" : undefined}>
                    {label} ({n})
                  </Link>
                );
              })}
            </div>
            {shown.length === 0 ? (
              <Empty title={filter ? "Nothing in this filter" : "No students enrolled"}
                text={filter ? "Try another filter." : "Students appear here as soon as they join the course."} />
            ) : shown.map((r) => <RosterRow key={r.student_id} a={a} r={r} />)}
          </section>
        </div>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <EditBasics a={a} />
          <Brief a={a} />
        </div>
      </div>
    </>
  );
}
