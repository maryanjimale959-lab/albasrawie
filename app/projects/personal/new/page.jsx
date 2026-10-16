import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createPersonalProject } from "@/app/actions/projects";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add personal project · Albasrawie" };

export default async function NewPersonalProjectPage() {
  const user = await requireUser("student");
  return (
    <Shell user={user}>
      <div className="page-head">
        <div>
          <Link href="/projects" className="small muted">← Projects</Link>
          <h1 style={{ marginTop: 6 }}>Add personal project</h1>
          <p className="muted">Something you built outside your courses — a side project, a hackathon entry, a tool for yourself.</p>
        </div>
      </div>

      <div className="layout-2">
        <section className="panel" aria-labelledby="pf-h">
          <h2 id="pf-h">Portfolio entry</h2>
          <ActionForm action={createPersonalProject} submitLabel="Save to my portfolio">
            <label>Title<input name="title" maxLength={150} placeholder="Offline note sync app" required /></label>
            <label>Description <span className="hint">what it does and what you learned</span>
              <textarea name="description" rows="6" maxLength={2000} required />
            </label>
            <label>Technologies <span className="hint">comma separated, e.g. Python, SQLite, Flask</span>
              <input name="technologies" maxLength={300} placeholder="Python, SQLite, Flask" />
            </label>
            <div className="row">
              <label>Demo link <span className="hint">optional</span><input name="demo_url" type="url" maxLength={300} placeholder="https://…" /></label>
              <label>Repository link <span className="hint">optional</span><input name="repo_url" type="url" maxLength={300} placeholder="https://…" /></label>
              <label>Completed on<input type="date" name="completed_on" /></label>
            </div>
            <label>Image <span className="hint">optional screenshot or logo — 20 MB max</span><input type="file" name="image" /></label>
          </ActionForm>
        </section>

        <section className="panel" aria-labelledby="note-h">
          <h2 id="note-h">How this is used</h2>
          <ul className="small muted" style={{ paddingLeft: "1.1rem", display: "grid", gap: "0.4rem" }}>
            <li>It lands on your activity calendar marked <strong>self-reported</strong> — no teacher verification.</li>
            <li>Course marks are untouched; this is only your portfolio.</li>
            <li>Make it public from your profile settings if you want it shared outside the class.</li>
          </ul>
          <Link href="/projects" className="btn ghost sm">Back to projects</Link>
        </section>
      </div>
    </Shell>
  );
}
