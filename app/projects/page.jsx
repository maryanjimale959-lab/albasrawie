import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import Shell from "@/components/Shell";
import ProjectList, { PersonalProjects } from "@/components/ProjectList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects · Albasrawie" };

export default function ProjectsPage({ searchParams }) {
  const user = requireUser();
  const courseId = searchParams.course ? Number(searchParams.course) : null;
  const status = String(searchParams.status || "");

  let course = null;
  if (courseId) {
    course = user.role === "student" ? courseForStudent(user, courseId) : courseForTeacher(user, courseId);
    if (!course) notFound();
  }

  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">
            {user.role === "student"
              ? course ? `Course projects in ${course.name}, with your milestone progress.` : "Course projects across your active courses, with your milestone progress."
              : course ? `Projects you own in ${course.name}.` : "Your projects with the class's average milestone progress."}
          </p>
        </div>
        {user.role !== "student" && (
          <Link href={`/projects/new${courseId ? `?course=${courseId}` : ""}`} className="btn">New project</Link>
        )}
      </div>
      {course && <p className="small"><Link href={`/courses/${course.id}/projects`}>See this list inside {course.name}</Link></p>}
      <ProjectList user={user} courseId={courseId} status={status} course={course} basePath="/projects" />
      {user.role === "student" && <PersonalProjects user={user} />}
    </Shell>
  );
}
