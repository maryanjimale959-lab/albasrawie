import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import Shell from "@/components/Shell";
import CourseTabs from "@/components/CourseTabs";
import GradesView from "@/components/GradesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course grades · Albasrawie" };

export default async function CourseGradesPage({ params }) {
  const user = await requireUser();
  const id = Number(params.id);
  const course = user.role === "student" ? await courseForStudent(user, id) : await courseForTeacher(user, id);
  if (!course) notFound();

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <Link href={`/courses/${course.id}`} className="small muted">← {course.name}</Link>
          <h1 style={{ marginTop: 6 }}>Grades</h1>
          <p className="muted">
            {user.role === "student"
              ? "Released assignment and project marks, weighted the way your teacher set it up."
              : `Each student's overall mark for ${course.name}, built from released grades only.`}
          </p>
        </div>
      </div>
      <CourseTabs courseId={course.id} active="grades" />
      <GradesView user={user} courseId={course.id} course={course} basePath={`/courses/${course.id}/grades`} />
      <p className="small"><Link href="/grades">{user.role === "student" ? "All my courses" : "Grade overview across my courses"}</Link></p>
    </Shell>
  );
}
