import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { teacherCourses, studentCourses } from "@/lib/courses";
import { db } from "@/lib/db";
import Shell from "@/components/Shell";
import CourseCover from "@/components/CourseCover";
import { Pill, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";
export const metadata = { title: "My courses · Albasrawie" };

export default async function CoursesPage() {
  const user = await requireUser();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const list = isTeacher ? await teacherCourses(user.id) : await studentCourses(user.id);

  const countsByCourse = {};
  for (const c of list) {
    countsByCourse[c.id] = await db.prepare(`
              SELECT (SELECT COUNT(*) FROM assignments WHERE course_id = ? AND published = 1) a,
                     (SELECT COUNT(*) FROM projects WHERE course_id = ? AND published = 1) p,
                     (SELECT COUNT(*) FROM materials WHERE course_id = ? AND published = 1) m`).get(c.id, c.id, c.id);
  }
  return (
    <Shell user={user}>
      <div className="page-head">
        <div><h1>My courses</h1><p className="muted">{isTeacher ? "Courses you teach." : "Courses you've joined."}</p></div>
        {isTeacher && user.status === "active" && <Link href="/courses/new" className="btn">Create a course</Link>}
      </div>
      {list.length === 0 ? (
        isTeacher
          ? <Empty title="Create your first course" text="You'll get a code to share with your students right away." icon="book"><Link href="/courses/new" className="btn">Create a course</Link></Empty>
          : <Empty title="No courses yet" text="Enter a course code from your dashboard to join one." icon="book"><Link href="/dashboard" className="btn">Go to dashboard</Link></Empty>
      ) : (
        <div className="grid-cards">
          {list.map((c, i) => {
            const counts = countsByCourse[c.id];
            return (
              <Reveal key={c.id} delay={(i % 4) * 70}>
                <Link href={`/courses/${c.id}`} className={`course-card lift ${c.archived ? "archived" : ""}`}>
                  <CourseCover name={c.name} category={c.category} />
                  <div className="course-card-body">
                    <h3>{c.name}</h3>
                    <p className="small muted">{isTeacher ? `${c.student_count} student${c.student_count === 1 ? "" : "s"} · ` : `Taught by ${c.teacher_name} · `}{counts.a} assignments · {counts.p} projects</p>
                    <div className="chips">
                      {c.level && <span className="chip">{c.level}</span>}
                      {isTeacher && c.course_code && <span className="chip" style={{ fontFamily: "ui-monospace, monospace" }}>{c.course_code}</span>}
                      {isTeacher && !c.enrollment_open && <Pill tone="neutral">Enrollment closed</Pill>}
                      {c.archived ? <Pill tone="neutral">Archived</Pill> : null}
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
