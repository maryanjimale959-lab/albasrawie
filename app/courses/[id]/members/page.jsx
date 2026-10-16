import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import { fmtDate } from "@/lib/format";
import { removeStudent } from "@/app/actions";
import RemoveStudentButton from "@/components/RemoveStudentButton";
import Shell from "@/components/Shell";
import CourseTabs from "@/components/CourseTabs";
import { Avatar, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members · Albasrawie" };

export default async function CourseMembers({ params, searchParams }) {
  const user = await requireUser();
  const courseId = Number(params.id);
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const course = isTeacher ? await courseForTeacher(user, courseId) : await courseForStudent(user, courseId);
  if (!course) notFound();
  const q = (searchParams.q || "").toString().trim().toLowerCase();

  /* Per-student roster stats. `avg_grade` is the mean of every released
     assignment and project grade: MySQL refuses a correlated derived table
     (that needs LATERAL), so the old UNION-ALL + AVG is written as the same
     arithmetic — SUM(score/max_marks) over COUNT of graded rows from both
     sources. COALESCE matters: NULL + number is NULL in SQL, while COUNT over
     an empty set is 0, so a student graded on projects only still gets a
     number. NULLIF(max_marks,0) drops a zero-mark item from both sides, which
     is how AVG used to ignore the NULL that division produced. */
  const rows = (await db.prepare(`
    SELECT u.id, u.full_name, u.avatar_url, sp.student_id, sp.class_name, e.enrolled_at,
      (SELECT COUNT(*) FROM assignments a JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = u.id
        WHERE a.course_id = c.id AND a.published = 1) AS a_done,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.published = 1) AS a_total,
      (SELECT COUNT(*) FROM projects p JOIN project_submissions s ON s.project_id = p.id AND s.student_id = u.id AND s.status = 'completed'
        WHERE p.course_id = c.id) AS p_done,
      (SELECT COUNT(*) FROM projects p WHERE p.course_id = c.id AND p.published = 1) AS p_total,
      (SELECT ROUND(100.0 * SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) / COUNT(*))
        FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id AND s.status = 'closed'
        WHERE r.student_id = u.id AND s.course_id = c.id) AS att_rate,
      ROUND(
        100.0 * (
          COALESCE((SELECT SUM(s.score / NULLIF(a.max_marks,0)) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
            WHERE s.student_id = u.id AND a.course_id = c.id AND s.grade_released = 1 AND s.score IS NOT NULL), 0)
          + COALESCE((SELECT SUM(ps.score / NULLIF(p.max_marks,0)) FROM project_submissions ps JOIN projects p ON p.id = ps.project_id
            WHERE ps.student_id = u.id AND p.course_id = c.id AND ps.grade_released = 1 AND ps.score IS NOT NULL), 0)
        ) / NULLIF(
          (SELECT COUNT(NULLIF(a.max_marks,0)) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
            WHERE s.student_id = u.id AND a.course_id = c.id AND s.grade_released = 1 AND s.score IS NOT NULL)
          + (SELECT COUNT(NULLIF(p.max_marks,0)) FROM project_submissions ps JOIN projects p ON p.id = ps.project_id
            WHERE ps.student_id = u.id AND p.course_id = c.id AND ps.grade_released = 1 AND ps.score IS NOT NULL)
        , 0)
      , 1) AS avg_grade
    FROM courses c
    JOIN enrollments e ON e.course_id = c.id AND e.status = 'active'
    JOIN users u ON u.id = e.student_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE c.id = ? ORDER BY u.full_name`).all(course.id))
    .filter((r) => !q || (r.full_name + " " + (r.student_id || "") + " " + (r.class_name || "")).toLowerCase().includes(q));

  return (
    <Shell user={user}>
      <CourseTabs courseId={course.id} active="members" />
      <div className="page-head" style={{ marginTop: "1rem" }}>
        <div><h1>{course.name}</h1><p className="muted">{rows.length} student{rows.length === 1 ? "" : "s"} enrolled</p></div>
        {isTeacher && <form method="get"><input name="q" defaultValue={searchParams.q || ""} placeholder="Search students…" /></form>}
      </div>
      <section className="panel">
        {rows.length === 0 ? <p className="muted small">No students match.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>ID</th><th>Class</th><th>Assignments</th><th>Projects</th><th>Attendance</th><th>Avg grade</th><th>Joined</th>{isTeacher && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={isTeacher ? `/students/${r.id}` : "/profile"} style={{ display: "flex", gap: 8, alignItems: "center", textDecoration: "none" }}><Avatar name={r.full_name} size={28} img={r.avatar_url} /><strong>{r.full_name}</strong></Link></td>
                    <td>{r.student_id || "—"}</td>
                    <td>{r.class_name || "—"}</td>
                    <td>{r.a_done}/{r.a_total}</td>
                    <td>{r.p_done}/{r.p_total}</td>
                    <td>{r.att_rate === null ? <span className="muted">—</span> : <Pill tone={r.att_rate >= 85 ? "green" : r.att_rate >= 70 ? "amber" : "red"}>{r.att_rate}%</Pill>}</td>
                    <td>{r.avg_grade === null ? <span className="muted">—</span> : `${r.avg_grade}%`}</td>
                    <td className="muted small">{fmtDate(r.enrolled_at.slice(0, 10))}</td>
                    {isTeacher && (
                      <td>
                        <RemoveStudentButton courseId={course.id} studentId={r.id} studentName={r.full_name} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isTeacher && <p className="small muted" style={{ marginTop: ".75rem" }}>Classmates' detailed records stay private — teachers and the student themselves decide what's shared.</p>}
      </section>
    </Shell>
  );
}
