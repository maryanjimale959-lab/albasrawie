"use client";
import { useFormState, useFormStatus } from "react-dom";

function Submit({ children }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Working…" : children}</button>;
}

export default function ActionForm({ action, submitLabel, children, className = "form" }) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className={className}>
      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok" role="status">{state.ok}</div>}
      {children}
      <Submit>{submitLabel}</Submit>
    </form>
  );
}
