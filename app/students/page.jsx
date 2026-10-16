import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import Shell from "@/components/Shell";
import { Avatar, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students · Albasrawie" };

export default async function StudentsPage({ searchParams }) {
  const user = await requireUser("teacher");
  const q = (searchParams.q || "").toString().trim();
  const sort = ["attendance", "active", "name"].includes(searchParams.sort) ? searchParams.sort : "name";

  const rows = (await db.prepare(`
    SELECT u.id, u.full_name, u.avatar_url, sp.student_id, sp.class_name,
      COUNT(DISTINCT e.course_id) AS courses,
      MAX(e.enrolled_at) AS last_join,
      (SELECT COUNT(*) FROM learning_activities la WHERE la.student_id = u.id) AS activities,
      (SELECT COUNT(DISTINCT la.activity_date) FROM learning_activities la WHERE la.student_id = u.id) AS active_days,
      (SELECT ROUND(100.0 * SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) / COUNT(*))
        FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id AND s.status = 'closed'
        WHERE r.student_id = u.id) AS att_rate
    FROM enrollments e JOIN courses c ON c.id = e.course_id AND c.teacher_id = ?
    JOIN users u ON u.id = e.student_id AND e.status = 'active'
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    GROUP BY u.id, u.full_name, u.avatar_url, sp.student_id, sp.class_name
    ${sort === "attendance" ? "ORDER BY att_rate IS NULL, att_rate ASC" : sort === "active" ? "ORDER BY activities DESC" : "ORDER BY u.full_name"}
  `).all(user.id)).filter((r) => !q || (r.full_name + " " + (r.student_id || "") + " " + (r.class_name || "")).toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell user={user}>
      <div className="page-head">
        <div><h1>Students</h1><p className="muted">Everyone enrolled in one of your courses. Open a profile to see their full learning dashboard.</p></div>
      </div>
      <section className="panel">
        <form method="get" className="row" style={{ alignItems: "end" }}>
          <label>Search<input name="q" defaultValue={q} placeholder="Name, student ID or class" /></label>
          <label>Sort by
            <select name="sort" defaultValue={sort}>
              <option value="name">Name</option>
              <option value="active">Most active</option>
              <option value="attendance">Weakest attendance</option>
            </select>
          </label>
          <button className="btn" type="submit">Apply</button>
        </form>
      </section>
      <section className="panel">
        <h2>Students ({rows.length})</h2>
        {rows.length === 0 ? <p className="muted small">No students match. Share a course code to get enrolled students here.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Student ID</th><th>Class</th><th>Courses</th><th>Activities</th><th>Attendance</th><th>Last joined</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/students/${r.id}`} style={{ display: "flex", gap: 8, alignItems: "center", textDecoration: "none" }}><Avatar name={r.full_name} size={28} img={r.avatar_url} /><strong>{r.full_name}</strong></Link></td>
                    <td>{r.student_id || "—"}</td>
                    <td>{r.class_name || "—"}</td>
                    <td>{r.courses}</td>
                    <td>{r.activities}</td>
                    <td>{r.att_rate === null ? <span className="muted">—</span> : <Pill tone={r.att_rate >= 85 ? "green" : r.att_rate >= 70 ? "amber" : "red"}>{r.att_rate}%</Pill>}</td>
                    <td className="muted small">{fmtDate(r.last_join.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
