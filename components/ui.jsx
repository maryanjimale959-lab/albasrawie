import { CountUp } from "./motion";

/* ---------- Icons for stat cards ---------- */
const ICONS = {
  book: <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>,
  check: <><polyline points="20 6 9 17 4 12" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  folder: <><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></>,
  flame: <><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></>,
  cap: <><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  gauge: <><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></>,
  eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
};

export function StatIcon({ name, size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || ICONS.zap}
    </svg>
  );
}

export function StatCard({ label, value, hint, tone = "", icon, delay = 0 }) {
  return (
    <div className="stat-card lift" style={{ animationDelay: `${delay}ms` }}>
      {icon && (
        <span className="stat-icon" aria-hidden="true">
          <StatIcon name={icon} />
        </span>
      )}
      <div className={`stat-value ${tone}`}>
        <CountUp value={value} />
      </div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Pill({ tone = "neutral", children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Progress({ value, max = 100, label }) {
  const p = Math.max(0, Math.min(100, Math.round((value / (max || 1)) * 100)));
  return (
    <div className="progress-wrap">
      <div className="progress-track" role="progressbar" aria-valuenow={p} aria-valuemin="0" aria-valuemax="100">
        <div className="progress-fill" style={{ width: `${p}%` }} />
      </div>
      {label !== undefined && <span className="progress-label">{label ?? `${p}%`}</span>}
    </div>
  );
}

function hueFromName(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function Avatar({ name, size = 36, img, ring = false }) {
  const ini = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const hue = hueFromName(name);
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.38,
    background: img ? undefined : `linear-gradient(135deg, hsl(${hue} 45% 52%), hsl(${(hue + 40) % 360} 50% 42%))`,
  };
  const inner = img ? (
    <img className="avatar" style={style} src={img} alt={name} />
  ) : (
    <span className="avatar avatar-ini" style={style} aria-hidden="true">{ini}</span>
  );
  if (!ring) return inner;
  return <span className="avatar-ring" style={{ width: size + 4, height: size + 4 }}>{inner}</span>;
}

/** Simple SVG bar chart for weekly activity. data: [{ label, count }] */
export function Bars({ data = [], height = 120, unit = "" }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="bars" role="img" aria-label="Weekly activity chart" style={{ height }}>
      {data.map((d, i) => (
        <div className="bar-col" key={i} title={`${d.label}: ${d.count} ${unit}`}>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ height: `${Math.max(2, Math.round((d.count / max) * 100))}%`, animationDelay: `${i * 45}ms` }}
            />
          </div>
          <span className="bar-label">{d.short || ""}</span>
        </div>
      ))}
    </div>
  );
}

/** Empty-state box */
export function Empty({ title, text, children, icon }) {
  return (
    <div className="empty pop-in">
      {icon && <span className="empty-icon"><StatIcon name={icon} size={24} /></span>}
      <h3>{title}</h3>
      {text && <p className="muted small">{text}</p>}
      {children}
    </div>
  );
}
