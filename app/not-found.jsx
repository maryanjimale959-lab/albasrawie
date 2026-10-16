import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Page not found · Albasrawie" };

/*
 * One page answers for both kinds of dead end: an address that never existed and
 * a record that belongs to somebody else. It deliberately does not say which of
 * the two it is, so the app never tells a visitor what they were not allowed to
 * know in the first place.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.25rem",
        background: "var(--bg)",
      }}
    >
      <section
        className="panel pop-in"
        style={{ width: "min(560px, 100%)", textAlign: "center", padding: "2.4rem 2rem" }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.1rem" }}>
          <Logo size={30} href="/" />
        </div>
        <p className="hero-eyebrow" style={{ color: "var(--muted)", justifyContent: "center", opacity: 1 }}>
          404
        </p>
        <h1 style={{ fontSize: "1.7rem", marginTop: ".35rem" }}>This page isn&apos;t here.</h1>
        <p className="muted" style={{ marginTop: ".6rem", lineHeight: 1.6 }}>
          The address may be mistyped, the course may have been removed, or the record may belong to
          another account. Either way nothing was opened and nothing was changed.
        </p>
        <div style={{ display: "flex", gap: ".6rem", justifyContent: "center", flexWrap: "wrap", marginTop: "1.5rem" }}>
          <Link href="/dashboard" className="btn sm">Go to my dashboard</Link>
          <Link href="/" className="btn ghost sm">Student home</Link>
          <Link href="/login" className="btn ghost sm">Sign in</Link>
        </div>
      </section>
    </main>
  );
}
