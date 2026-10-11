import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { markNotificationsRead } from "@/app/actions";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications · Albasrawie" };

export default function Notifications() {
  const user = requireUser();
  const items = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100").all(user.id);
  const unread = items.filter((n) => !n.read).length;
  return (
    <Shell user={user}>
      <div className="page-head">
        <h1>Notifications</h1>
        {unread > 0 && <form action={markNotificationsRead}><button className="btn ghost sm" type="submit">Mark all as read</button></form>}
      </div>
      {items.length === 0 ? (
        <div className="empty"><h3>You're all caught up</h3><p className="muted">Invitations and updates from your courses show up here.</p></div>
      ) : (
        <div className="panel" style={{ padding: 0, gap: 0 }}>
          {items.map((n) => (
            <div key={n.id} style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--line)", display: "flex", gap: "0.75rem", alignItems: "baseline", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: n.read ? 400 : 800 }}>{n.message}</p>
                <p className="small muted">{new Date(n.created_at + "Z").toLocaleString()}</p>
              </div>
              {n.link && <Link className="btn ghost sm" href={n.link}>Open</Link>}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
