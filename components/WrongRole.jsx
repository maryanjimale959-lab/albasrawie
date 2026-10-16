import Link from "next/link";
import { logout } from "@/app/actions";

/*
 * Shown when someone opens a link that belongs to another role — a sign-up page
 * or the administrator console. The account is not switched, merged or guessed
 * at, and nobody is bounced to a different address: the page says what the link
 * is for, who is currently signed in, and offers the honest ways forward.
 */
export default function WrongRole({ user, wanted }) {
  const isConsole = wanted === "admin";
  const isTeacherLink = wanted === "teacher";
  const roleWord = user.role === "teacher" ? "teacher" : user.role === "admin" ? "administrator" : "student";

  return (
    <div className="auth-form">
      <div className="auth-alert error" role="alert">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          {isConsole ? (
            <>
              This is the <strong>administrator console</strong>. You are signed in as{" "}
              <strong>{user.full_name}</strong>, a {roleWord} account, so the console stayed closed and nothing
              was changed.
            </>
          ) : (
            <>
              You are signed in as <strong>{user.full_name}</strong>, a {roleWord} account. This link creates{" "}
              {isTeacherLink ? "teacher" : "student"} accounts, so nothing was created or changed.
            </>
          )}
        </span>
      </div>

      <p style={{ margin: "0", fontSize: "0.9rem", lineHeight: 1.55, color: "var(--muted)" }}>
        {isConsole
          ? "The console holds every account, every approval and the activity log for this platform. Only the administrator account can open it — sign out and use those credentials, or go back to your own work."
          : isTeacherLink
            ? "Teacher accounts are set up from the link your administrator shares with you. Students register from the public sign-up page."
            : "The public sign-up page is for students. If you teach here, the teacher link is sent to you directly."}
      </p>

      <div className="auth-form-actions">
        <Link href="/dashboard" className="auth-btn-primary">Continue to my dashboard</Link>
      </div>

      <div className="auth-links-row">
        <form action={logout} style={{ width: "100%" }}>
          <button
            type="submit"
            className="auth-inline-link"
            style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", width: "100%", textAlign: "center" }}
          >
            Sign out and use another account
          </button>
        </form>
      </div>

      {/* Only the console card points at another sign-in. A student page must not
          carry a teacher link and a teacher page must not carry a student one, so
          the other door is simply not named here. */}
      {isConsole && (
        <div className="auth-recovery-hint">
          <p>
            Have the administrator credentials?{" "}
            <Link href="/login?next=%2Fadmin" className="auth-inline-link">Sign in as the administrator</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
