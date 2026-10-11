export const initials = (name = "?") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso + (iso.includes("T") ? "" : "Z"));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.includes("T") ? "" : "Z"));
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "in 3 days" / "2 days ago" style label for deadlines. */
export function dueLabel(iso) {
  if (!iso) return { text: "No due date", tone: "muted" };
  const d = new Date(iso + (iso.includes("T") ? "" : "Z"));
  const days = Math.ceil((d - Date.now()) / 864e5);
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, tone: "danger" };
  if (days === 0) return { text: "Due today", tone: "danger" };
  if (days === 1) return { text: "Due tomorrow", tone: "warn" };
  if (days <= 3) return { text: `Due in ${days} days`, tone: "warn" };
  return { text: `Due ${fmtDate(iso)}`, tone: "muted" };
}

export const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
