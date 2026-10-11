import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: "Albasrawie — Academic Learning Platform",
  description:
    "Courses, assignments, attendance and progress tracking for teachers and students in one calm, high-integrity workspace.",
};

const FEATURES = [
  {
    title: "Course Provisioning & Enrollment",
    body: "Create academic cohorts, share secure unique enrollment codes or cryptographic QR links, and onboard students instantaneously.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    ),
  },
  {
    title: "Milestone-Driven Assignments",
    body: "Multi-stage project tracking, verifiable deadlines, repository submissions, and structured teacher feedback in a unified view.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="8" height="4" x="8" y="2" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
      </svg>
    ),
  },
  {
    title: "Cryptographic Attendance Engine",
    body: "Time-bounded attendance sessions with 6-character access codes, rotating QR validation, and audited corrections logged to SQLite WAL.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Verifiable Progress & Heatmaps",
    body: "Activity logs with proof levels (verified, confirmed, or self-reported) integrated with contribution heatmaps and class-wide analytics.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
  },
];

export default function Home() {
  if (getUser()) redirect("/dashboard");

  let stats = { courses: 0, students: 0, activities: 0 };
  try {
    stats =
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM courses) AS courses,
             (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
             (SELECT COUNT(*) FROM learning_activities) AS activities`
        )
        .get() || stats;
  } catch {
    /* fallback */
  }

  return (
    <div className="landing">
      {/* Top Header / Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Logo size={28} href="/" />
          <nav className="landing-menu" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#roles">Academic Roles</a>
            <a href="#workflow">Workflow</a>
          </nav>
          <div className="landing-actions">
            <ThemeToggle />
            <Link href="/login" className="btn ghost sm">
              Sign in
            </Link>
            <Link href="/register" className="btn sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="l-hero">
        <div className="l-hero-inner centered-hero">
          <div className="l-hero-copy centered-copy">
            <h1 className="l-h1">
              Run your classroom.<br />Verify every learner&apos;s progress.
            </h1>
            <p className="l-sub">
              Albasrawie unites courses, assignments, cryptographic attendance, and verifiable progress into one focused workspace. Zero cloud lock-in, engineered for speed and local sovereignty.
            </p>
            <div className="l-cta centered-cta">
              <Link href="/register" className="btn btn-primary-lg">
                Create an account
              </Link>
              <Link href="/login" className="btn ghost btn-ghost-lg">
                Sign in to portal
              </Link>
            </div>
            <div className="l-trust centered-trust">
              <div className="trust-card">
                <b>{stats.courses.toLocaleString()}</b>
                <span>Active courses</span>
              </div>
              <div className="trust-card">
                <b>{stats.students.toLocaleString()}</b>
                <span>Enrolled learners</span>
              </div>
              <div className="trust-card">
                <b>{stats.activities.toLocaleString()}</b>
                <span>Verified milestones</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Capabilities Grid */}
      <section className="l-section" id="features">
        <div className="l-section-head">
          <span className="section-kicker">Capabilities</span>
          <h2>Engineered for academic precision</h2>
          <p>
            Eliminate fragmented spreadsheets and dispersed chats. Each course maintains its own immutable audit history, grading rubrics, and privacy controls.
          </p>
        </div>
        <div className="l-features">
          {FEATURES.map((f) => (
            <article className="l-feature" key={f.title}>
              <span className="l-ico">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Roles Section */}
      <section className="l-section" id="roles">
        <div className="l-section-head">
          <span className="section-kicker">Role Architecture</span>
          <h2>Tailored for both sides of the classroom</h2>
          <p>
            Teachers maintain comprehensive governance and insight. Students achieve clarity, momentum, and verifiable portfolios.
          </p>
        </div>
        <div className="l-roles">
          <article className="l-role">
            <div className="role-header">
              <span className="role-pill">Faculty &amp; Instructors</span>
              <h3>For Teachers</h3>
            </div>
            <p>Deploy courses in seconds with complete curriculum and roster control.</p>
            <ul>
              <li>Generate secure course codes and cryptographic attendance QR codes</li>
              <li>Define assignments with custom rubrics and milestone checkpoints</li>
              <li>Automated late detection, grade release governance, and audited marks</li>
              <li>12-week activity analytics, submission trends, and student support alerts</li>
            </ul>
          </article>
          <article className="l-role alt">
            <div className="role-header">
              <span className="role-pill">Learners &amp; Researchers</span>
              <h3>For Students</h3>
            </div>
            <p>Real-time clarity on submissions, attendance records, and verified achievements.</p>
            <ul>
              <li>Instant enrollment via course tokens and one-tap confirmation</li>
              <li>Unified work agenda with real-time countdown alerts for upcoming deadlines</li>
              <li>Cryptographic session attendance verification directly from mobile or laptop</li>
              <li>Public or private portfolio showcasing course projects and external work</li>
            </ul>
          </article>
        </div>
      </section>

      {/* Steps Section */}
      <section className="l-section" id="workflow">
        <div className="l-section-head">
          <span className="section-kicker">Onboarding</span>
          <h2>Operational in three minutes</h2>
        </div>
        <div className="l-steps">
          <article className="l-step">
            <div className="step-number">01</div>
            <h3>Create your profile</h3>
            <p>Select teacher or student designation and register in seconds with server-side session authentication.</p>
          </article>
          <article className="l-step">
            <div className="step-number">02</div>
            <h3>Connect via course code</h3>
            <p>Teachers create course instances and distribute a 6-character access token. Students join with zero friction.</p>
          </article>
          <article className="l-step">
            <div className="step-number">03</div>
            <h3>Track verified growth</h3>
            <p>Submit work, complete milestone reviews, log attendance sessions, and observe verified progress compound.</p>
          </article>
        </div>
      </section>

      {/* Call to Action Banner */}
      <section className="l-band">
        <div className="l-band-inner">
          <div>
            <h2>Ready to streamline your academic workflow?</h2>
            <p>Create an account or sign in to access your active courses and learning records.</p>
          </div>
          <div className="l-cta" style={{ marginTop: 0 }}>
            <Link href="/register" className="btn btn-primary-lg">
              Create an account
            </Link>
            <Link href="/login" className="btn ghost btn-ghost-lg">
              Sign in to portal
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="l-footer">
        <div className="l-footer-inner">
          <Logo size={24} />
          <p className="footer-tagline">Academic progress, attendance verification, and classroom management.</p>
          <p className="footer-copy">SQLite WAL Engine · Local Data Sovereignty · Zero Cloud Dependencies</p>
        </div>
      </footer>
    </div>
  );
}
