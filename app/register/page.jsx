import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { registerStudent } from "@/app/actions";
import AuthFrame from "@/components/AuthFrame";
import ActionForm from "@/components/ActionForm";
import WrongRole from "@/components/WrongRole";

export const metadata = { title: "Create student account · Albasrawie" };

/* Public sign-up is for students only. Teachers register through their own
   unlisted page at /register/teacher, which is deliberately not linked here. */
export default async function RegisterPage({ searchParams }) {
  const user = await getUser();
  if (user && user.role !== "student") {
    if (user.role === "admin") redirect("/admin");
    return (
      <AuthFrame
        title="This page creates student accounts"
        subtitle="Teachers register from their own link instead."
      >
        <WrongRole user={user} wanted="student" />
      </AuthFrame>
    );
  }
  if (user) redirect("/dashboard");
  const code = searchParams?.code || "";
  return (
    <AuthFrame title="Create your student account" subtitle="Join a course with its code and keep every submission, grade and attendance record in one place.">
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
      <p className="small">Already have an account? <Link href="/login"><strong>Log in</strong></Link></p>
    </AuthFrame>
  );
}
