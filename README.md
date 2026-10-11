# Albasrawie

Learning progress and classroom management platform. Next.js 14 + SQLite, runs locally with no external accounts.

## Run it

Requires Node.js 18.18 or newer.

```bash
npm install
npm run dev                  # http://localhost:3000
npm run seed:demo            # optional: demo teacher + 6 students, 2 courses, months of activity
```

The database is created automatically at `data/albasrawie.db`.

Demo logins after `npm run seed:demo` (password `Demo1234!`):

- Teacher: `teacher@demo.albasrawie.app` — two courses with students, assignments, projects, attendance and analytics already populated
- Students: `student1@demo.albasrawie.app` … `student6@demo.albasrawie.app` — student1 has the fullest profile (streaks, portfolio, grades)

To create the first platform administrator, start the app once, then run:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=choose-a-strong-one npm run seed
```

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

## Not configured

- Email delivery (verification, password reset, external invitations): no email service is configured, and the UI says so instead of pretending
- Quizzes: the activity system supports quiz records, but a quiz builder is not part of this version
- Admin console beyond account creation: roles are managed through the database
