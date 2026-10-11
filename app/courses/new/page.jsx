import { requireUser } from "@/lib/auth";
import { createCourse } from "@/app/actions";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { redirect } from "next/navigation";

export const metadata = { title: "Create a course · Albasrawie" };

export default function NewCourse() {
  const user = requireUser("teacher");
  if (user.status !== "active") redirect("/dashboard");
  return (
    <Shell user={user}>
      <div><h1>Create a course</h1><p className="muted">A unique course code is generated as soon as you save.</p></div>
      <section className="panel" style={{ maxWidth: 680 }}>
        <ActionForm action={createCourse} submitLabel="Create course">
          <label>Course name<input name="name" placeholder="Python Programming" required /></label>
          <label>Description <span className="hint">optional</span><textarea name="description" /></label>
          <div className="row">
            <label>Subject or category <span className="hint">optional</span><input name="category" placeholder="Programming" /></label>
            <label>Level or semester <span className="hint">optional</span><input name="level" placeholder="Beginner" /></label>
          </div>
          <div className="row">
            <label>Organization <span className="hint">optional</span><input name="organization" /></label>
            <label>Class name <span className="hint">optional</span><input name="class_name" /></label>
          </div>
          <label>Visibility
            <select name="visibility" defaultValue="private">
              <option value="private">Private — students need the code or link</option>
              <option value="listed">Listed — eligible for a course directory when one is added; joining still needs the code</option>
            </select>
          </label>
        </ActionForm>
      </section>
    </Shell>
  );
}
