"use client";
import { useFormState, useFormStatus } from "react-dom";

function Intents({ intents }) {
  const { pending } = useFormStatus();
  return (
    <div className="actions">
      {intents.map(([value, label, variant = "ghost"]) => (
        <button key={value} name="intent" value={value} type="submit" className={`btn ${variant} sm`} disabled={pending}>
          {pending ? "Working…" : label}
        </button>
      ))}
    </div>
  );
}

/**
 * Grading panel: score + feedback with several submit buttons.
 * The server action decides what each `intent` value does.
 */
export default function GradeForm({ action, fields, max, score = null, feedback = "", intents, children }) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="form">
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      {state?.saved && <div className="alert ok" role="status">{state.saved}</div>}
      <div className="row">
        <label>Score<span className="hint">0 – {max}</span>
          <input type="number" name="score" min="0" max={max} step="1" defaultValue={score ?? ""} />
        </label>
      </div>
      <label>Feedback<textarea name="feedback" rows="3" defaultValue={feedback || ""} placeholder="What went well, what to fix next time…" /></label>
      <Intents intents={intents} />
      {children}
    </form>
  );
}
