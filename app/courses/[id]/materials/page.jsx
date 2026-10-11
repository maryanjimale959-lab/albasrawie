import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { courseForTeacher, courseForStudent } from "@/lib/guards";
import { courseMaterials, groupByModule } from "@/lib/materials";
import { fmtDate } from "@/lib/format";
import { addMaterial, toggleMaterialPublish, deleteMaterial } from "@/app/actions/materials";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import CourseTabs from "@/components/CourseTabs";
import { Pill, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Materials · Albasrawie" };

export default function MaterialsPage({ params }) {
  const user = requireUser();
  const id = Number(params.id);

  if (user.role === "student") {
    const course = courseForStudent(user, id);
    if (!course) notFound();
    return <Shell user={user}><StudentMaterials course={course} /></Shell>;
  }

  const course = courseForTeacher(user, id);
  if (!course) notFound();
  return <Shell user={user}><TeacherMaterials course={course} /></Shell>;
}

function Head({ course, sub }) {
  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/courses/${course.id}`} className="small muted">← {course.name}</Link>
          <h1 style={{ marginTop: 6 }}>Materials</h1>
          {sub && <p className="muted">{sub}</p>}
        </div>
      </div>
      <CourseTabs courseId={course.id} active="materials" />
    </>
  );
}

const kindOf = (m) => (m.file_path ? "file" : m.url ? "link" : "note");

function MaterialBody({ m, canManage }) {
  const kind = kindOf(m);
  return (
    <div className="work-item material-item">
      <div className="grow">
        <h3>
          {kind === "file" && <Link href={`/api/f/${m.file_path}`} target="_blank" rel="noopener">{m.title}</Link>}
          {kind === "link" && <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a>}
          {kind === "note" && <details className="note-box"><summary>{m.title}</summary><p className="prose small">{m.description}</p></details>}
        </h3>
        {kind !== "note" && m.description && <p className="small muted">{m.description}</p>}
        <p className="small muted">
          {kind === "file" && `File: ${m.file_name || m.title} · download`}
          {kind === "link" && (m.url || "")}
          {kind === "note" && "Written note"}
          {" · added "}{fmtDate(m.created_at)}{canManage ? ` by ${m.teacher_name}` : ""}
        </p>
      </div>
      <div className="actions" style={{ alignItems: "center" }}>
        {canManage && !m.published && <Pill tone="amber">draft</Pill>}
        {kind === "file" && <Pill tone="blue">file</Pill>}
        {kind === "link" && <Pill tone="neutral">link</Pill>}
        {kind === "note" && <Pill tone="neutral">note</Pill>}
        {canManage && (
          <>
            <form action={toggleMaterialPublish}>
              <input type="hidden" name="material_id" value={m.id} />
              <button className="btn ghost sm" type="submit">{m.published ? "Unpublish" : "Publish"}</button>
            </form>
            <form action={deleteMaterial}>
              <input type="hidden" name="material_id" value={m.id} />
              <button className="btn danger sm" type="submit">Delete</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function TeacherMaterials({ course }) {
  const groups = groupByModule(courseMaterials(course.id));
  return (
    <>
      <Head course={course} sub="Share slides, links and notes with your class." />
      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          {groups.length === 0 ? (
            <Empty title="No materials yet" text="Add your first file, link or note with the form on the right." />
          ) : groups.map((g) => (
            <section className="panel" key={g.module} aria-label={g.module}>
              <h2>{g.module}</h2>
              <div className="work-list">
                {g.items.map((m) => <MaterialBody key={m.id} m={m} canManage />)}
              </div>
            </section>
          ))}
        </div>

        <section className="panel" aria-labelledby="add-h">
          <h2 id="add-h">Add material</h2>
          <p className="small muted">Provide one or more of: a file, a link, or a written note (in the description).</p>
          <ActionForm action={addMaterial} submitLabel="Add material">
            <input type="hidden" name="course_id" value={course.id} />
            <label>Title<input name="title" maxLength={150} required /></label>
            <label>Module / week <span className="hint">optional, groups the list</span>
              <input name="module" placeholder="Week 1" maxLength={80} />
            </label>
            <label>File <span className="hint">PDF, Office, image, video, zip, txt or md — 20 MB max</span>
              <input type="file" name="file" />
            </label>
            <label>Or external link<input name="url" type="url" placeholder="https://…" maxLength={600} /></label>
            <label>Or note / description<textarea name="description" maxLength={4000} /></label>
          </ActionForm>
        </section>
      </div>
    </>
  );
}

function StudentMaterials({ course }) {
  const groups = groupByModule(courseMaterials(course.id, { publishedOnly: true }));
  return (
    <>
      <Head course={course} sub="Everything your teacher has shared for this course." />
      {groups.length === 0 ? (
        <Empty title="No materials yet" text="New files, links and notes will appear here as your teacher publishes them." />
      ) : groups.map((g) => (
        <section className="panel" key={g.module} aria-label={g.module}>
          <h2>{g.module}</h2>
          <div className="work-list">
            {g.items.map((m) => <MaterialBody key={m.id} m={m} canManage={false} />)}
          </div>
        </section>
      ))}
    </>
  );
}
