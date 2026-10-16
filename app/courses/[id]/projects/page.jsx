import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import Shell from "@/components/Shell";
import CourseTabs from "@/components/CourseTabs";
import ProjectList, { PersonalProjects } from "@/components/ProjectList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course projects · Albasrawie" };

export default async function CourseProjectsPage({ params, searchParams }) {
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
          <h1 style={{ marginTop: 6 }}>Projects</h1>
          <p className="muted">{isStudent ? "Published projects for this course, with your milestone progress." : "Your projects for this class, with average progress across the students."}</p>
        </div>
        {!isStudent && <Link href={`/projects/new?course=${course.id}`} className="btn">New project</Link>}
      </div>
      <CourseTabs courseId={course.id} active="projects" />
      <ProjectList
        user={user}
        courseId={course.id}
        status={status}
        course={course}
        basePath={`/courses/${course.id}/projects`}
      />
      {isStudent && <PersonalProjects user={user} />}
      <p className="small"><Link href="/projects">See projects across all my courses</Link></p>
    </Shell>
  );
}
