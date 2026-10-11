import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { registerStudent, registerTeacher } from "@/app/actions";
import AuthFrame from "@/components/AuthFrame";
import ActionForm from "@/components/ActionForm";

export const metadata = { title: "Create account · Albasrawie" };

export default function RegisterPage({ searchParams }) {
  if (getUser()) redirect("/dashboard");
  const teacher = searchParams?.role === "teacher";
  const code = searchParams?.code || "";
  return (
    <AuthFrame title="Create your account" subtitle={teacher ? "Set up courses and follow your students' progress." : "Join courses and track your learning."}>
      <div className="seg" role="navigation" aria-label="Account type">
        <Link href={code ? `/register?code=${encodeURIComponent(code)}` : "/register"} aria-current={!teacher ? "page" : undefined}>I'm a student</Link>
        <Link href="/register?role=teacher" aria-current={teacher ? "page" : undefined}>I'm a teacher</Link>
      </div>

      {teacher ? (
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
      ) : (
        <ActionForm action={registerStudent} submitLabel="Create student account">
          <label>Full name<input name="full_name" autoComplete="name" required /></label>
          <div className="row">
            <label>Student ID<input name="student_id" required /></label>
            <label>Class or study group<input name="class_name" required /></label>
          </div>
          <label>Organization <span className="hint">optional, helps keep student IDs unique</span><input name="organization" /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <div className="row">
            <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
          </div>
          <label>Course code <span className="hint">optional, you can join later</span><input name="course_code" defaultValue={code} autoCapitalize="characters" /></label>
        </ActionForm>
      )}
      <p className="small">Already have an account? <Link href="/login"><strong>Log in</strong></Link></p>
    </AuthFrame>
  );
}
