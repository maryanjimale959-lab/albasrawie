import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import Shell from "@/components/Shell";
import { Pill, Empty } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search · Albasrawie" };

export default function SearchPage({ searchParams }) {
  const user = requireUser();
  const q = (searchParams.q || "").toString().trim();
  if (q.length < 2) {
    return <Shell user={user}><h1>Search</h1><p className="muted">Type at least two characters in the search box above.</p></Shell>;
  }
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const isTeacher = user.role === "teacher" || user.role === "admin";

  const courses = isTeacher
    ? db.prepare("SELECT id, name FROM courses WHERE teacher_id = ? AND name LIKE ? LIMIT 8").all(user.id, like)
    : db.prepare(`SELECT c.id, c.name FROM courses c JOIN enrollments e ON e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
        WHERE c.name LIKE ? LIMIT 8`).all(user.id, like);
  const assignments = isTeacher
    ? db.prepare(`SELECT a.id, a.title, c.name AS course FROM assignments a JOIN courses c ON c.id = a.course_id
        WHERE c.teacher_id = ? AND (a.title LIKE ? OR a.description LIKE ?) LIMIT 8`).all(user.id, like, like)
    : db.prepare(`SELECT a.id, a.title, c.name AS course FROM assignments a JOIN courses c ON c.id = a.course_id
        JOIN enrollments e ON e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
        WHERE a.published = 1 AND (a.title LIKE ? OR a.description LIKE ?) LIMIT 8`).all(user.id, like, like);
  const projects = isTeacher
    ? db.prepare(`SELECT p.id, p.title, c.name AS course FROM projects p JOIN courses c ON c.id = p.course_id
        WHERE c.teacher_id = ? AND p.title LIKE ? LIMIT 8`).all(user.id, like)
    : db.prepare(`SELECT p.id, p.title, c.name AS course FROM projects p JOIN courses c ON c.id = p.course_id
        JOIN enrollments e ON e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
        WHERE p.published = 1 AND p.title LIKE ? LIMIT 8`).all(user.id, like);
  const students = isTeacher
    ? db.prepare(`SELECT DISTINCT u.id, u.full_name, sp.student_id FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        JOIN enrollments e ON e.student_id = u.id AND e.status = 'active'
        JOIN courses c ON c.id = e.course_id AND c.teacher_id = ?
        WHERE u.full_name LIKE ? OR sp.student_id LIKE ? LIMIT 10`).all(user.id, like, like)
    : [];
  const materials = isTeacher
    ? db.prepare(`SELECT m.id, m.title, m.course_id, c.name AS course FROM materials m JOIN courses c ON c.id = m.course_id
        WHERE c.teacher_id = ? AND m.title LIKE ? LIMIT 8`).all(user.id, like)
    : db.prepare(`SELECT m.id, m.title, m.course_id, c.name AS course FROM materials m JOIN courses c ON c.id = m.course_id
        JOIN enrollments e ON e.course_id = c.id AND e.student_id = ? AND e.status = 'active'
        WHERE m.published = 1 AND m.title LIKE ? LIMIT 8`).all(user.id, like);

  const groups = [
    ["Courses", courses.map((c) => ({ href: `/courses/${c.id}`, title: c.name }))],
    ["Assignments", assignments.map((a) => ({ href: `/assignments/${a.id}`, title: a.title, sub: a.course }))],
    ["Projects", projects.map((p) => ({ href: `/projects/${p.id}`, title: p.title, sub: p.course }))],
    ["Students", students.map((s) => ({ href: `/students/${s.id}`, title: s.full_name, sub: s.student_id }))],
    ["Materials", materials.map((m) => ({ href: `/courses/${m.course_id}/materials`, title: m.title, sub: m.course }))],
  ].filter(([, items]) => items.length > 0);

  return (
    <Shell user={user}>
      <div className="page-head"><div><h1>Search results</h1><p className="muted">“{q}” — {groups.reduce((n, [, i]) => n + i.length, 0)} matches within what you're allowed to see.</p></div></div>
      {groups.length === 0 ? (
        <Empty title="Nothing found" text="Only records you have permission to access are searched." />
      ) : groups.map(([label, items]) => (
        <section key={label} className="panel">
          <h2>{label}</h2>
          <div className="work-list">
            {items.map((it, i) => (
              <Link key={i} href={it.href} className="work-item">
                <div className="grow"><h3>{it.title}</h3>{it.sub && <p className="small muted">{it.sub}</p>}</div>
                <Pill tone="neutral">Open</Pill>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </Shell>
  );
}
