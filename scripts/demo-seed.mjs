// Demo data so the app opens alive. Usage: npm run seed:demo  (start the app once first so tables exist)
// Creates logins with password "Demo1234!": teacher@demo.albasrawie.app + student1..6@demo.albasrawie.app
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";

fs.mkdirSync("data", { recursive: true });
const db = new Database("data/albasrawie.db");
db.pragma("foreign_keys = ON");
try { db.prepare("SELECT 1 FROM users LIMIT 1").get(); } catch {
  console.error("Tables not found — start the app once (npm run dev), then run npm run seed:demo again.");
  process.exit(1);
}
if (db.prepare("SELECT 1 FROM users WHERE email = ?").get("teacher@demo.albasrawie.app")) {
  console.log("Demo data already seeded."); process.exit(0);
}

const PW = bcrypt.hashSync("Demo1234!", 12);
const backdate = (id, days) => db.prepare("UPDATE users SET created_at = ? WHERE id = ?").run(dt(daysAgo(days)), id);
const iso = (d) => d.toISOString().slice(0, 10);
const dt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const daysAgo = (n, h = 12) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(h, 0, 0, 0); return d; };
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const uid = (sql, ...a) => Number(db.prepare(sql).run(...a).lastInsertRowid);
const teacher = uid(`INSERT INTO users (full_name, email, password_hash, role, status) VALUES ('Ms. Amina Yusuf','teacher@demo.albasrawie.app',?,'teacher','active')`, PW);
db.prepare("INSERT INTO teacher_profiles (user_id, bio, organization, department) VALUES (?,?,?,?)")
  .run(teacher, "Software engineer turned teacher. I believe consistent small work beats last-minute panic.", "Demo Academy", "Computer Science");

const names = ["Hodan Ali", "Abdi Nur", "Sagal Hassan", "Mustaqsim Omar", "Layla Farah", "Khaamo Dirir"];
const students = names.map((n, i) => {
  const id = uid("INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?,?,?,'student','active')", n, `student${i + 1}@demo.albasrawie.app`, PW);
  uid(`INSERT INTO student_profiles (user_id, student_id, class_name, organization, bio) VALUES (?,?,?,?,?)`,
    id, `DM-${1000 + i}`, i < 3 ? "Group A" : "Group B", "Demo Academy", i === 0 ? "Learning Python and building a farm-management app for my family." : null);
  backdate(id, 165 - i * 3);
  return id;
});
backdate(teacher, 170);

const mkCourse = (name, code, desc, cat, lvl) => {
  const id = uid(`INSERT INTO courses (teacher_id, name, description, category, level, visibility) VALUES (?,?,?,?,?,'private')`, teacher, name, desc, cat, lvl);
  db.prepare("INSERT INTO course_codes (code, course_id) VALUES (?,?)").run(code, id);
  db.prepare("UPDATE courses SET course_code = ? WHERE id = ?").run(code, id);
  db.prepare("INSERT INTO course_settings (course_id) VALUES (?)").run(id);
  return id;
};
const py = mkCourse("Python Programming", "PY-DEMO1", "From zero to real programs: variables, logic, data structures and small projects you'll actually want to build.", "Programming", "Beginner");
const wd = mkCourse("Web Development", "WD-DEMO2", "HTML, CSS and JavaScript by building pages people can visit.", "Programming", "Beginner");
students.forEach((s, i) => {
  uid("INSERT INTO enrollments (student_id, course_id, enrolled_at) VALUES (?,?,?)", s, py, dt(daysAgo(160 - i)));
  if (i % 2 === 0 || i === 3) uid("INSERT INTO enrollments (student_id, course_id, enrolled_at) VALUES (?,?,?)", s, wd, dt(daysAgo(120 - i)));
});

const mkAssignment = (course, title, due, max) => uid(
  `INSERT INTO assignments (course_id, title, description, instructions, due_at, max_marks, published, created_at) VALUES (?,?,?,?,?,?,1,?)`,
  course, title, `Practice work: ${title.toLowerCase()}.`, "Read the material, write your solution, submit before the deadline.", dt(due), max, dt(daysAgo(170)));
const a1 = mkAssignment(py, "Assignment 1: Variables & input", daysAgo(150), 20);
const a2 = mkAssignment(py, "Assignment 2: Loops & lists", daysAgo(120), 25);
const a3 = mkAssignment(py, "Assignment 3: Functions", daysAgo(60), 30);
const a4 = mkAssignment(py, "Assignment 4: Mini project — expense tracker", daysAgo(10), 40);
const w1 = mkAssignment(wd, "Assignment 1: Page structure", daysAgo(100), 20);
const w2 = mkAssignment(wd, "Assignment 2: Flexbox layouts", daysAgo(45), 25);

