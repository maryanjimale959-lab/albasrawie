import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import Shell from "@/components/Shell";
import AssignmentList from "@/components/AssignmentList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assignments · Albasrawie" };

export default async function AssignmentsPage({ searchParams }) {
  const user = await requireUser();
  const courseId = searchParams.course ? Number(searchParams.course) : null;
  const status = String(searchParams.status || "");

  let course = null;
  if (courseId) {
    course = user.role === "student" ? await courseForStudent(user, courseId) : await courseForTeacher(user, courseId);
    if (!course) notFound();
  }

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <h1>Assignments</h1>
          <p className="muted">
            {user.role === "student"
              ? course ? `Everything published in ${course.name}.` : "Every assignment published across your active courses."
              : course ? `Assignments you own in ${course.name}.` : "Assignments you've created, with how many students have handed work in."}
          </p>
        </div>
        {user.role !== "student" && (
          <Link href={`/assignments/new${courseId ? `?course=${courseId}` : ""}`} className="btn">New assignment</Link>
        )}
      </div>
      {course && (
        <p className="small"><Link href={`/courses/${course.id}/assignments`}>See this list inside {course.name}</Link></p>
      )}
      <AssignmentList user={user} courseId={courseId} status={status} course={course} basePath="/assignments" />
    </Shell>
  );
}
