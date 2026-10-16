import { requireConsoleUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { Avatar, Pill, Empty } from "@/components/ui";
import AdminTabs from "@/components/AdminTabs";
import Link from "next/link";
import { auditLabel, resolveTargets, is_signin } from "@/lib/auditLabels";

export const dynamic = "force-dynamic";

// What the chips at the top of the log switch between.
const VIEWS = [
  ["", "Changes", (r) => !is_signin(r.action)],
  ["decisions", "Account decisions", (r) => r.action.startsWith("admin.")],
  ["signins", "Sign-ins", (r) => is_signin(r.action)],
  ["all", "Everything", () => true],
];

export default async function AdminAudit({ searchParams }) {
  await requireConsoleUser();
  const q = (searchParams.q || "").toString().trim();
  let action = (searchParams.action || "all").toString();
  let view = (searchParams.view || "").toString();
  if (!VIEWS.some(([key]) => key === view)) view = "";

  const known = await db.prepare("SELECT DISTINCT action FROM audit_logs ORDER BY action").all();
  if (action !== "all" && !known.some((k) => k.action === action)) action = "all";

  const rows = await db.prepare(`
    SELECT a.id, a.action, a.target, a.details, a.created_at, a.user_id, u.full_name AS actor, u.role AS actor_role
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    ${action !== "all" ? "WHERE a.action = ?" : ""}
    ORDER BY a.id DESC
    LIMIT 300
  `).all(...(action !== "all" ? [action] : []));

  const keep = VIEWS.find(([key]) => key === view)[2];
  const needle = q.toLowerCase();
  const list = rows.filter((r) => keep(r) && (!q ||
    `${r.action} ${r.actor || "system"} ${r.target || ""} ${r.details || ""}`.toLowerCase().includes(needle)));

  const about = await resolveTargets(list);
  const href = (next) => {
    const p = new URLSearchParams();
    if (next) p.set("view", next);
    if (action !== "all") p.set("action", action);
    if (q) p.set("q", q);
    const qs = p.toString();
    return `/admin/audit${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <AdminTabs active="audit" />

      <div className="page-head">
        <div>
          <h1>Activity log</h1>
          <p className="muted">Every account decision and platform change, newest first, with the name behind it.</p>
        </div>
      </div>

      <section className="panel">
        <div className="chips" style={{ marginBottom: ".9rem" }}>
          {VIEWS.map(([key, label]) => (
            <Link key={key || "changes"} href={href(key)} className={key === view ? "btn sm" : "btn ghost sm"}>{label}</Link>
          ))}
        </div>
        <form method="get" className="row" style={{ alignItems: "end" }}>
          <input type="hidden" name="view" value={view} />
          <label>Search<input name="q" defaultValue={q} placeholder="Action, name, or account" /></label>
          <label>Kind
            <select name="action" defaultValue={action}>
              <option value="all">Everything</option>
              {known.map((k) => <option key={k.action} value={k.action}>{auditLabel(k.action)}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">Apply</button>
        </form>
        <p className="small muted">
          {`Showing ${list.length} of the last 300 entries. `}
          {view === "" && "Sign-ins are hidden here — use Sign-ins or Everything to include them."}
          {view === "decisions" && "Only the decisions made in this console."}
          {view === "signins" && "Only entries recorded when someone signed in."}
          {view === "all" && "Every entry, including sign-ins."}
        </p>
      </section>

      <section className="panel">
        <h2>Entries</h2>
        {list.length === 0 ? (
          <Empty icon="eye" title="Nothing recorded yet" text="Approvals, suspensions, restorations and role changes all leave an entry here." />
        ) : (
          <div className="table-wrap stack-cards">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>About</th><th>Details</th></tr></thead>
              <tbody>
                {list.map((r) => {
                  let details = "";
                  try {
                    const d = r.details ? JSON.parse(r.details) : null;
                    details = d ? Object.entries(d).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
                  } catch { details = String(r.details || ""); }
                  return (
                    <tr key={r.id}>
                      <td data-label="When" className="muted small">{fmtDateTime(r.created_at)}</td>
                      <td data-label="Who">
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Avatar name={r.actor || "system"} size={26} />
                          <div className="small">
                            {r.actor || <span className="muted">system</span>}
                            {r.actor_role && <div className="muted">{r.actor_role}</div>}
                          </div>
                        </div>
                      </td>
                      <td data-label="What"><Pill tone={r.action.startsWith("admin.") ? "blue" : "neutral"}>{auditLabel(r.action)}</Pill></td>
                      <td data-label="About" className="small muted">{about(r.target) || "—"}</td>
                      <td data-label="Details" className="small muted">{details || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