const act = (s, course, type, related, date, desc, ver = "verified") =>
  db.prepare(`INSERT OR IGNORE INTO learning_activities (student_id, course_id, type, related_id, activity_date, verification, description) VALUES (?,?,?,?,?,?,?)`)
    .run(s, course, type, related, iso(date), ver, desc);

const feedbacks = ["Clean solution — watch your variable names.", "Great improvement since last time.", "Solid logic. Add comments next time.", "Nearly perfect. Check edge case with empty input."];
for (const [aid, course, max] of [[a1, py, 20], [a2, py, 25], [a3, py, 30], [w1, wd, 20], [w2, wd, 25]]) {
  const due = new Date(db.prepare("SELECT due_at FROM assignments WHERE id=?").get(aid).due_at.replace(" ", "T") + "Z");
  students.forEach((s, i) => {
    if (i === 5 && aid === w2) return; // Khaamo misses the last one
    if (i > 2 && aid === a3 && rnd() < 0.5) return;
    const late = i === 4 && aid === a2;
    const when = new Date(due.getTime() + (late ? 864e5 : -Math.floor(rnd() * 4 + 1) * 864e5));
    const score = late ? Math.round(max * 0.7) : Math.round(max * (0.75 + rnd() * 0.25));
    const st = i < 2 && aid === a3 ? "submitted" : "graded";
    uid(`INSERT INTO assignment_submissions (assignment_id, student_id, content, status, submitted_at, score, grade_released, feedback) VALUES (?,?,?,?,?,?,?,?)`,
      aid, s, `My solution for this assignment. (student ${i + 1})`, st, dt(when), st === "graded" ? score : null, st === "graded" ? 1 : 0, st === "graded" ? pick(feedbacks) : null);
    act(s, course, "assignment_submitted", aid, when, `Submitted "${db.prepare("SELECT title FROM assignments WHERE id=?").get(aid).title}"`);
  });
}
// A4 open for most students (upcoming deadline demo)
act(students[0], py, "assignment_submitted", a4, daysAgo(2), `Submitted "${"Assignment 4: Mini project — expense tracker"}"`);
uid(`INSERT INTO assignment_submissions (assignment_id, student_id, content, status, submitted_at) VALUES (?,?,?,?,?)`, a4, students[0], "Expense tracker v1, works with CSV files!", "submitted", dt(daysAgo(2)));

