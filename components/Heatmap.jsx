const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * GitHub/LeetCode-style contribution heatmap, server-rendered.
 * `cells`: [{ date: "YYYY-MM-DD", count, level }], `dayLink(date)` returns an href or null.
 */
export default function Heatmap({ cells = [], dayLink, weeks = 53 }) {
  const byDate = new Map(cells.map((c) => [c.date, c]));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const end = new Date(today);
  // pad so the last column ends on Sunday
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks - 1) * 7 - start.getDay());

  const cols = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const future = day > today;
      const cell = byDate.get(iso);
      const month = day.getDay() === 0 ? day.getMonth() : -1;
      if (month >= 0 && month !== lastMonth) lastMonth = month;
      col.push({ iso, cell, future, monthLabel: month >= 0 && month !== -1 ? MONTHS[month] : null, inYear: day.getFullYear() === today.getFullYear() || day > new Date(today.getFullYear() - 1, 11, 31) });
    }
    cols.push(col);
  }
  // month labels: keep only first occurrence per month
  const seen = new Set();
  for (const col of cols) for (const c of col) {
    if (c.monthLabel && seen.has(c.monthLabel)) c.monthLabel = null;
    if (c.monthLabel) seen.add(c.monthLabel);
  }

  return (
    <div className="heatmap" role="img" aria-label="Learning activity over the last year">
      <div className="hm-grid">
        {cols.map((col, i) => (
          <div className="hm-col" key={i}>
            <div className="hm-month">{col[0].monthLabel || ""}</div>
            {col.map((c) => {
              const lv = c.future ? -1 : (c.cell?.level ?? 0);
              const title = c.cell ? `${c.cell.count} activity item${c.cell.count === 1 ? "" : "s"} on ${c.iso}` : c.iso;
              const inner = <span className={`hm-cell lv${lv}`} title={title} />;
              return c.cell && dayLink ? <a key={c.iso} href={dayLink(c.iso)} className="hm-link">{inner}</a> : <span key={c.iso}>{inner}</span>;
            })}
          </div>
        ))}
      </div>
      <div className="hm-legend">
        <span className="muted small">Less</span>
        <span className="hm-cell lv0" /><span className="hm-cell lv1" /><span className="hm-cell lv2" /><span className="hm-cell lv3" /><span className="hm-cell lv4" />
        <span className="muted small">More</span>
      </div>
    </div>
  );
}
