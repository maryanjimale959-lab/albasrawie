import Link from "next/link";
import { requireConsoleUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, firstName } from "@/lib/format";
import { Avatar, Pill, Empty, StatCard } from "@/components/ui";
import { auditLabel, resolveTargets } from "@/lib/auditLabels";
import AdminTabs from "@/components/AdminTabs";
import { approveAccount, rejectAccount } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminOverview({ searchParams }) {
  const user = await requireConsoleUser();
  const msg = (searchParams.msg || "").toString();

  const byStatus = await db.prepare("SELECT role, status, COUNT(*) c FROM users GROUP BY role, status").all();
  const count = (role, status) =>
    byStatus.filter((r) => r.role === role && (!status || r.status === status)).reduce((n, r) => n + Number(r.c), 0);

  const waiting = await db.prepare(`
    SELECT u.id, u.full_name, u.email, u.role, u.created_at, tp.bio,
           COALESCE(tp.organization, sp.organization) AS organization, tp.department,
           sp.student_id, sp.class_name
    FROM users u
    LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.role IN ('student','teacher') AND u.status = 'pending' AND u.email_verified = 1
    ORDER BY u.created_at ASC, u.id ASC`).all();
  /* Sign-ups that never entered their email code are not in the queue yet. */
  const unconfirmed = Number((await db.prepare(
    "SELECT COUNT(*) c FROM users WHERE status = 'pending' AND email_verified = 0").get()).c);

  const courses = Number((await db.prepare("SELECT COUNT(*) c FROM courses WHERE archived = 0").get()).c);
  const teachers = count("teacher");
  const students = count("student");

  const recent = await db.prepare(`
    SELECT id, full_name, email, role, status, created_at FROM users
    ORDER BY created_at DESC, id DESC LIMIT 8`).all();

  const log = await db.prepare(`
    SELECT a.id, a.action, a.target, a.details, a.created_at, u.full_name AS actor
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.action <> 'user.login'
    ORDER BY a.id DESC LIMIT 8`).all();
  const about = await resolveTargets(log);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  /* A person is greeted by name; a title account like "Platform Administrator"
     is greeted by the whole of it, so the welcome never reads as half a word. */
  const greet = /admin|support|system/i.test(user.full_name) ? user.full_name : firstName(user.full_name);

  return (
    <>
      <AdminTabs />
      {msg && <div className="alert ok">{msg}</div>}

      {/* Welcome band — the administrator's own front door, in the same voice as
          the student and teacher homes, so each role is greeted before they are
          handed the controls. */}
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="hero-eyebrow"><span className="status-dot" /> {today} · Administrator</p>
            <h1>Welcome back, {greet}</h1>
            <p className="hero-sub">
              {waiting.length
                ? <>You have {waiting.length} account{waiting.length === 1 ? "" : "s"} waiting for a decision. Everything else on the platform is already yours to look after.</>
                : teachers === 0 && students === 0
                  ? <>The platform is yours from the beginning — no teacher accounts yet, no student accounts yet, nothing waiting for a decision. Share the sign-up links and the first application lands here.</>
                  : <>Nobody is waiting for a decision. Every student and teacher on this platform is one you have already approved.</>}
            </p>
            <div className="hero-actions">
              <Link href="/admin/accounts" className="btn btn-hero-join">Look after accounts</Link>
              <Link href="/admin/courses" className="btn btn-hero-ghost">Every course</Link>
              <Link href="/admin/audit" className="btn btn-hero-ghost">Activity log</Link>
              {teachers === 0 && <Link href="/teach" className="btn btn-hero-ghost">The teacher page</Link>}
            </div>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard href="#waiting" label="Waiting for you" value={waiting.length} icon="clock" hint={waiting.length ? "Accounts to review" : "Queue is clear"} tone={waiting.length ? "warn" : ""} />
        <StatCard href="/admin/accounts?role=teacher" label="Teachers" value={teachers} icon="cap" hint={`${count("teacher", "pending")} still pending`} delay={60} />
        <StatCard href="/admin/accounts?role=student" label="Students" value={students} icon="users" delay={120} />
        <StatCard href="/admin/courses" label="Active courses" value={courses} icon="book" delay={180} />
      </div>

      <section className="panel" id="waiting">
        <h2>Accounts waiting for approval ({waiting.length})</h2>
        <p className="small muted">
          New student and teacher accounts confirm their email with a code, then are <strong>held here for approval</strong>. Nobody signs in until you decide.
          {unconfirmed > 0 && <> {unconfirmed} more {unconfirmed === 1 ? "has" : "have"} signed up but not entered their email code yet.</>}
        </p>
        {waiting.length === 0 ? (
          <Empty icon="users" title="Nobody in the queue" text="When a student or teacher signs up and confirms their email, their application appears here." />
        ) : (
          <div className="grid-cards">
            {waiting.map((t) => (
              <article className="panel" key={t.id}>
                <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                  <Avatar name={t.full_name} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{t.full_name}</strong>
                    <div className="muted small">{t.email}</div>
                  </div>
                  <span style={{ marginLeft: "auto" }}><Pill tone="amber">Pending</Pill></span>
                </div>
                <div className="chips">
                  <span className="chip">{t.role === "teacher" ? "Teacher" : "Student"}</span>
                  {t.student_id && <span className="chip">ID {t.student_id}</span>}
                  {t.class_name && <span className="chip">{t.class_name}</span>}
                  {t.organization && <span className="chip">{t.organization}</span>}
                  {t.department && <span className="chip">{t.department}</span>}
                  <span className="chip">Applied {fmtDate(t.created_at)}</span>
                </div>
                {t.role === "teacher" && <p className="small">{t.bio || <span className="muted">No biography given.</span>}</p>}
                <div style={{ display: "flex", gap: ".5rem", alignItems: "end", flexWrap: "wrap" }}>
                  <form action={approveAccount}>
                    <input type="hidden" name="user_id" value={t.id} />
                    <button className="btn sm" type="submit">Approve</button>
                  </form>
                  <form action={rejectAccount} style={{ display: "flex", gap: ".4rem", alignItems: "end" }}>
                    <input type="hidden" name="user_id" value={t.id} />
                    <input name="reason" maxLength={300} placeholder="Reason, optional" aria-label={`Reason for not approving ${t.full_name}`} />
                    <button className="btn danger sm" type="submit">Not approve</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <section className="panel">
          <h2>Recently joined</h2>
          {recent.length === 0 ? <p className="muted small">No accounts yet.</p> : (
            <div className="feed">
              {recent.map((r) => (
                <Link className="feed-item" href={`/admin/accounts?q=${encodeURIComponent(r.email)}`} key={r.id}>
                  <Avatar name={r.full_name} size={28} />
                  <div className="feed-main">
                    <strong>{r.full_name}</strong>
                    <div className="muted small">{r.role} · {fmtDate(r.created_at)}</div>
                  </div>
                  {r.status !== "active" && <Pill tone={r.status === "pending" ? "amber" : "red"}>{r.status}</Pill>}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Latest changes</h2>
          {log.length === 0 ? <p className="muted small">Nothing has been recorded yet.</p> : (
            <div className="feed">
              {log.map((a) => (
                <div className="feed-item" key={a.id}>
                  <span className="feed-dot" aria-hidden="true" />
                  <div className="feed-main">
                    <strong>{auditLabel(a.action)}</strong>
                    <div className="muted small">{a.actor || "system"} · {fmtDateTime(a.created_at)}{a.target ? ` · ${about(a.target)}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link className="btn ghost sm" href="/admin/audit">Open the activity log</Link>
        </section>
      </div>
    </>
  );
}