const mkProject = (course, title, deadline, milestones) => {
  const p = uid(`INSERT INTO projects (course_id, title, description, objectives, instructions, start_date, deadline, max_marks, project_type, published) VALUES (?,?,?,?,?,?,?,30,'individual',1)`,
    course, title, `Build ${title.toLowerCase()} end to end.`, "Apply what the course teaches in one finished artifact.", "Plan, design, build, test, submit.", iso(daysAgo(90)), dt(deadline));
  milestones.forEach((m, i) => uid("INSERT INTO project_milestones (project_id, title, position) VALUES (?,?,?)", p, m, i + 1));
  return p;
};
const p1 = mkProject(py, "Student Portfolio Website", daysAgo(-20), ["Planning", "UI design", "Frontend development", "Testing", "Final submission"]);
const p2 = mkProject(wd, "Interactive dashboard", daysAgo(-35), ["Wireframes", "Layout", "Charts", "Polish"]);
students.forEach((s, i) => {
  const ms = db.prepare("SELECT * FROM project_milestones WHERE project_id = ?").all(i % 2 === 0 || i === 3 ? p1 : p2);
  const doneCount = i === 0 ? 5 : Math.floor(rnd() * 4);
  ms.slice(0, doneCount).forEach((m, k) => {
    const when = daysAgo(60 - k * 9);
    uid("INSERT INTO project_progress (project_id, student_id, milestone_id, done_at) VALUES (?,?,?,?)", m.project_id, s, m.id, dt(when));
    act(s, null, "project_milestone", m.id, when, `Milestone "${m.title}" on "${db.prepare("SELECT title FROM projects WHERE id=?").get(m.project_id).title}"`);
  });
  if (i === 0) {
    const sub = uid(`INSERT INTO project_submissions (project_id, student_id, description, demo_url, repo_url, status, submitted_at, score, grade_released, feedback) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      p1, s, "My portfolio with projects, bio and contact form. Built with plain HTML/CSS/JS.", "https://example.com/hodan", "https://github.com/example/hodan-portfolio", "completed", dt(daysAgo(8)), 27, 1, "Excellent structure — the contact form UX is genuinely good.");
    act(s, py, "project_submitted", p1, daysAgo(8), `Submitted project "${db.prepare("SELECT title FROM projects WHERE id=?").get(p1).title}"`);
  }
});
for (const [s, t, tech] of [[students[0], "Farm management app (family project)", "Flutter,Dart,SQLite"], [students[2], "Somali dictionary mini-app", "React,FSWA API"]]) {
  const id = uid("INSERT INTO personal_projects (student_id, title, description, technologies, demo_url, completed_on) VALUES (?,?,?,?,?,?)",
    s, t, "Worked on this outside class hours.", tech, "https://example.com", iso(daysAgo(25)));
  act(s, null, "external_project", id, daysAgo(25), `External project: ${t}`, "self_reported");
}

// Attendance: 12 closed sessions per course + 1 open for Python
for (const [course, n] of [[py, 12], [wd, 8]]) {
  for (let k = 1; k <= n; k++) {
    const d = daysAgo(k * 10);
    const sess = uid("INSERT INTO attendance_sessions (course_id, session_date, code, opened_at, closes_at, status, created_by) VALUES (?,?,?,?,?,'closed',?)",
      course, iso(d), "H" + k + "X" + k, dt(d), dt(new Date(d.getTime() + 36e5)), teacher);
    students.forEach((s, i) => {
      if (course === wd && !db.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=?").get(s, course)) return;
      const roll = rnd();
      const st = i === 4 && roll < 0.4 ? "absent" : roll < 0.08 ? "excused" : roll < 0.18 ? "late" : "present";
      uid("INSERT INTO attendance_records (session_id, student_id, status, method, marked_at, marked_by) VALUES (?,?,?,?,?,?)", sess, s, st, "manual", dt(d), teacher);
    });
  }
}
const openSess = uid("INSERT INTO attendance_sessions (course_id, session_date, code, opened_at, closes_at, status, created_by) VALUES (?,?,?,?,?, 'open', ?)",
  py, iso(new Date()), "LIVE01", dt(new Date(Date.now() - 60e3)), dt(new Date(Date.now() + 10 * 60e3)), teacher);
db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)")
  .run(students[0], "attendance", "Attendance is open for Python Programming. Mark yourself present!", `/attendance/join?session=${openSess}&code=LIVE01`);

for (const [course, mods] of [[py, ["Week 1: Getting started", "Week 3: Data structures"]], [wd, ["Module 1: HTML & CSS"]]]) {
  mods.forEach((m, i) => uid("INSERT INTO materials (course_id, teacher_id, title, description, url, module) VALUES (?,?,?,?,?,?)",
    course, teacher, `${m} — course notes`, "Slides and examples for this module.", `https://example.com/course-${course}-notes-${i}`, m));
  uid("INSERT INTO materials (course_id, teacher_id, title, description, module) VALUES (?,?,?,?,?)",
    course, teacher, `${mods[0]} — practice file`, "Download and complete together in class.", "Text note");
}
for (const [course, when] of [[py, 1], [wd, 2]]) {
  uid("INSERT INTO announcements (course_id, teacher_id, title, content, created_at) VALUES (?,?,?,?,?)",
    course, teacher, "Welcome to the course", "Everything you need is here. Join the live session times, submit early, and log your outside work so your calendar tells the true story.", dt(daysAgo(when * 30)));
  uid("INSERT INTO announcements (course_id, teacher_id, title, content, created_at) VALUES (?,?,?,?,?)",
    course, teacher, "Grades released", "Assignment grades for the last unit are out — check the Grades tab.", dt(daysAgo(when)));
}
db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)")
  .run(teacher, "enrollment", "Hodan Ali joined Python Programming.", `/courses/${py}`);

// Study-session backfill so the calendar looks alive; student1 keeps a live 5-day streak.
const studyTopics = ["Practiced loops on paper", "Watched a lecture and took notes", "Debugged my assignment code", "Read the chapter on functions", "Built a small CLI game", "Reviewed flashcards"];
students.slice(0, 3).forEach((s, si) => {
  for (let k = 150; k >= 1; k--) {
    if (rnd() < (si === 0 ? 0.55 : 0.3)) {
      const d = daysAgo(k);
      const topic = pick(studyTopics), mins = 20 + Math.floor(rnd() * 70);
      const id = uid("INSERT INTO study_logs (student_id, course_id, title, minutes, log_date) VALUES (?,?,?,?,?)", s, rnd() < 0.7 ? py : wd, topic, mins, iso(d));
      act(s, null, "study_logged", id, d, `Logged ${mins} min of study: ${topic}`, "self_reported");
    }
  }
  for (let k = 4; k >= 0; k--) {
    const d = daysAgo(k);
    const id = uid("INSERT INTO study_logs (student_id, course_id, title, minutes, log_date) VALUES (?,?,?,?,?)", s, py, "Daily practice streak", 40, iso(d));
    act(s, null, "study_logged", id, d, "Logged 40 min of study: Daily practice streak", "self_reported");
  }
});

console.log("Demo data created.");
console.log("Teacher: teacher@demo.albasrawie.app / Demo1234!");
console.log("Students: student1..6@demo.albasrawie.app / Demo1234! (student1 has the fullest profile)");
