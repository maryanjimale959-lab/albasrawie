"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";

function SubmitButton({ label = "Sign in" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="auth-btn-primary"
      disabled={pending}
    >
      {pending ? (
        <span className="auth-btn-loading">
          <svg className="auth-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span>Authenticating...</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

export default function LoginForm({ action, next = "", as = "", forConsole = false }) {
  const [state, formAction] = useFormState(action, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="auth-form" autoComplete="off">
      <input type="hidden" name="next" value={next} />
      {as ? <input type="hidden" name="as" value={as} /> : null}

      {(as === "teacher" || forConsole) && (
        <p style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "var(--muted)" }}>
          {forConsole ? "This sign-in opens the administrator console." : "This sign-in is for teacher accounts."}
        </p>
      )}

      {state?.error && (
        <div className="auth-alert error" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      {state?.error && as === "teacher" && (
        <p style={{ margin: "-.4rem 0 0", fontSize: ".85rem", color: "var(--muted)" }}>
          Student account? <Link href="/login" className="auth-inline-link">Use the student sign-in</Link>.
        </p>
      )}

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="email">
          Email address
        </label>
        <div className="auth-input-box">
          <span className="auth-input-leading" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </span>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            data-lpignore="true"
            required
            className="auth-input-element"
          />
        </div>
      </div>

      <div className="auth-field">
        <div className="auth-field-header">
          <label className="auth-field-label" htmlFor="password">
            Password
          </label>
        </div>
        <div className="auth-input-box">
          <span className="auth-input-leading" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            data-lpignore="true"
            required
            className="auth-input-element"
          />
          <button
            type="button"
            className="auth-toggle-visibility"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="auth-form-actions">
        <SubmitButton label="Sign in" />
      </div>

      {!forConsole && (
        <div className="auth-links-row">
          <p className="auth-footer-text">
            Don&apos;t have an account?{" "}
            <Link href={as === "teacher" ? "/register/teacher" : "/register"} className="auth-inline-link">
              Create a {as === "teacher" ? "teacher" : "student"} account
            </Link>
          </p>
        </div>
      )}

      <div className="auth-recovery-hint">
        <p>
          Forgot your credentials? Contact your system administrator for access recovery.
        </p>
      </div>
    </form>
  );
}
