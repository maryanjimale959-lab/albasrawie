"use client";
import { useFormState, useFormStatus } from "react-dom";

function Btn() {
  const { pending } = useFormStatus();
  return <button className="btn sm" type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</button>;
}

export default function InviteForm({ courseId, action }) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="form">
      <input type="hidden" name="course_id" value={courseId} />
      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      {state?.sent && <div className="alert ok" role="status">{state.sent}</div>}
      <label>Student's account email<input name="email" type="email" required /></label>
      <div><Btn /></div>
    </form>
  );
}
