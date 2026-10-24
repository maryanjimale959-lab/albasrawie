import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import BuiltBy from "@/components/BuiltBy";

export const metadata = {
  title: "Albasrawie — Academic Learning Platform",
  description:
    "Courses, assignments, attendance and progress tracking for teachers and students in one calm, high-integrity workspace.",
};

/* This page is the student's door. It describes what a learner can do once they
   are in, in the second person, and keeps the teaching side off it entirely:
   the teacher pages are shared directly with staff, so nothing here links to
   them. It quotes no counts, no limits and no details about where or how
   anything is stored: infrastructure is not a selling point to advertise here
   and numbers would go stale. */

const stroke = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

const FEATURES = [
  {
    title: "Join with a course code",
    body: "Type the code your teacher reads out, or scan the course QR, and you are on the roster in one tap. No forms to chase and no waiting for someone to add you.",
    icon: <svg {...stroke}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>,
  },
  {
    title: "Milestones, not one big deadline",
    body: "Projects run on their own or in a group with checkpoints, a rubric and a due date, and you log progress against each one as you go.",
    icon: <svg {...stroke}><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" /></svg>,
  },
  {
    title: "Attendance you don't have to chase",
    body: "Mark yourself in with the code on the teacher's screen while you are in the room. Every session stays in one record you can read back later.",
    icon: <svg {...stroke}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></svg>,
  },
  {
    title: "Progress you can actually see",
    body: "Each entry carries a proof level — verified work or something you logged yourself — and it feeds your heatmap, your streak and your portfolio.",
    icon: <svg {...stroke}><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>,
  },
];

const MODULES = [
  {
    title: "Courses",
    body: "Every course you are in, with its own roster, materials and announcements, so a note never lands in the wrong group.",
    meta: "one home per class",
    icon: <svg {...stroke}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>,
  },
  {
    title: "Attendance",
    body: "The sessions you were marked present, late or absent for — your record, not something you have to ask about at the end of term.",
    meta: "present · late · absent",
    icon: <svg {...stroke}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></svg>,
  },
  {
    title: "Assignments",
    body: "The brief, the deadline and the marks on offer. You hand in as text, a link or a file, and you know it arrived.",
    meta: "due date · rubric · feedback",
    icon: <svg {...stroke}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></svg>,
  },
  {
    title: "Grades",
    body: "Marks appear when your teacher releases them, with the comments that go with them and the weighting they were worked out from.",
    meta: "released when your teacher says so",
    icon: <svg {...stroke}><path d="M12 2l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.2 1.3-6.6L2.5 9l6.6-.8z" /></svg>,
  },
  {
    title: "Projects & portfolio",
    body: "Course projects and your own work outside class, each with checkpoints, a repository or a live demo you can show people.",
    meta: "checkpoints · public or private",
    icon: <svg {...stroke}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>,
  },
  {
    title: "Your activity",
    body: "A heatmap of the days you did something, how long your current streak is and what you have left to hand in.",
    meta: "streaks · heatmap · agenda",
    icon: <svg {...stroke}><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>,
  },
];

const TIMELINE = [
  {
    step: "01",
    title: "Join the course",
    body: "Your teacher gives you a code or a QR. Type it once and the course lands on your dashboard with its roster, its materials and its announcements.",
  },
  {
    step: "02",
    title: "See what is due",
    body: "Assignments and projects arrive with a deadline and the marks on offer, listed together across every course you are in rather than one class at a time.",
  },
  {
    step: "03",
    title: "Mark yourself in",
    body: "While the session is open, the code on the teacher's screen records you present. Arrive after the window and it records late, so the record matches what happened.",
  },
  {
    step: "04",
    title: "Hand it in",
    body: "Text, a link or a file. Late work is still accepted and flagged on its own, and your teacher can send it back for a revision instead of marking it twice.",
  },
  {
    step: "05",
    title: "Watch it add up",
    body: "Grades appear when they are released, the heatmap fills in on the days you did something, and your portfolio becomes the record you can point at.",
  },
];

