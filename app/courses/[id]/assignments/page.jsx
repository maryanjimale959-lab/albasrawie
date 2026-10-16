import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import Shell from "@/components/Shell";
import CourseTabs from "@/components/CourseTabs";
import AssignmentList from "@/components/AssignmentList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course assignments · Albasrawie" };

export default async function CourseAssignmentsPage({ params, searchParams }) {
  const user = await requireUser();
  const id = Number(params.id);
  const course = user.role === "student" ? await courseForStudent(user, id) : await courseForTeacher(user, id);
  if (!course) notFound();
  const status = String(searchParams.status || "");
  const isStudent = user.role === "student";

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <Link href={`/courses/${course.id}`} className="small muted">← {course.name}</Link>
          <h1 style={{ marginTop: 6 }}>Assignments</h1>
          <p className="muted">{isStudent ? "Everything your teacher has published for this course." : "Your assignments for this class, with hand-in counts."}</p>
        </div>
        {!isStudent && <Link href={`/assignments/new?course=${course.id}`} className="btn">New assignment</Link>}
      </div>
      <CourseTabs courseId={course.id} active="assignments" />
      <AssignmentList
        user={user}
        courseId={course.id}
        status={status}
        course={course}
        basePath={`/courses/${course.id}/assignments`}
      />
      <p className="small"><Link href="/assignments">See assignments across all my courses</Link></p>
    </Shell>
  );
}
