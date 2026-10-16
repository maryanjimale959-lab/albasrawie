# Albasrawie

Learning progress and classroom management platform. Next.js 14 + MySQL/MariaDB, so it can run on a server for a whole school.

## Run it

Requires Node.js 18.18 or newer and a MySQL 5.7+/8 or MariaDB 10+ database.

```bash
npm install
cp .env.example .env.local       # fill in the MYSQL_* variables
npm run dev                      # http://localhost:3000
npm run seed                     # create the first administrator (ADMIN_EMAIL / ADMIN_PASSWORD)
npm run seed:demo                # optional: demo teacher + 6 students, 2 courses, months of activity
```

Tables are created on first connect — there is no separate migration step to remember. `.env.local` is read by `npm run dev` and by the `npm run` scripts above; running a script straight through Node needs `node --env-file=.env.local scripts/…`.

Coming from the old SQLite file, copy the real data across once:

```bash
npm run migrate:mysql            # reads data/albasrawie.db, prints a row-by-row count check
npm run migrate:mysql -- --dry-run
```

Uploads are files on disk, not rows, so they are not moved by that command — copy `data/uploads` to the server yourself.

Demo logins after `npm run seed:demo` (password `Demo1234!`):

- Teacher: `teacher@demo.albasrawie.app` — two courses with students, assignments, projects, attendance and analytics already populated
- Students: `student1@demo.albasrawie.app` … `student6@demo.albasrawie.app` — student1 has the fullest profile (streaks, portfolio, grades)

