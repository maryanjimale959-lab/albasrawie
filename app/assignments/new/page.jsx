import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { teacherCourses } from "@/lib/courses";
import { createAssignment } from "@/app/actions/assignments";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "New assignment · Albasrawie" };

const TYPES = [["text", "Typed answer"], ["link", "Link / URL"], ["file", "File upload"]];

export default async function NewAssignmentPage({ searchParams }) {
  const user = await requireUser("teacher");
  const courses = (await teacherCourses(user.id)).filter((c) => !c.archived);
  const requested = searchParams.course ? Number(searchParams.course) : null;
  const preselected = courses.some((c) => c.id === requested) ? requested : (courses[0]?.id ?? null);

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <Link href="/assignments" className="small muted">← Assignments</Link>
          <h1 style={{ marginTop: 6 }}>New assignment</h1>
          <p className="muted">Set the brief, the deadline and how students may hand in.</p>
        </div>
      </div>

      {courses.length === 0 ? (
        <Empty title="You need a course first" text="Assignments belong to a course, so create one and come back.">
          <Link href="/courses/new" className="btn">Create a course</Link>
        </Empty>
      ) : (
        <div className="layout-2">
          <section className="panel" aria-labelledby="brief-h">
            <h2 id="brief-h">The brief</h2>
            <ActionForm action={createAssignment} submitLabel="Create assignment">
              <label>Course
                <select name="course_id" defaultValue={preselected}>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.student_count ? ` · ${c.student_count} students` : ""}</option>)}
                </select>
              </label>
              <label>Title<input name="title" maxLength={150} placeholder="Week 3 — data classes" required /></label>
              <label>Short description <span className="hint">optional, shown in the list</span>
                <textarea name="description" maxLength={2000} rows="3" />
              </label>
              <label>Instructions <span className="hint">what students must actually do</span>
                <textarea name="instructions" maxLength={4000} rows="6" />
              </label>
              <div className="row">
                <label>Due <span className="hint">date and time, students see it in their own timezone</span>
                  <input type="datetime-local" name="due_at" />
                </label>
                <label>Max marks<input type="number" name="max_marks" min="1" max="1000" defaultValue="100" required /></label>
              </div>
              <label>Rubric <span className="hint">optional, what each band of marks looks like</span>
                <textarea name="rubric" maxLength={4000} rows="4" />
              </label>
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
                <legend style={{ fontWeight: 700, fontSize: "0.9rem" }}>Allowed submission types</legend>
                <div className="chips">
                  {TYPES.map(([value, label]) => (
                    <label key={value} className="check-chip">
                      <input type="checkbox" name="types" value={value} defaultChecked />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>Attachment <span className="hint">PDF, Office, image, video, zip, txt or md — 20 MB max</span>
                <input type="file" name="attachment" />
              </label>
              <label className="check-chip">
                <input type="checkbox" name="publish" value="1" />
                <span>Publish to students now</span>
              </label>
              <p className="small muted">Leave this unticked to keep a draft. Publishing sends a notification to every active student in the course.</p>
            </ActionForm>
          </section>

          <section className="panel" aria-labelledby="tips-h">
            <h2 id="tips-h">Good to know</h2>
            <ul className="small muted" style={{ paddingLeft: "1.1rem", display: "grid", gap: "0.4rem" }}>
              <li>Submissions are marked <strong>on time</strong> or <strong>late</strong> automatically by comparing the hand-in moment with your due date.</li>
              <li>Students can only hand in a type you allow here.</li>
              <li>You can grade, request a revision or reopen an assignment later from its page.</li>
              <li>Marks only reach students when you press <strong>Grade &amp; release</strong>.</li>
            </ul>
            <Link href="/assignments" className="btn ghost sm">Back to assignments</Link>
          </section>
        </div>
      )}
    </Shell>
  );
}
