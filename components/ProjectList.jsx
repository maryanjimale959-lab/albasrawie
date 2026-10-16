import Link from "next/link";
import { Empty, Pill, Progress, StatCard } from "./ui";
import { dueLabel, fmtDate } from "@/lib/format";
import { PROJECT_STATUS_META, personalProjectsFor, studentProjects, teacherProjects } from "@/lib/projects";
import { deletePersonalProject } from "@/app/actions/projects";

const pill = (s) => PROJECT_STATUS_META[s] || PROJECT_STATUS_META.not_started;

const qsp = (base, { courseId, status }) => {
  const p = new URLSearchParams();
  if (courseId) p.set("course", String(courseId));
  if (status) p.set("status", status);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
};

const PROJECT_FILTERS = [
  ["", "All"],
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["submitted", "Submitted"],
  ["under_review", "Under review"],
  ["revision", "Revision requested"],
  ["completed", "Completed"],
];

async function StudentProjects({ user, courseId, status, basePath, course }) {
  const all = await studentProjects(user.id, { courseId });
  const counts = all.reduce((n, r) => ({ ...n, [r.status]: (n[r.status] || 0) + 1 }), {});
  const list = status ? all.filter((p) => p.status === status) : all;
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Projects" value={all.length} hint={courseId ? `in ${course?.name || "this course"}` : "across your courses"} />
        <StatCard label="In progress" value={(counts.in_progress || 0) + (counts.not_started || 0)} tone="warn" />
        <StatCard label="Handed in" value={(counts.submitted || 0) + (counts.under_review || 0) + (counts.revision || 0)} />
        <StatCard label="Completed" value={counts.completed || 0} tone="green" />
      </div>
      <div className="chips" role="group" aria-label="Filter projects by status">
        {PROJECT_FILTERS.map(([value, label]) => {
          const on = status === value;
          const n = value ? counts[value] || 0 : all.length;
          if (value && !n && status !== value) return null;
          return (
            <Link key={value || "all"} href={qsp(basePath, { courseId, status: value })} className="chip"
              style={on ? { background: "var(--brand)", color: "var(--brand-ink)" } : undefined} aria-current={on ? "page" : undefined}>
              {label}{n > 0 ? ` (${n})` : ""}
            </Link>
          );
        })}
      </div>
      {list.length === 0 ? (
        <Empty title={status ? "Nothing in this filter" : "No projects yet"}
          text={status ? "Clear the filter to see all published projects." : "Course projects appear here as soon as your teacher publishes them."} />
      ) : (
        <div className="grid-cards">
          {list.map((p) => {
            const dl = dueLabel(p.deadline);
            const meta = pill(p.status);
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="work-item" style={{ display: "grid", gap: "0.5rem", alignItems: "start" }}>
                <div className="grow" style={{ width: "100%" }}>
                  <h3>{p.title}</h3>
                  <p className="small muted">{p.course_name}{p.project_type === "group" ? " · Group project" : ""}</p>
                </div>
                <Progress value={p.percent} label={`${p.milestones_done}/${p.milestone_total}`} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <span className={`due ${dl.tone}`}>{dl.text}</span>
                  <Pill tone={meta.tone}>{meta.label}</Pill>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

async function TeacherProjects({ user, courseId, course }) {
  const list = await teacherProjects(user, { courseId });
  const published = list.filter((p) => p.published);
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Projects" value={list.length} hint={courseId ? `in ${course?.name || "this course"}` : "you've created"} />
        <StatCard label="Published" value={published.length} tone="green" />
        <StatCard label="Drafts" value={list.length - published.length} tone={list.length > published.length ? "warn" : ""} />
        <StatCard label="Graded" value={list.reduce((n, p) => n + p.graded, 0)} />
      </div>
      {list.length === 0 ? (
        <Empty title="No projects yet" text="Set up a project with milestones so students can track their progress.">
          <Link href={`/projects/new${courseId ? `?course=${courseId}` : ""}`} className="btn">New project</Link>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Project</th>{!courseId && <th>Course</th>}<th>Milestones</th><th>Class progress</th><th>Submissions</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/projects/${p.id}`}><strong>{p.title}</strong></Link>{p.deadline && <div className="small muted">{dueLabel(p.deadline).text}</div>}</td>
                  {!courseId && <td>{p.course_name}</td>}
                  <td>{p.milestone_total}</td>
                  <td><Progress value={p.avg_percent} /></td>
                  <td>{p.submitted}/{p.total_students}</td>
                  <td><Pill tone={p.published ? "green" : "neutral"}>{p.published ? "Published" : "Draft"}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Role-aware project list, reused by /projects and /courses/[id]/projects. */
export default function ProjectList({ user, courseId = null, status = "", basePath = "/projects", course = null }) {
  if (user.role === "student") return <StudentProjects user={user} courseId={courseId} status={status} basePath={basePath} course={course} />;
  return <TeacherProjects user={user} courseId={courseId} course={course} />;
}

/** Self-reported portfolio entries (students only). */
export async function PersonalProjects({ user }) {
  const list = await personalProjectsFor(user.id);
  return (
    <section aria-labelledby="personal-h" style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title">
        <h2 id="personal-h">My personal projects</h2>
        <Link href="/projects/personal/new" className="btn">Add personal project</Link>
      </div>
      <p className="small muted">Things you built outside your courses. These are self-reported and live on your portfolio.</p>
      {list.length === 0 ? (
        <Empty title="Nothing in your portfolio yet" text="Log a side project so your progress calendar shows learning outside class too.">
          <Link href="/projects/personal/new" className="btn">Add personal project</Link>
        </Empty>
      ) : (
        <div className="portfolio-grid">
          {list.map((p) => (
            <article key={p.id} className="portfolio-card">
              {p.image_path && <img src={`/api/f/${p.image_path}`} alt={p.image_name || p.title} />}
              <div className="portfolio-body">
                <h3>{p.title}</h3>
                {p.completed_on && <span className="small muted">Finished {fmtDate(p.completed_on)}</span>}
                <p className="small">{p.description}</p>
                {p.technologies && (
                  <div className="chips">{p.technologies.split(",").filter(Boolean).map((t) => <span key={t} className="chip">{t}</span>)}</div>
                )}
                <div className="actions">
                  {p.demo_url && <a className="btn ghost sm" href={p.demo_url} target="_blank" rel="noreferrer">Demo</a>}
                  {p.repo_url && <a className="btn ghost sm" href={p.repo_url} target="_blank" rel="noreferrer">Repository</a>}
                </div>
                <form action={deletePersonalProject} className="actions">
                  <input type="hidden" name="personal_project_id" value={p.id} />
                  <button className="btn danger sm" type="submit">Delete</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
