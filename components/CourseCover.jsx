import { hashStr } from "@/lib/hash";

/**
 * Deterministic generative cover art for courses.
 * Pure CSS/SVG — no external requests, unique per course name.
 */
export default function CourseCover({ name = "Course", category, className = "" }) {
  const h = hashStr(name || "?");
  const h1 = h % 360;
  const h2 = (h1 + 42 + (h % 50)) % 360;
  const h3 = (h1 + 200) % 360;
  const glyph = (name || "C")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <div
      className={`course-cover ${className}`}
      aria-hidden="true"
      style={{ background: `linear-gradient(125deg, hsl(${h1} 48% 52%) 0%, hsl(${h2} 52% 43%) 58%, hsl(${h3} 42% 36%) 100%)` }}
    >
      <svg className="decor" viewBox="0 0 320 118" preserveAspectRatio="none">
        <circle cx={40 + (h % 90)} cy={18 + (h % 30)} r={52} fill="rgba(255,255,255,0.10)" />
        <circle cx={250 - (h % 70)} cy={96 - (h % 26)} r={64} fill="rgba(0,0,0,0.10)" />
        <path
          d={`M0 ${70 + (h % 20)} C 90 ${30 + (h % 40)}, 210 ${110 - (h % 30)}, 320 ${50 + (h % 40)}`}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d={`M0 ${92} C 100 ${55 + (h % 30)}, 220 ${118 - (h % 20)}, 320 ${80 + (h % 30)}`}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.6"
          fill="none"
        />
      </svg>
      {category && <span className="course-cover-chip">{category}</span>}
      <span className="course-cover-glyph">{glyph}</span>
    </div>
  );
}
