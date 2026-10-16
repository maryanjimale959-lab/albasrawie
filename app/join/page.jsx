import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { goToJoin } from "@/app/actions";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Join a course · Albasrawie" };

export default async function JoinPage({ searchParams }) {
  const user = await requireUser();
  if (user.role !== "student") redirect("/dashboard");
  return (
    <Shell user={user}>
      <section className="join-hero">
        <div className="join-brand on-dark"><Logo size={30} /></div>
        <h1>Join a course</h1>
        <p>Enter the code your teacher shared with you — or scan their QR code from your phone.</p>
      </section>
      <section className="panel" style={{ maxWidth: 480 }}>
        <ActionForm action={goToJoin} submitLabel="Find course">
          <label>Course code<input name="code" defaultValue={searchParams?.code || ""} placeholder="PY-7K4M9" autoCapitalize="characters" autoComplete="off" required /></label>
        </ActionForm>
      </section>
    </Shell>
  );
}
