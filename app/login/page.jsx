import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import { login } from "@/app/actions";
import AuthFrame from "@/components/AuthFrame";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Log in · Albasrawie" };

export default async function LoginPage({ searchParams }) {
  const signedIn = await getUser();
  if (signedIn) redirect(homeFor(signedIn.role));
  const waiting = searchParams?.pending === "1";
  const as = searchParams?.as === "teacher" ? "teacher" : "";
  const next = (searchParams?.next || "").toString();
  /* Someone who typed /admin (or clicked it from a bookmark) arrives here
     unsigned. Say what they were reaching for, so the login form is a step and
     not a dead end. */
  const forConsole = next.startsWith("/admin");

  return (
    <AuthFrame
      title={forConsole ? "Administrator sign in" : as === "teacher" ? "Teacher sign in" : "Welcome back"}
      subtitle={forConsole
        ? "Sign in with the administrator account to open the console — accounts, approvals, courses and the activity log."
        : as === "teacher"
          ? "Sign in to run your roster, attendance, coursework and grades."
          : "Enter your credentials to access your academic dashboard."}
    >
      {waiting && (
        <div className="alert info" style={{ marginBottom: "1rem" }}>
          Your email is confirmed and your account is waiting for the platform administrator to approve it.
          You can log in as soon as it is approved.
        </div>
      )}
      <LoginForm action={login} next={next} as={as} forConsole={forConsole} />
    </AuthFrame>
  );
}

