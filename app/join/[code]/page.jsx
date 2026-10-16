import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, requireUser } from "@/lib/auth";
import { lookupCode } from "@/lib/courses";
import { confirmJoin } from "@/app/actions";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Join a course · Albasrawie" };

export default async function JoinConfirm({ params }) {
  const code = decodeURIComponent(params.code);
  const user = await getUser();
  if (!user) redirect(`/register?code=${encodeURIComponent(code)}`);
  await requireUser("student");
  const res = await lookupCode(code, user.id);
  if (res.already) redirect(`/courses/${res.courseId}`);

  return (
    <Shell user={user}>
      <section className="join-hero">
        <div className="join-brand on-dark"><Logo size={30} /></div>
        <h1>You&apos;re invited to a course</h1>
        <p>Check the details and join in one tap — you&apos;ll find it under My courses right away.</p>
      </section>

      {res.error ? (
        <section className="panel" style={{ maxWidth: 520 }}>
          <div className="alert error" role="alert">{res.error}</div>
          <div><Link className="btn ghost" href="/join">Try another code</Link></div>
        </section>
      ) : (
        <section className="panel" style={{ maxWidth: 560 }}>
          <div>
            <h2>{res.course.name}</h2>
            <p className="muted">Taught by {res.course.teacher_name}</p>
          </div>
          {res.course.description && <p>{res.course.description}</p>}
          <ActionForm action={confirmJoin} submitLabel="Join this course">
            <input type="hidden" name="code" value={res.course.code} />
          </ActionForm>
        </section>
      )}
    </Shell>
  );
}