const FACTS = [
  {
    title: "A roster, not a chat thread",
    body: "Everyone in your course is listed and every material stays with that course, so nothing important is posted somewhere you will not look for it.",
  },
  {
    title: "Deadlines that hold",
    body: "Each piece of work carries a due date and a mark before you start. Late is decided by the clock rather than by an argument afterwards.",
  },
  {
    title: "Feedback before the mark",
    body: "Work can be returned for a revision and handed in again, so comments reach you while there is still time to act on them.",
  },
  {
    title: "A record you can show",
    body: "Attendance, submissions and released grades stay in one place, and your portfolio is built from the work you already handed in.",
  },
];

const SPECS = [
  ["Courses", "Join with a code or a QR scan"],
  ["Attendance", "Present, late or absent per session"],
  ["Assignments", "Text, link or file, with a due date"],
  ["Projects", "Checkpoints, solo or in a group"],
  ["Feedback", "Comments and revision requests"],
  ["Portfolio", "Course projects plus your own work"],
];

const FAQS = [
  {
    q: "How do I join a course?",
    a: "With the code your teacher gives you, either while you create your account or from inside the app later. Scanning the course QR code does the same thing in one tap.",
  },
  {
    q: "What happens if I miss the attendance window?",
    a: "Your record shows absent once the session closes. Only your teacher can correct it, and they are asked for a written reason whenever they do.",
  },
  {
    q: "Can a closed session be reopened?",
    a: "Your teacher can reopen one. It starts a fresh window and keeps every mark already collected, so nobody has to attend twice.",
  },
  {
    q: "Can I still hand work in after the deadline?",
    a: "Yes. Late submissions are accepted and flagged automatically. If your teacher asks for a revision instead, the submission moves into a revision state and you hand it in again.",
  },
  {
    q: "When do I see my grade?",
    a: "When your teacher releases it. Marks and comments stay with them until then, so a corrected grade never reaches you as a surprise.",
  },
  {
    q: "How is my final grade worked out?",
    a: "Each course has a gradebook of weighted components — assignments, projects and quizzes. Only the components that actually have graded work are counted, each scored as a percentage of the marks available.",
  },
  {
    q: "Can one account cover several courses?",
    a: "Yes. Join as many courses as you take, and your dashboard shows every deadline, attendance record and grade together instead of one class at a time.",
  },
];

