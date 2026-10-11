import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import GradesView from "@/components/GradesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grades · Albasrawie" };

export default function GradesPage({ searchParams }) {
  const user = requireUser();
  const courseId = searchParams.course ? Number(searchParams.course) : null;

  let course = null;
  if (courseId) {
    course = user.role === "student" ? courseForStudent(user, courseId) : courseForTeacher(user, courseId);
    if (!course) notFound();
  }

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <h1>Grades</h1>
          <p className="muted">
            {user.role === "student"
              ? "Only marks your teacher has released are counted."
              : "Released assignment and project marks, weighted by each course's settings."}
          </p>
        </div>
      </div>
      <GradesView user={user} courseId={courseId} course={course} />
    </Shell>
  );
}
