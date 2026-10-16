import Link from "next/link";
import { requireConsoleUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Pill, Empty, StatCard } from "@/components/ui";
import AdminTabs from "@/components/AdminTabs";
import { transferCourse } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const VIEWS = ["all", "live", "archived", "empty"];

/* MySQL's GREATEST() returns NULL if any argument is NULL, and a derived table
   cannot see the outer course row here, so each latest timestamp is defaulted
   to a date nobody can reach instead. */
const LAST_ACTIVITY = `GREATEST(
  COALESCE((SELECT MAX(a.created_at) FROM assignments a WHERE a.course_id = c.id), '0001-01-01'),
  COALESCE((SELECT MAX(p.created_at) FROM projects p WHERE p.course_id = c.id), '0001-01-01'),
  COALESCE((SELECT MAX(m.created_at) FROM materials m WHERE m.course_id = c.id), '0001-01-01'),
  COALESCE((SELECT MAX(n.created_at) FROM announcements n WHERE n.course_id = c.id), '0001-01-01'),
  COALESCE((SELECT MAX(s.opened_at) FROM attendance_sessions s WHERE s.course_id = c.id), '0001-01-01')
)`;

export default async function AdminCourses({ searchParams }) {
  await requireConsoleUser();
  const q = (searchParams.q || "").toString().trim();
  const msg = (searchParams.msg || "").toString();
  const view = VIEWS.includes(searchParams.view) ? searchParams.view : "all";
  const sort = ["recent", "students", "name"].includes(searchParams.sort) ? searchParams.sort : "recent";

  const found = await db.prepare(`
    SELECT c.id, c.name, c.archived, c.enrollment_open, c.visibility, c.course_code, c.created_at,
      u.id AS teacher_id, u.full_name AS teacher_name, u.status AS teacher_status,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS students,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignments,
      (SELECT COUNT(*) FROM projects p WHERE p.course_id = c.id) AS projects,
      (SELECT COUNT(*) FROM materials m WHERE m.course_id = c.id) AS materials,
      (SELECT COUNT(*) FROM attendance_sessions s WHERE s.course_id = c.id) AS sessions,
      ${LAST_ACTIVITY} AS last_activity
    FROM courses c JOIN users u ON u.id = c.teacher_id
  `).all();

  const rows = found
    .filter((r) => !q || `${r.name} ${r.teacher_name} ${r.course_code || ""}`.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => view === "all"
      || (view === "live" && !r.archived)
      || (view === "archived" && r.archived)
      || (view === "empty" && Number(r.students) === 0))
    .sort((a, b) => sort === "students"
      ? Number(b.students) - Number(a.students)
      : sort === "name"
        ? a.name.localeCompare(b.name)
        : String(b.last_activity).localeCompare(String(a.last_activity)));

  const live = found.filter((r) => !r.archived).length;
  const waiting = found.filter((r) => !r.archived && Number(r.students) === 0).length;
  const activeTeachers = new Set(found.filter((r) => r.teacher_status === "active").map((r) => r.teacher_id)).size;
  const totalStudents = found.reduce((n, r) => n + Number(r.students), 0);
  const recent = (s) => {
    const t = String(s || "");
    if (!t || t.startsWith("0001")) return <span className="muted">nothing posted yet</span>;
    const days = Math.floor((Date.now() - new Date(t.replace(" ", "T") + "Z").getTime()) / 864e5);
    return <span>{fmtDateTime(t)}{Number.isFinite(days) && <span className="muted"> · {days <= 0 ? "today" : `${days}d ago`}</span>}</span>;
  };

  const teachers = await db.prepare(`
    SELECT id, full_name FROM users WHERE role IN ('teacher','admin') AND status = 'active' ORDER BY full_name`).all();

  return (
    <>
      <AdminTabs active="courses" />
      {msg && <div className="alert ok">{msg}</div>}

      <div className="stat-grid">
        <StatCard label="Active courses" value={live} icon="book" />
        <StatCard label="Archived" value={found.length - live} icon="folder" delay={60} />
        <StatCard label="Enrollments" value={totalStudents} icon="cap" delay={120} />
        <StatCard label="Awaiting students" value={waiting} icon="clock" tone={waiting ? "warn" : ""} delay={180} />
      </div>

      <div className="page-head">
        <div><h1>Courses</h1><p className="muted">Every course on the platform, who runs it, and how recently it was used.</p></div>
        <div className="chips"><Link className="btn ghost sm" href="/admin/accounts">Accounts</Link></div>
      </div>

      <section className="panel">
        <form method="get" className="row" style={{ alignItems: "end" }}>
          <label>Search<input name="q" defaultValue={q} placeholder="Course name, teacher, or code" /></label>
          <label>Show
            <select name="view" defaultValue={view}>
              <option value="all">Every course</option>
              <option value="live">Not archived</option>
              <option value="archived">Archived only</option>
              <option value="empty">No students yet</option>
            </select>
          </label>
          <label>Sort by
            <select name="sort" defaultValue={sort}>
              <option value="recent">Most recent activity</option>
              <option value="students">Most students</option>
              <option value="name">Name</option>
            </select>
          </label>
          <button className="btn" type="submit">Apply</button>
        </form>
      </section>

      <section className="panel">
        <h2>Courses ({rows.length}) · taught by {activeTeachers} teacher{activeTeachers === 1 ? "" : "s"}</h2>
        {rows.length === 0 ? (
          <Empty icon="book" title="No courses here" text="Courses appear as soon as a teacher creates one." />
        ) : (
          <div className="table-wrap stack-cards">
            <table>
              <thead>
                <tr><th>Course</th><th>Teacher</th><th>Students</th><th>Work</th><th>Last activity</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Course">
                      <Link href={`/courses/${r.id}`}><strong>{r.name}</strong></Link>
                      <div className="muted small">
                        id {r.id} · created {fmtDate(r.created_at)}
                        {r.course_code ? <span style={{ fontFamily: "ui-monospace, monospace" }}> · {r.course_code}</span> : null}
                      </div>
                    </td>
                    <td data-label="Teacher">
                      <Link href={`/admin/accounts/${r.teacher_id}`} className="small">{r.teacher_name}</Link>
                      {r.teacher_status !== "active" && (
                        <div style={{ marginTop: ".3rem" }}><Pill tone="red">{r.teacher_status}</Pill></div>
                      )}
                      {teachers.some((t) => t.id !== r.teacher_id) && (
                        <form action={transferCourse} style={{ display: "flex", gap: ".35rem", alignItems: "end", marginTop: ".45rem", flexWrap: "wrap" }}>
                          <input type="hidden" name="course_id" value={r.id} />
                          <select name="to_teacher_id" defaultValue="" aria-label={`Hand ${r.name} to another teacher`} style={{ minWidth: 132 }}>
                            <option value="" disabled>Hand over…</option>
                            {teachers.filter((t) => t.id !== r.teacher_id).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                          </select>
                          <button className="btn ghost sm" type="submit">Move</button>
                        </form>
                      )}
                    </td>
                    <td data-label="Students">{r.students}</td>
                    <td data-label="Work" className="small muted" style={{ whiteSpace: "normal", minWidth: 150 }}>
                      {r.assignments} assignment{r.assignments == 1 ? "" : "s"} · {r.projects} project{r.projects == 1 ? "" : "s"}
                      <div>{r.materials} material{r.materials == 1 ? "" : "s"} · {r.sessions} attendance call{r.sessions == 1 ? "" : "s"}</div>
                    </td>
                    <td data-label="Last activity" className="small">{recent(r.last_activity)}</td>
                    <td data-label="Status">
                      <div className="chips">
                        {r.archived ? <Pill tone="neutral">Archived</Pill> : <Pill tone="green">Active</Pill>}
                        {!r.enrollment_open && !r.archived && <Pill tone="amber">Enrollment closed</Pill>}
                        {r.visibility === "listed" && <Pill tone="blue">Listed</Pill>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">
          Opening a course shows it exactly as the teacher sees it. Nothing here edits their coursework —
          that stays theirs. Handing a course over moves it to another active teacher with its roster, its
          register and every mark already recorded; the materials and announcements keep the name of the
          person who wrote them.
        </p>
      </section>
    </>
  );
}
