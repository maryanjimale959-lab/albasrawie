import Link from "next/link";

/** Server-rendered tab bar. tabs: [{ href, label, badge }]; active = exact current pathname. */
export default function Tabs({ tabs, active }) {
  return (
    <nav className="tabs" aria-label="Course sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? "active" : ""}>
          {t.label}
          {t.badge > 0 && <span className="tab-badge">{t.badge > 99 ? "99+" : t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
