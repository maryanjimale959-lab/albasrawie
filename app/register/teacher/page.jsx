import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { registerTeacher } from "@/app/actions";
import AuthFrame from "@/components/AuthFrame";
import ActionForm from "@/components/ActionForm";
import WrongRole from "@/components/WrongRole";

export const metadata = {
  title: "Create teacher account · Albasrawie",
  /* Unlisted on purpose: the public sign-up page is students only, so this
     page is shared directly with staff rather than linked or indexed. */
  robots: { index: false, follow: false },
};

export default async function RegisterTeacherPage() {
  const user = await getUser();
  /* Someone who already has an account of the other kind is refused here in
     words rather than quietly carried into the app. */
  if (user && user.role !== "teacher") {
    if (user.role === "admin") redirect("/admin");
    return (
      <AuthFrame
        title="This link creates teacher accounts"
        subtitle="It is meant for staff who have not registered yet."
      >
        <WrongRole user={user} wanted="teacher" />
      </AuthFrame>
    );
  }
  if (user) redirect("/dashboard");

  return (
    <AuthFrame title="Create your teacher account" subtitle="Set up courses, run attendance and follow every student's progress.">
      <ActionForm action={registerTeacher} submitLabel="Create teacher account">
        <label>Full name<input name="full_name" autoComplete="name" required /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <div className="row">
          <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
        </div>
        <div className="row">
          <label>Organization <span className="hint">optional</span><input name="organization" /></label>
          <label>Department <span className="hint">optional</span><input name="department" /></label>
        </div>
        <label>Short professional biography<textarea name="bio" maxLength={600} required /></label>
      </ActionForm>
      <p className="small">Already teach here? <Link href="/login?as=teacher"><strong>Log in</strong></Link></p>
    </AuthFrame>
  );
}
