import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { teacherCourses } from "@/lib/courses";
import { createProject } from "@/app/actions/projects";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "New project · Albasrawie" };

export default function NewProjectPage({ searchParams }) {
  const user = requireUser("teacher");
  const courses = teacherCourses(user.id).filter((c) => !c.archived);
  const requested = searchParams.course ? Number(searchParams.course) : null;
  const preselected = courses.some((c) => c.id === requested) ? requested : (courses[0]?.id ?? null);

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <Link href="/projects" className="small muted">← Projects</Link>
          <h1 style={{ marginTop: 6 }}>New project</h1>
          <p className="muted">Break the work into milestones so students can show progress while they build.</p>
        </div>
      </div>

      {courses.length === 0 ? (
        <Empty title="You need a course first" text="Projects belong to a course, so create one and come back.">
          <Link href="/courses/new" className="btn">Create a course</Link>
        </Empty>
      ) : (
        <div className="layout-2">
          <section className="panel" aria-labelledby="brief-h">
            <h2 id="brief-h">The brief</h2>
            <ActionForm action={createProject} submitLabel="Create project">
              <label>Course
                <select name="course_id" defaultValue={preselected}>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.student_count ? ` · ${c.student_count} students` : ""}</option>)}
                </select>
              </label>
              <label>Title<input name="title" maxLength={150} placeholder="Build a study planner" required /></label>
              <label>Short description <span className="hint">optional</span>
                <textarea name="description" rows="3" maxLength={2000} />
              </label>
              <label>Objectives <span className="hint">what learners should be able to do at the end</span>
                <textarea name="objectives" rows="4" maxLength={4000} />
              </label>
              <label>Instructions <span className="hint">step-by-step of what to build</span>
                <textarea name="instructions" rows="6" maxLength={4000} />
              </label>
              <div className="row">
                <label>Start date<input type="date" name="start_date" /></label>
                <label>Deadline <span className="hint">end of that day, UTC</span><input type="date" name="deadline" /></label>
                <label>Max marks<input type="number" name="max_marks" min="1" max="1000" defaultValue="100" required /></label>
              </div>
              <label>Work type
                <select name="project_type" defaultValue="individual">
                  <option value="individual">Individual</option>
                  <option value="group">Group</option>
                </select>
              </label>
              <label>Rubric <span className="hint">optional</span><textarea name="rubric" rows="4" maxLength={4000} /></label>
              <label>Reference links <span className="hint">optional, one per line</span>
                <textarea name="reference_links" rows="3" maxLength={2000} placeholder={"https://docs.python.org\nhttps://github.com/…"} />
              </label>
              <hr style={{ border: 0, borderTop: "1px solid var(--line)" }} />
              <h3>Milestones</h3>
              <p className="small muted">Fill in up to five. Blank lines are skipped and the order you type them is the order students see.</p>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n}>Milestone {n} <span className="hint">optional</span>
                  <input name={`milestone_${n}`} maxLength={200} placeholder={n === 1 ? "Wireframe approved" : n === 2 ? "Data model works" : ""} />
                </label>
              ))}
              <label className="check-chip">
                <input type="checkbox" name="publish" value="1" />
                <span>Publish to students now</span>
              </label>
            </ActionForm>
          </section>

          <section className="panel" aria-labelledby="tips-h">
            <h2 id="tips-h">Good to know</h2>
            <ul className="small muted" style={{ paddingLeft: "1.1rem", display: "grid", gap: "0.4rem" }}>
              <li>Milestones start as a draft — publishing sends a notification to the class.</li>
              <li>Students tick milestones off themselves; their progress bar and your per-student table update instantly.</li>
              <li>Each student hands in one project submission (description, demo link, repository, screenshot).</li>
              <li>Nothing is visible to students until you press <strong>Complete &amp; grade</strong>.</li>
            </ul>
            <Link href="/projects" className="btn ghost sm">Back to projects</Link>
          </section>
        </div>
      )}
    </Shell>
  );
}
