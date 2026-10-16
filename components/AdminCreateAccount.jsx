"use client";
import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { createAccount } from "@/app/admin/actions";

const KINDS = [
  {
    role: "student",
    label: "Student",
    blurb: "Joins courses with a code, marks attendance and hands work in. Needs a student ID and a class.",
  },
  {
    role: "teacher",
    label: "Teacher",
    blurb: "Runs courses: the roster, the register, coursework, marking and grades.",
  },
  {
    role: "admin",
    label: "Administrator",
    blurb: "Opens the console: accounts, approvals, every course and the activity log.",
  },
];

/* A password the administrator can read off the screen and hand over. It is a
   temporary one by design — the account is told to change it in Settings. */
function makePassword() {
  const words = "abcdefghjkmnpqrstuvwxyz";
  const caps = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  let out = "";
  for (let i = 0; i < 6; i += 1) out += pick(words);
  out = pick(caps) + out + Math.floor(100 + Math.random() * 800);
  return out;
}

function Submit({ label }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : label}</button>;
}

export default function AdminCreateAccount({ hasAdmin = false }) {
  const [role, setRole] = useState("student");
  const [password, setPassword] = useState("");
  const [state, formAction] = useFormState(createAccount, null);
  const kind = KINDS.find((k) => k.role === role);

  return (
    <section className="panel" id="create">
      <h2>Create an account</h2>
      <p className="small muted">
        Hand someone their login yourself. An account made here is active the moment it is saved — you are
        the approval — so the person can sign in as soon as you give them the password.
      </p>

      <div className="row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: "1rem" }}>
        {KINDS.map((k) => {
          const isBlockedAdmin = k.role === "admin" && hasAdmin;
          return (
            <button
              key={k.role}
              type="button"
              className={k.role === role ? "btn sm" : "btn ghost sm"}
              aria-pressed={k.role === role}
              disabled={isBlockedAdmin}
              title={isBlockedAdmin ? "Only 1 system administrator is allowed (slot is filled)." : undefined}
              onClick={() => !isBlockedAdmin && setRole(k.role)}
              style={isBlockedAdmin ? { opacity: 0.55, cursor: "not-allowed" } : {}}
            >
              {k.label} {isBlockedAdmin ? "· 1/1" : ""}
            </button>
          );
        })}
      </div>
      <p className="small" style={{ marginTop: 0, color: "var(--muted)" }}>
        {kind.blurb}
        {hasAdmin && role === "admin" && " (Only one system administrator is allowed in this system)."}
      </p>

      <form action={formAction}>
        <input type="hidden" name="role" value={role} />
        {state?.error && <div className="alert error" role="alert" style={{ marginBottom: "1rem" }}>{state.error}</div>}

        <div className="row">
          <label>Full name
            <input name="full_name" placeholder="Amina Yusuf" autoComplete="off" required />
          </label>
          <label>Email
            <input name="email" type="email" placeholder="amina@school.edu" autoComplete="off" required />
          </label>
        </div>

        {role === "student" && (
          <div className="row">
            <label>Student ID
              <input name="student_id" placeholder="STU-2041" autoComplete="off" required />
            </label>
            <label>Class or study group
              <input name="class_name" placeholder="Grade 10 A" autoComplete="off" required />
            </label>
          </div>
        )}

        {role === "teacher" && (
          <div className="row">
            <label>Organization <span className="hint">optional</span>
              <input name="organization" placeholder="Sheekeeye Academy" autoComplete="off" />
            </label>
            <label>Department <span className="hint">optional</span>
              <input name="department" placeholder="Mathematics" autoComplete="off" />
            </label>
          </div>
        )}

        <div className="row">
          <label>Password to hand over
            <input
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="at least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setPassword(makePassword())}
            >
              Make up a password
            </button>
          </div>
        </div>

        <label style={{ marginTop: ".25rem" }}>Note for their profile <span className="hint">optional</span>
          <textarea
            name="bio"
            rows={2}
            placeholder={role === "student" ? "Anything you want this account to see on its profile." : "A short line about what they teach."}
          />
        </label>

        <div className="row" style={{ marginTop: "1rem" }}>
          <Submit label={`Create ${kind.label.toLowerCase()} account`} />
        </div>
        <p className="small muted" style={{ marginTop: ".75rem" }}>
          Everything you do here is written to the activity log with your name on it.
        </p>
      </form>
    </section>
  );
}
