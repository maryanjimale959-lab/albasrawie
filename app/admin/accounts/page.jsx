import Link from "next/link";
import { requireConsoleUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Avatar, Pill, Empty } from "@/components/ui";
import AdminTabs from "@/components/AdminTabs";
import AdminCreateAccount from "@/components/AdminCreateAccount";
import { approveTeacher, changeRole, restoreAccount, suspendAccount } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const ROLES = ["all", "student", "teacher", "admin"];
const STATUSES = ["all", "active", "pending", "suspended"];

const roleTone = (r) => (r === "admin" ? "violet" : r === "teacher" ? "blue" : "neutral");
const statusTone = (s) => (s === "active" ? "green" : s === "pending" ? "amber" : "red");

export default async function AdminAccounts({ searchParams }) {
  const me = await requireConsoleUser();
  const q = (searchParams.q || "").toString().trim();
  const role = ROLES.includes(searchParams.role) ? searchParams.role : "all";
  const status = STATUSES.includes(searchParams.status) ? searchParams.status : "all";
  const msg = (searchParams.msg || "").toString();

  const where = [];
  const args = [];
  if (role !== "all") { where.push("u.role = ?"); args.push(role); }
  if (status !== "all") { where.push("u.status = ?"); args.push(status); }

  const found = await db.prepare(`
    SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at, u.avatar_url,
      (SELECT COUNT(*) FROM courses c WHERE c.teacher_id = u.id) AS courses_taught,
      (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id AND e.status = 'active') AS courses_joined,
      (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login,
      sp.student_id AS student_ref,
      tp.organization AS organization
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY FIELD(u.role, 'admin', 'teacher', 'student'), u.status, u.full_name
  `).all(...args);

  const rows = found.filter((r) => !q ||
    `${r.full_name} ${r.email} ${r.student_ref || ""} ${r.organization || ""}`.toLowerCase().includes(q.toLowerCase()));

  const roleCountsRaw = await db.prepare("SELECT role, COUNT(*) AS c FROM users GROUP BY role").all();
  const studentCount = Number(roleCountsRaw.find((r) => r.role === "student")?.c || 0);
  const teacherCount = Number(roleCountsRaw.find((r) => r.role === "teacher")?.c || 0);
  const adminCount = Number(roleCountsRaw.find((r) => r.role === "admin")?.c || 0);
  const totalUsers = studentCount + teacherCount + adminCount;

  return (
    <>
      <AdminTabs active="accounts" />
      {msg && <div className="alert ok">{msg}</div>}

      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Everyone with a login: separate views for students, teachers, and system administrators.</p>
        </div>
        <div className="chips">
          <a className="btn sm" href="#create">Create an account</a>
          <Link className="btn ghost sm" href="/admin/audit">Activity log</Link>
        </div>
      </div>

      <div className="role-filter-tabs" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <Link
          href={`/admin/accounts?role=all${status !== "all" ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`btn ${role === "all" ? "primary" : "ghost"} sm`}
        >
          All Accounts ({totalUsers})
        </Link>
        <Link
          href={`/admin/accounts?role=student${status !== "all" ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`btn ${role === "student" ? "primary" : "ghost"} sm`}
        >
          Students ({studentCount})
        </Link>
        <Link
          href={`/admin/accounts?role=teacher${status !== "all" ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`btn ${role === "teacher" ? "primary" : "ghost"} sm`}
        >
          Teachers ({teacherCount})
        </Link>
        <Link
          href={`/admin/accounts?role=admin${status !== "all" ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`btn ${role === "admin" ? "primary" : "ghost"} sm`}
        >
          Administrator ({adminCount}/1)
        </Link>
      </div>

      <AdminCreateAccount hasAdmin={adminCount >= 1} />

      <section className="panel">
        <h2>Find an account</h2>
        <form method="get" className="row" style={{ alignItems: "end" }}>
          <label>Search<input name="q" defaultValue={q} placeholder="Name, email, student ID or organization" /></label>
          <label>Role
            <select name="role" defaultValue={role}>
              {ROLES.map((r) => <option key={r} value={r}>{r === "all" ? "Every role" : r}</option>)}
            </select>
          </label>
          <label>Status
            <select name="status" defaultValue={status}>
              {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "Every status" : s}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">Apply</button>
        </form>
      </section>

      <section className="panel">
        <h2>Accounts ({rows.length})</h2>
        {rows.length === 0 ? (
          <Empty icon="users" title="Nobody matches" text="Try a different search, or clear the role and status filters." />
        ) : (
          <div className="table-wrap stack-cards">
            <table>
              <thead>
                <tr>
                  <th>Person</th><th>Role</th><th>Status</th><th>Courses</th><th>Last sign-in</th><th>Joined</th><th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Person">
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Avatar name={r.full_name} size={30} img={r.avatar_url} />
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/admin/accounts/${r.id}`}><strong>{r.full_name}</strong></Link>
                          <div className="muted small">{r.email}{r.student_ref ? ` · ${r.student_ref}` : ""}</div>
                        </div>
                        {r.id === me.id && <span className="muted small">you</span>}
                      </div>
                    </td>
                    <td data-label="Role"><Pill tone={roleTone(r.role)}>{r.role === "admin" ? "administrator" : r.role}</Pill></td>
                    <td data-label="Status"><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
                    <td data-label="Courses" className="small">
                      {r.role === "student"
                        ? `${r.courses_joined} enrolled`
                        : `${r.courses_taught} taught`}
                    </td>
                    <td data-label="Last sign-in" className="muted small">{r.last_login ? fmtDateTime(r.last_login) : "never"}</td>
                    <td data-label="Joined" className="muted small">{fmtDate(r.created_at)}</td>
                    <td data-label="Manage">
                      <div style={{ display: "flex", gap: ".45rem", alignItems: "end", flexWrap: "wrap" }}>
                        <Link className="btn ghost sm" href={`/admin/accounts/${r.id}`}>Open</Link>
                        {r.id === me.id ? (
                          <span className="muted small">Your own account is changed in Settings.</span>
                        ) : r.status === "pending" ? (
                          <>
                            <form action={approveTeacher}>
                              <input type="hidden" name="user_id" value={r.id} />
                              <button className="btn sm" type="submit">Approve</button>
                            </form>
                            <Link className="btn ghost sm" href="/admin">Review application</Link>
                          </>
                        ) : (
                          <>
                            {r.status === "suspended"
                              ? (
                                <form action={restoreAccount}>
                                  <input type="hidden" name="user_id" value={r.id} />
                                  <button className="btn sm" type="submit">Restore</button>
                                </form>
                              )
                              : (
                                <form action={suspendAccount}>
                                  <input type="hidden" name="user_id" value={r.id} />
                                  <button className="btn danger sm" type="submit">Suspend</button>
                                </form>
                              )}
                            {r.status === "active" && (
                              <form action={changeRole} style={{ display: "flex", gap: ".35rem", alignItems: "end" }}>
                                <input type="hidden" name="user_id" value={r.id} />
                                <select name="role" defaultValue="" aria-label={`Role for ${r.full_name}`} style={{ minWidth: 118 }}>
                                  <option value="" disabled>Role…</option>
                                  {r.role !== "teacher" && <option value="teacher">Teacher</option>}
                                  {r.role !== "admin" && <option value="admin">Administrator</option>}
                                </select>
                                <button className="btn ghost sm" type="submit">Set</button>
                              </form>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">
          Quick role changes here go up only: a student can start teaching, a teacher can be made an
          administrator. To step an account back down to student, open it — that needs a student ID and a
          class, and their courses archived first. Suspending an account ends its active sessions
          immediately.
        </p>
      </section>
    </>
  );
}
