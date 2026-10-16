"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ---------- Icons (lucide-style strokes) ---------- */
const P = {
  grid: <><rect width="7" height="7" x="3" y="3" rx="1.5" /><rect width="7" height="7" x="14" y="3" rx="1.5" /><rect width="7" height="7" x="14" y="14" rx="1.5" /><rect width="7" height="7" x="3" y="14" rx="1.5" /></>,
  book: <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  clipboard: <><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></>,
  layers: <><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="m9 16 2 2 4-4" /></>,
  cap: <><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>,
  pulse: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  chart: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export function useActiveNav(links) {
  const pathname = usePathname();
  /* The deepest matching link is the only one lit up: /admin/accounts should
     highlight Accounts, not leave Console glowing as well. */
  const activeHref = links
    .map(([href]) => href)
    .filter((href) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href)))
    .sort((a, b) => b.length - a.length)[0];
  return links.map(([href, label, icon]) => ({
    href,
    label,
    icon,
    active: href === activeHref,
  }));
}

export function SideNav({ links }) {
  const items = useActiveNav(links);
  return (
    <nav className="side-nav" aria-label="Main">
      <div className="nav-group-label">Menu</div>
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`nav-item ${it.active ? "active" : ""}`}>
          {it.active && <span className="nav-indicator" aria-hidden="true" />}
          <Icon name={it.icon} />
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileTabs({ links }) {
  const items = useActiveNav(links.slice(0, 5));
  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar-inner">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={`tab-item ${it.active ? "active" : ""}`}>
            <Icon name={it.icon} size={20} />
            {it.label.split(" ")[0]}
          </Link>
        ))}
      </div>
    </nav>
  );
}
