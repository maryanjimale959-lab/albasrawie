import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseForTeacher, courseForStudent } from "@/lib/guards";
import { fmtDateTime } from "@/lib/format";
import { addAnnouncement, deleteAnnouncement } from "@/app/actions/announcements";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import CourseTabs from "@/components/CourseTabs";
import { Avatar, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Announcements · Albasrawie" };

export default function AnnouncementsPage({ params }) {
  const user = requireUser();
  const id = Number(params.id);

  if (user.role === "student") {
    const course = courseForStudent(user, id);
    if (!course) notFound();
    return <Shell user={user}><StudentFeed course={course} /></Shell>;
  }

  const course = courseForTeacher(user, id);
  if (!course) notFound();
  return <Shell user={user}><TeacherBoard course={course} /></Shell>;
}

function Head({ course, sub }) {
  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/courses/${course.id}`} className="small muted">← {course.name}</Link>
          <h1 style={{ marginTop: 6 }}>Announcements</h1>
          {sub && <p className="muted">{sub}</p>}
        </div>
      </div>
      <CourseTabs courseId={course.id} active="announcements" />
    </>
  );
}

function AnnouncementCard({ a, canManage }) {
  return (
    <article className="panel">
      <div className="profile-head">
        <Avatar name={a.teacher_name} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{a.title}</h2>
          <p className="small muted">{a.teacher_name} · {fmtDateTime(a.created_at)}</p>
        </div>
        {canManage && (
          <form action={deleteAnnouncement}>
            <input type="hidden" name="announcement_id" value={a.id} />
            <button className="btn danger sm" type="submit">Delete</button>
          </form>
        )}
      </div>
      <p className="prose">{a.content}</p>
    </article>
  );
}

function TeacherBoard({ course }) {
  const mine = db.prepare(`
    SELECT a.*, u.full_name AS teacher_name FROM announcements a JOIN users u ON u.id = a.teacher_id
    WHERE a.course_id = ? ORDER BY a.created_at DESC`).all(course.id);
  return (
    <>
      <Head course={course} sub="Announcements notify every enrolled student in the app." />
      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          {mine.length === 0 ? (
            <Empty title="No announcements yet" text="Write the first one with the form on the right — your students will see it here and in their notifications." />
          ) : mine.map((a) => <AnnouncementCard key={a.id} a={a} canManage />)}
        </div>
        <section className="panel" aria-labelledby="compose-h">
          <h2 id="compose-h">New announcement</h2>
          <ActionForm action={addAnnouncement} submitLabel="Publish announcement">
            <input type="hidden" name="course_id" value={course.id} />
            <label>Title<input name="title" maxLength={150} required /></label>
            <label>Message<textarea name="content" maxLength={8000} required /></label>
          </ActionForm>
          <p className="small muted">Students get an in-app notification linking back to this page.</p>
        </section>
      </div>
    </>
  );
}

function StudentFeed({ course }) {
  const feed = db.prepare(`
    SELECT a.*, u.full_name AS teacher_name FROM announcements a JOIN users u ON u.id = a.teacher_id
    WHERE a.course_id = ? ORDER BY a.created_at DESC`).all(course.id);
  return (
    <>
      <Head course={course} sub="Latest first." />
      {feed.length === 0 ? (
        <Empty title="Nothing announced yet" text={`Announcements from ${course.name} will show up here.`} />
      ) : feed.map((a) => <AnnouncementCard key={a.id} a={a} canManage={false} />)}
    </>
  );
}
