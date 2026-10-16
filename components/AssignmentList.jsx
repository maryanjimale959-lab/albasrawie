import Link from "next/link";
import { Empty, Pill, StatCard } from "./ui";
import { dueLabel } from "@/lib/format";
import { STATUS_META, statusCounts, studentAssignments, teacherAssignments } from "@/lib/assignments";

const FILTERS = [
  ["", "All"],
  ["not_started", "Not started"],
  ["submitted", "Submitted"],
  ["late", "Late"],
  ["graded", "Graded"],
  ["revision", "Revision requested"],
];

const qsp = (base, { courseId, status }) => {
  const p = new URLSearchParams();
  if (courseId) p.set("course", String(courseId));
  if (status) p.set("status", status);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
};

const toneOf = (s) => (STATUS_META[s] || STATUS_META.not_started).tone;
const labelOf = (s) => (STATUS_META[s] || STATUS_META.not_started).label;

async function StudentAssignments({ user, courseId, status, basePath, course }) {
  const all = await studentAssignments(user.id, { courseId });
  const counts = statusCounts(all);
  const list = status ? all.filter((a) => a.status === status) : all;
  const todo = (counts.not_started || 0);
  const handed = (counts.submitted || 0) + (counts.late || 0);

  return (
    <>
      <div className="stat-grid">
        <StatCard label="Published" value={all.length} hint={courseId ? `in ${course?.name}` : "across your courses"} />
        <StatCard label="Not started" value={todo} tone={todo ? "warn" : ""} />
        <StatCard label="Handed in" value={handed} tone="green" />
        <StatCard label="Graded" value={counts.graded || 0} tone="green" />
        <StatCard label="Awaiting revision" value={counts.revision || 0} tone={counts.revision ? "danger" : ""} />
      </div>

      <div className="chips" role="group" aria-label="Filter assignments by status">
        {FILTERS.map(([value, label]) => {
          const on = status === value;
          const n = value ? counts[value] || 0 : all.length;
          return (
            <Link key={value || "all"} href={qsp(basePath, { courseId, status: value })}
              className={`chip ${on ? "on" : ""}`} style={on ? { background: "var(--brand)", color: "var(--brand-ink)" } : undefined}
              aria-current={on ? "page" : undefined}>
              {label} ({n})
            </Link>
          );
        })}
      </div>

      {list.length === 0 ? (
        <Empty title={status ? "Nothing in this filter" : "No assignments yet"}
          text={status ? "Clear the filter to see everything published in your courses." : "Your teachers haven't published any assignments in this course yet."} />
      ) : (
        <div className="work-list">
          {list.map((a) => {
            const dl = dueLabel(a.due_at);
            const graded = a.status === "graded" && a.grade_released && a.score !== null;
            return (
              <Link key={a.id} href={`/assignments/${a.id}`} className="work-item">
                <div className="grow">
                  <h3>{a.title}</h3>
                  <p className="small muted">
                    {a.course_name}{a.due_at ? ` · ${dl.text}` : ""}{graded ? ` · ${a.score}/${a.max_marks}` : ""}
                  </p>
                </div>
                {a.due_at && !a.submission_id && <span className={`due ${dl.tone}`}>{dl.text}</span>}
                <Pill tone={toneOf(a.status)}>{labelOf(a.status)}</Pill>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

async function TeacherAssignments({ user, courseId, basePath, course }) {
  const list = await teacherAssignments(user, { courseId });
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Assignments" value={list.length} hint={courseId ? `in ${course?.name}` : "you've created"} />
        <StatCard label="Published" value={list.filter((a) => a.published).length} tone="green" />
        <StatCard label="Drafts" value={list.filter((a) => !a.published).length} tone={list.some((a) => !a.published) ? "warn" : ""} />
        <StatCard label="Submissions" value={list.reduce((n, a) => n + a.submitted, 0)} />
      </div>
      {list.length === 0 ? (
        <Empty title="No assignments yet" text="Create one and publish it; your students get a notification straight away.">
          <Link href={`/assignments/new${courseId ? `?course=${courseId}` : ""}`} className="btn">New assignment</Link>
        </Empty>
      ) : (
        <div className="work-list">
          {list.map((a) => {
            const dl = dueLabel(a.due_at);
            return (
              <Link key={a.id} href={`/assignments/${a.id}`} className="work-item">
                <div className="grow">
                  <h3>{a.title}</h3>
                  <p className="small muted">
                    {courseId ? `${a.submitted}/${a.total} submitted` : `${a.course_name} · ${a.submitted}/${a.total} submitted`}
                    {a.late ? ` · ${a.late} late` : ""}{a.due_at ? ` · ${dl.text}` : ""}
                  </p>
                </div>
                {a.due_at && <span className={`due ${a.published ? dl.tone : "muted"}`}>{dl.text}</span>}
                <Pill tone={a.published ? "green" : "neutral"}>{a.published ? "Published" : "Draft"}</Pill>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Role-aware assignment list, reused by /assignments and /courses/[id]/assignments. */
export default function AssignmentList({ user, courseId = null, status = "", basePath = "/assignments", course = null }) {
  if (user.role === "student") return <StudentAssignments user={user} courseId={courseId} status={status} basePath={basePath} course={course} />;
  return <TeacherAssignments user={user} courseId={courseId} basePath={basePath} course={course} />;
}

export { toneOf as assignmentTone, labelOf as assignmentStatusLabel };
