import Link from "next/link";
import { getUser } from "@/lib/auth";
import { firstName } from "@/lib/format";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: "Teach with Albasrawie",
  description:
    "Rosters, attendance, coursework and grades for one teaching term — without the spreadsheets.",
  /* Unlisted on purpose, exactly like the teacher sign-up page: this is the link
     an administrator hands to teachers, not something a search engine should
     surface next to the student-facing site. */
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const stroke = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

const WEEK = [
  {
    title: "Roster",
    body: "Create the course, share its code, and the class appears on your roster. Enrollment can stay open or close the day the term starts.",
    icon: <svg {...stroke}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
  {
    title: "Attendance",
    body: "Open a session with a code and a window while you take the register. Close it and anyone unmarked is recorded absent — correctable later with a reason.",
    icon: <svg {...stroke}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></svg>,
  },
  {
    title: "Coursework",
    body: "Set assignments with a deadline and a mark ceiling, run projects through checkpoints, and put materials where students will find them.",
    icon: <svg {...stroke}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></svg>,
  },
  {
    title: "Grades",
    body: "Mark the work, keep it private until you are ready, then release it. The gradebook weights each component per course and shows you who is slipping.",
    icon: <svg {...stroke}><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>,
  },
];

const PLACES = [
  {
    title: "Courses",
    body: "Each course keeps its own roster, materials, announcements and grading weights — run as many as you teach.",
    meta: "one home per class",
    icon: <svg {...stroke}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>,
  },
  {
    title: "Students",
    body: "Open a learner to see their whole picture in your courses: activity, attendance rate, submissions and average.",
    meta: "support list, not a stack of files",
    icon: <svg {...stroke}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>,
  },
  {
    title: "Attendance",
    body: "Sessions, codes and records, with an export you can hand to the department when the term ends.",
    meta: "present · late · absent",
    icon: <svg {...stroke}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  },
  {
    title: "Analytics",
    body: "Submission trends, attendance rate and a list of students who may need a nudge before it becomes a problem.",
    meta: "across every course you run",
    icon: <svg {...stroke}><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>,
  },
  {
    title: "Announcements",
    body: "Say it once to the class instead of four times in a group chat, with a record of what was announced when.",
    meta: "one place students look",
    icon: <svg {...stroke}><path d="m3 11 18-8-4 18-5-5-5 5z" /></svg>,
  },
  {
    title: "Release control",
    body: "Grades and feedback stay yours until you publish them, so a corrected mark never reaches a student as a surprise.",
    meta: "mark now, release later",
    icon: <svg {...stroke}><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  },
];

const STEPS = [
  {
    step: "01",
    title: "Before class",
    body: "Create the course once. Name it, add the class or section, and the code it hands you is good for the whole term — no look-alike letters to spell out twice.",
  },
  {
    step: "02",
    title: "In the room",
    body: "Open an attendance session with its own code and window. Anyone who walks in after it closes is marked late, and the rest are absent when you shut it.",
  },
  {
    step: "03",
    title: "After the lesson",
    body: "Set the assignment with its deadline and marks, put the material where students will look for it, and say the announcement once instead of four times.",
  },
  {
    step: "04",
    title: "By the next week",
    body: "The roster, the register and the gradebook have filled themselves in from what you already did, and the analytics tell you who has quietly stopped handing work in.",
  },
];

export default async function Teach() {
  const account = await getUser();
  /* This page welcomes teachers. A student who lands here by accident is not
     treated as staff: they keep the teacher sign-up links, and the sign-up page
     itself is what tells them the link is not theirs. */
  const user = account && (account.role === "teacher" || account.role === "admin") ? account : null;

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Logo size={28} href="/teach" />
          <nav className="landing-menu" aria-label="Sections">
            <a href="#week">Each week</a>
            <a href="#places">Your workspace</a>
            <a href="#start">Getting started</a>
            <a href="#answers">Questions</a>
          </nav>
          <div className="landing-actions">
            <ThemeToggle />
            {user ? (
              <Link href="/dashboard" className="btn sm">Your dashboard</Link>
            ) : (
              <>
                <Link href="/login?as=teacher" className="btn ghost sm">Sign in</Link>
                <Link href="/register/teacher" className="btn sm">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="l-hero" id="top">
        <div className="l-hero-inner centered-hero">
          <div className="l-hero-copy centered-copy">
            <span className="section-kicker">{user && user.role === "teacher" ? `Welcome back, ${firstName(user.full_name)} · For teachers` : "For teachers"}</span>
            <h1 className="l-h1">
              Teach a whole term<br />without the spreadsheets.
            </h1>
            <p className="l-sub">
              Albasrawie keeps your roster, register, coursework and gradebook in one workspace, so the record you have to stand behind at the end of the term builds itself while you teach.
            </p>
            <div className="l-cta centered-cta">
              {user
                ? <>
                  <Link href="/dashboard" className="btn btn-primary-lg">Open your dashboard</Link>
                  <Link href="/courses" className="btn ghost btn-ghost-lg">Your courses</Link>
                </>
                : <>
                  <Link href="/register/teacher" className="btn btn-primary-lg">Create a teacher account</Link>
                  <Link href="/login?as=teacher" className="btn ghost btn-ghost-lg">Sign in</Link>
                </>}
            </div>
            <div className="l-trust centered-trust">
              <div className="trust-card">
                <b>Roster</b>
                <span>Codes, enrollment, classes</span>
              </div>
              <div className="trust-card">
                <b>Coursework</b>
                <span>Assignments, projects, materials</span>
              </div>
              <div className="trust-card">
                <b>Grades</b>
                <span>Marking, release, analytics</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="l-section" id="week">
        <div className="l-section-head">
          <span className="section-kicker">What you do each week</span>
          <h2>Four moves, and the term is documented</h2>
          <p>Nothing here asks you to learn a new workflow. It is the one you already run — register, set work, mark it, release grades — with the paperwork taken care of.</p>
        </div>
        <div className="l-features">
          {WEEK.map((f) => (
            <article className="l-feature" key={f.title}>
              <span className="l-ico">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="l-section" id="places">
        <div className="l-section-head">
          <span className="section-kicker">Your workspace</span>
          <h2>Each part of your teaching has its own home</h2>
          <p>No course notes buried in email, no attendance in a sheet on your laptop, no grade that a student saw before you meant them to.</p>
        </div>
        <div className="l-modules">
          {PLACES.map((m) => (
            <article className="l-module" key={m.title}>
              <span className="l-ico">{m.icon}</span>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
              <span className="module-meta">{m.meta}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="l-section" id="start">
        <div className="l-section-head">
          <span className="section-kicker">Your first week</span>
          <h2>Before class, in the room, after the lesson</h2>
          <p>Not a list of features — the week in the order it actually arrives.</p>
        </div>
        <div className="l-steps">
          {STEPS.map((t) => (
            <article className="l-step" key={t.step}>
              <div className="step-number">{t.step}</div>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </article>
          ))}
        </div>
        <div className="l-cta" style={{ marginTop: "1.6rem" }}>
          {user
            ? <Link href="/courses/new" className="btn btn-primary-lg">Create a course</Link>
            : <Link href="/register/teacher" className="btn btn-primary-lg">Create a teacher account</Link>}
        </div>
      </section>

      <section className="l-section" id="answers">
        <div className="l-section-head">
          <span className="section-kicker">Questions</span>
          <h2>Before you sign up</h2>
        </div>
        <div className="l-faq">
          <details className="faq-item">
            <summary>
              <span>Does my account open straight away?</span>
              <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <p>No. You first confirm your email with a 6-digit code we send you, then an administrator reviews your application before the account opens, so nobody else can create courses. You can sign in as soon as it is approved.</p>
          </details>
          <details className="faq-item">
            <summary>
              <span>How do students join my course?</span>
              <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <p>Every course gets its own enrollment code. Put it on the board or send it once, and students join from their own account and land on your roster.</p>
          </details>
          <details className="faq-item">
            <summary>
              <span>Can I run more than one class?</span>
              <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <p>Yes. Each course keeps its own roster, code, materials and gradebook, and your dashboard and analytics show all of them together.</p>
          </details>
          <details className="faq-item">
            <summary>
              <span>When do students see their marks?</span>
              <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <p>When you release them. Marking stays private to you until you publish a grade or a correction, so nothing reaches a student early.</p>
          </details>
        </div>
      </section>

      <section className="l-band">
        <div className="l-band-inner">
          <div>
            <h2>Start with one course.</h2>
            <p>Set it up before your next class and the rest of the term records itself.</p>
          </div>
          <div className="l-cta" style={{ marginTop: 0 }}>
            {user
              ? <>
                <Link href="/courses/new" className="btn btn-primary-lg">Create a course</Link>
                <Link href="/dashboard" className="btn ghost btn-ghost-lg">Open your dashboard</Link>
              </>
              : <>
                <Link href="/register/teacher" className="btn btn-primary-lg">Create a teacher account</Link>
                <Link href="/login?as=teacher" className="btn ghost btn-ghost-lg">Sign in to portal</Link>
              </>}
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-footer-inner">
          <div className="l-foot-grid">
            <div className="l-foot-brand">
              <Logo size={26} />
              <p className="footer-tagline">Rosters, attendance, coursework and grades for a whole teaching term.</p>
            </div>

            <nav className="l-foot-col" aria-label="Teaching">
              <h4>Teaching</h4>
              <ul>
                <li><a href="#week">What you do each week</a></li>
                <li><a href="#places">Your workspace</a></li>
                <li><a href="#start">Your first week</a></li>
              </ul>
            </nav>

            <nav className="l-foot-col" aria-label="Account">
              <h4>Account</h4>
              <ul>
                {user ? (
                  <>
                    <li><Link href="/dashboard">Your dashboard</Link></li>
                    <li><Link href="/courses">Your courses</Link></li>
                  </>
                ) : (
                  <>
                    <li><Link href="/login?as=teacher">Sign in</Link></li>
                    <li><Link href="/register/teacher">Create a teacher account</Link></li>
                  </>
                )}
              </ul>
            </nav>

            <nav className="l-foot-col" aria-label="Questions">
              <h4>Questions</h4>
              <ul>
                <li><a href="#answers">Before you sign up</a></li>
                <li><a href="#top">Back to the top</a></li>
              </ul>
            </nav>
          </div>

          <div className="l-foot-bottom">
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