To create the first platform administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` and either run `npm run seed` or just boot the app — it creates the account on startup if it is missing.

## Put it on a server

1. Create a MySQL or MariaDB database and give the app one user with access to it only.
2. Set the variables from `.env.example` in the host's environment (`MYSQL_URL`, or `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE`). On Railway, add a MySQL plugin and paste its `MYSQL_URL` as a service variable — the app builds its own tables on boot.
3. `npm run build && npm start`, or keep `railway.json`, whose start command seeds the admin and then runs `next start -H 0.0.0.0 -p $PORT`.
4. `REQUIRE_TEACHER_VERIFICATION=true` makes new teacher accounts wait for an admin — a pending account is not signed in at sign-up and cannot log in until it is approved. Leave it off to let them start teaching immediately.
5. Attach a persistent disk and point `DATA_DIR` at it (e.g. `DATA_DIR=/data`), otherwise uploaded materials and submissions are lost when the container restarts.

The app writes every timestamp in UTC and pins each database session to `time_zone = '+00:00'`, so attendance windows and due dates behave the same no matter where the server sits.

## Administrator console

Signed in as an administrator, `/admin` is the home page (`/dashboard` sends administrators there). Four screens, all unlisted (`robots: noindex, nofollow`) and reachable only by the admin role:

- **Overview** — a welcome band naming the administrator and the day, then the approval queue with each applicant's biography, recently joined accounts and the newest log entries
- **Accounts** (`/admin/accounts`) — search by name, email, student ID or organization; filter by role and status; approve, suspend, restore and change roles
- **Courses** (`/admin/courses`) — every course with its teacher, student count, how much work it holds, and when it was last used
- **Activity log** (`/admin/audit`) — every decision, newest first, with who made it and the reason where one was given

Safety rails, enforced in the server actions rather than only in the UI (`app/admin/actions.js`):

- An administrator cannot act on their own account
- Suspending or demoting an account is refused unless another active administrator remains
- Suspending deletes that user's sessions, so an open tab stops working immediately
- A teacher is never turned back into a student — a student account needs a student ID and a class, which only that person can supply
- Only `active` accounts hold a working session, so a pending or suspended one cannot reach the app with an old cookie
- Every decision writes an in-app notification to the person affected and an `audit_logs` row

`/teach` is the teacher-facing landing page to share with staff. It is unlisted for the same reason `/register/teacher` is, and nothing on the student-facing site links to it. Its copy describes teaching only — no counts, limits, or where anything lives.

## Three doors, three roles

Each role has its own front door, and each door says out loud when the wrong account comes through it:

| Address | Welcomes | Signed in as someone else |
| --- | --- | --- |
| `/` | students — the public landing page | goes to that account's own home |
| `/teach` | teachers — the page you share with staff | keeps the teacher links; never pretends the visitor is staff |
| `/admin` | the administrator — welcome band over the console | `requireUser("admin")` sends them to their own dashboard |

- Signing in sends each role to its own home: `login()` resolves the destination with `homeFor(role)` from `lib/auth.js`, so an administrator arrives at `/admin` rather than stopping at `/dashboard` and being bounced. A `?next=` address still wins.
- `requireUser(role, { next })` keeps the address a signed-out visitor asked for, so opening `/admin` cold leads to `/login?next=%2Fadmin` — the form announces itself as the administrator sign-in and returns to the console afterwards.
- `/register` creates student accounts only, `/register/teacher` creates teacher accounts only, and `/register/teacher` is never linked from a public page.
- An account of the other role that opens one of those links is **refused on that page, in words** (`components/WrongRole.jsx`): what the link is for, who is currently signed in, that nothing was created or changed, then "Continue to my dashboard" and "Sign out and use another account". Nothing is silently redirected.
- `/login?as=teacher` is the teacher door. It verifies the password first and only then refuses a student account, so the answer is about the link, never about whether the credentials were right. Administrators pass any door. The shared `/login` still accepts every role, so nobody is locked out by a link.
- Denials of a record use the app's own `not-found` page (`app/not-found.jsx`), which does not distinguish "does not exist" from "not yours" — a teacher probing course ids learns nothing about anyone else's classes.

## Design system v2

Modern redesign on top of the same backend:

- **App shell** — fixed icon sidebar (desktop) + bottom tab bar (mobile), glass topbar with expanding search and animated notification badge
- **Motion** — scroll-triggered reveals, count-up stat cards, animated bar charts, progress shimmer, ambient gradient blobs, toasts, live attendance countdown, draw-on success check
- **Generative artwork** — every course gets a unique gradient cover derived from its name (zero external requests); remote images (auth preview) degrade to gradient fallbacks
- **Cinematic auth** — floating app preview, drifting orbs, staggered feature cards
- **Typography** — Sora (display) + Inter (body), light/dark themes, `prefers-reduced-motion` respected

Visual QA: `node scripts/qa-shots.mjs` (needs the dev server running and Chrome installed) writes screenshots to `qa/`.

## What works

- Student and teacher registration, login, logout, server-side sessions (hashed tokens, httpOnly cookies), password change with other-device sign-out
- Course creation with securely generated unique codes, share code / link / invitation text, regenerate or disable codes, open or close enrollment, archive, remove students, in-app invitations
- Join with a code or link with a confirmation step showing course and teacher
- Student dashboard: greeting, stat cards, GitHub/LeetCode-style green contribution heatmap, current and longest streaks (time-zone aware, logins never count), recent activity feed, upcoming work with due-date warnings, weekly activity chart
- Learning activity engine: every submission, milestone, quiz, study log or external project writes one deduplicated activity record with a verification level (verified / teacher-confirmed / self-reported); students can log offline study and it is always labelled
- Student profile: LeetCode-style page with header stats, heatmap, achievement statistics, portfolio of completed course projects plus personal projects (clearly separated and self-reported), privacy toggle for portfolio visibility
- Teachers open any enrolled student's full learning profile from rosters, lists and search; unrelated students stay private
- Course dashboards with tabs: Overview, Assignments, Projects, Materials, Attendance, Grades, Announcements, Members
- Assignments: publish, submit (text / link / file), late detection, grading with feedback, request revision, release grades, reopen
- Projects: milestones with progress tracking, submissions with demo and repository links, review flow (under review → revision → completed), portfolio integration
- Grades: weighted per-course category settings, released-grade summaries per student and per roster
- Attendance: timed sessions with 6-character codes and QR links, manual marking, present/late/absent/excused, close-time absent fill, audited corrections with required reason, CSV export, student attendance dashboard
- Materials: file, link or note, organized by module, published or hidden, access-controlled downloads
- Announcements and in-app notifications with unread counts
- Teacher analytics: submission rates, average grades, attendance, 12-week class activity, most active students, students who may need support
- Search across everything the signed-in user is allowed to see, light and dark themes, responsive layout, audit log