export default async function Home() {
  if (await getUser()) redirect("/dashboard");

  return (
    <div className="landing">
      {/* Top Header / Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Logo size={28} href="/" />
          <nav className="landing-menu" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#modules">Inside</a>
            <a href="#timeline">How a term runs</a>
            <a href="#academics">Coursework</a>
            <a href="#faq">FAQ</a>
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
      <section className="l-hero" id="top">
        <div className="l-hero-inner centered-hero">
          <div className="l-hero-copy centered-copy">
            <h1 className="l-h1">
              Every course, every deadline.<br />One place to keep them.
            </h1>
            <p className="l-sub">
              Albasrawie is where your teachers post courses, assignments and attendance. Join with a code, hand your work in, and watch your own progress add up — without asking anyone for a copy.
            </p>
            <div className="l-cta centered-cta">
              <Link href="/register" className="btn btn-primary-lg">
                Create a student account
              </Link>
              <Link href="/login" className="btn ghost btn-ghost-lg">
                Sign in to portal
              </Link>
            </div>
            <div className="l-trust centered-trust">
              <div className="trust-card">
                <b>Your courses</b>
                <span>Codes, rosters, materials</span>
              </div>
              <div className="trust-card">
                <b>Your work</b>
                <span>Assignments, projects, quizzes</span>
              </div>
              <div className="trust-card">
                <b>Your progress</b>
                <span>Attendance, feedback, portfolio</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Capabilities Grid */}
      <section className="l-section" id="features">
        <div className="l-section-head">
          <span className="section-kicker">What you get</span>
          <h2>Built for the student side of the room</h2>
          <p>
            No scrolling a group chat for the deadline and no wondering whether your work arrived. Each course keeps its own materials, its own record and its own grades, and you see all of them together.
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

      {/* Module inventory */}
      <section className="l-section" id="modules">
        <div className="l-section-head">
          <span className="section-kicker">Inside the workspace</span>
          <h2>Six places your term happens</h2>
          <p>
            Nothing is a screenshot in a chat and nothing is a spreadsheet someone else keeps. Every part of the year has its own home, and yours is the copy you can always open.
          </p>
        </div>
        <div className="l-modules">
          {MODULES.map((m) => (
            <article className="l-module" key={m.title}>
              <span className="l-ico">{m.icon}</span>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
              <span className="module-meta">{m.meta}</span>
            </article>
          ))}
        </div>
      </section>

      {/* Term timeline */}
      <section className="l-section" id="timeline">
        <div className="l-section-head">
          <span className="section-kicker">Your week</span>
          <h2>From a course code to a released grade</h2>
          <p>The same five moves, whether it is week one or the last week before exams.</p>
        </div>
        <ol className="l-timeline">
          {TIMELINE.map((t) => (
            <li className="l-tl-step" key={t.step}>
              <span className="tl-step-num">{t.step}</span>
              <div className="tl-step-body">
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </div>
            </li>
          ))}
        </ol>
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
            <p>Enter your name, your student ID and your class, then choose a password. The account is yours across every course you join.</p>
          </article>
          <article className="l-step">
            <div className="step-number">02</div>
            <h3>Connect via course code</h3>
            <p>Your teacher hands out one access code per course, made so it cannot be misread across a room. Type it or scan the QR and you are in.</p>
          </article>
          <article className="l-step">
            <div className="step-number">03</div>
            <h3>Track verified growth</h3>
            <p>Submit work, complete project checkpoints, log attendance sessions, and watch the heatmap fill in.</p>
          </article>
        </div>
      </section>

      {/* Coursework / gradebook */}
      <section className="l-section" id="academics">
        <div className="l-hosting">
          <div className="l-host-copy">
            <span className="section-kicker">Coursework</span>
            <h2>Built around how a course is actually run</h2>
            <p>
              A school year is a set of courses, a stack of deadlines, the work you handed in and the marks that came back. Albasrawie keeps those four things together, so you are never rebuilding the term from screenshots in a group chat.
            </p>
            <div className="l-facts">
              {FACTS.map((f) => (
                <article className="l-fact" key={f.title}>
                  <span className="fact-mark" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <aside className="l-spec" aria-label="What a course grade is made of">
            <h3 className="spec-title">The gradebook</h3>
            <dl className="spec-list">
              {SPECS.map(([k, v]) => (
                <div className="spec-row" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="spec-note">
              Weights are set per course, and only the components with graded work are counted.
            </p>
          </aside>
        </div>
      </section>

      {/* FAQ */}
      <section className="l-section" id="faq">
        <div className="l-section-head">
          <span className="section-kicker">Questions</span>
          <h2>What people ask before the first class</h2>
        </div>
        <div className="l-faq">
          {FAQS.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>
                <span>{item.q}</span>
                <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Call to Action Banner */}
      <section className="l-band">
        <div className="l-band-inner">
          <div>
            <h2>Ready to streamline your academic workflow?</h2>
            <p>Create a student account or sign in to access your active courses and learning records.</p>
          </div>
          <div className="l-cta" style={{ marginTop: 0 }}>
            <Link href="/register" className="btn btn-primary-lg">
              Create a student account
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
          <div className="l-foot-grid">
            <div className="l-foot-brand">
              <Logo size={26} />
              <p className="footer-tagline">Your courses, your attendance and your grades — in one account you can open any time.</p>
            </div>

            <nav className="l-foot-col" aria-label="The platform">
              <h4>Platform</h4>
              <ul>
                <li><a href="#features">Capabilities</a></li>
                <li><a href="#modules">Inside the workspace</a></li>
                <li><a href="#timeline">How a week runs</a></li>
                <li><a href="#timeline">How a term runs</a></li>
              </ul>
            </nav>

            <nav className="l-foot-col" aria-label="Account">
              <h4>Account</h4>
              <ul>
                <li><Link href="/login">Sign in</Link></li>
                <li><Link href="/register">Create a student account</Link></li>
              </ul>
            </nav>

            <nav className="l-foot-col" aria-label="Questions">
              <h4>Questions</h4>
              <ul>
                <li><a href="#academics">Coursework and grades</a></li>
                <li><a href="#faq">Common questions</a></li>
                <li><a href="#workflow">Getting started</a></li>
              </ul>
            </nav>
          </div>

          <div className="l-foot-bottom">
            <BuiltBy />
            <div className="l-foot-actions">
              <ThemeToggle />
              <a href="#top" className="foot-top">Back to top</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
