// Smoke test: creates real sessions for demo users and checks every route renders.
// Usage: node scripts/smoke.mjs [base]
import crypto from "crypto";
import { db, closeDb } from "../lib/db.js";

const base = process.argv[2] || "http://localhost:3000";

async function session(email) {
  const u = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!u) throw new Error(`no user ${email}`);
  const token = crypto.randomBytes(32).toString("base64url");
  // sessions.expires_at is VARCHAR(40) and the app compares it with new Date(),
  // so it keeps getting the same full ISO string lib/auth.js writes.
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)")
    .run(crypto.createHash("sha256").update(token).digest("hex"), u.id, new Date(Date.now() + 864e5).toISOString());
  return token;
}

const teacher = await session("teacher@demo.albasrawie.app");
const student = await session("student1@demo.albasrawie.app");
const other = await session("student2@demo.albasrawie.app");
const cookie = (t) => `albasrawie_session=${t}`;

let fails = 0;
async function check(name, path, tok, expect, { follow = false, statusOnly = false } = {}) {
  try {
    const res = await fetch(base + path, { headers: tok ? { cookie: cookie(tok) } : {}, redirect: follow ? "follow" : "manual" });
    const loc = res.headers.get("location") || "";
    let ok = expect === "redirect-login" ? (res.status === 307 && loc.includes("/login"))
      : expect === "redirect-dashboard" ? (res.status === 307 && loc.includes("/dashboard"))
      : expect === "redirect-login-or-dash" ? (res.status === 307 && (/\/(login|dashboard)/.test(loc)))
      : expect === "redirect-projects" ? (res.status === 307 && loc.includes("/projects"))
      : expect === "notfound" ? res.status === 404
      : expect === "ok" ? res.status === 200
      : res.status === 200;
    let body = "";
    if (res.status === 200 && !statusOnly) body = await res.text();
    if (ok && body && typeof expect === "string" && expect !== "ok" && !body.includes(expect)) { ok = false; }
    if (ok && body && /Application error|Unhandled Runtime|__next_error__|digest/.test(body) && /error/i.test(body.slice(0, 200))) { ok = false; }
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${path} [${res.status}]${ok || !body ? "" : " (content mismatch)"}`);
    if (!ok) { fails++; if (body) { const m = body.match(/<h2[^>]*>([^<]+)<\/h2>/); if (m) console.log("   ", m[1].slice(0, 200)); } }
  } catch (e) {
    console.log(`FAIL ${name} ${path} — ${e.message}`); fails++;
  }
}

// anonymous
await check("home redirects", "/", null, "redirect-login");
await check("login page", "/login", null, "Log in");
await check("register page", "/register", null, "Register");
// student
await check("student dashboard", "/dashboard", student, "Learning activity");
await check("student profile", "/profile", student, "Current streak");
await check("student courses", "/courses", student, "Python Programming");
await check("course overview", "/courses/1", student, "About this course");
await check("course members", "/courses/1/members", student, "enrolled");
await check("activity page", "/activity", student, "Log learning");
await check("search", "/search?q=python", student, "Search results");
await check("settings", "/settings", student, "Time zone");
await check("notifications", "/notifications", student, null, "ok");
await check("other teacher's course blocked", "/courses/999", student, "notfound");
// attendance + materials + announcements
await check("student attendance", "/attendance", student, null, "ok");
await check("student course attendance", "/courses/1/attendance", student, null, "ok");
await check("attendance join page", "/attendance/join", student, null, "ok");
await check("materials student", "/courses/1/materials", student, null, "ok");
await check("announcements student", "/courses/1/announcements", student, null, "ok");
await check("teacher attendance landing", "/attendance", teacher, null, "ok");
await check("teacher course attendance", "/courses/1/attendance", teacher, null, "ok");
await check("teacher materials", "/courses/1/materials", teacher, null, "ok");
await check("teacher announcements", "/courses/1/announcements", teacher, null, "ok");
await check("student blocked from session detail", "/courses/1/attendance/1", student, "notfound");
// assignments + projects + grades
await check("student assignments", "/assignments", student, "Assignments");
await check("student assignment detail", "/assignments/1", student, null, "ok");
await check("student projects", "/projects", student, "Projects");
await check("student project detail", "/projects/1", student, null, "ok");
await check("student personal projects", "/projects/personal", student, "redirect-projects");
await check("student grades", "/grades", student, null, "ok");
await check("course assignments tab", "/courses/1/assignments", student, null, "ok");
await check("course projects tab", "/courses/1/projects", student, null, "ok");
await check("course grades tab", "/courses/1/grades", student, null, "ok");
await check("student blocked new assignment", "/assignments/new", student, "redirect-login-or-dash");
await check("teacher assignments", "/assignments", teacher, "Assignments");
await check("teacher assignment detail", "/assignments/1", teacher, null, "ok");
await check("teacher new assignment", "/assignments/new", teacher, "New assignment");
await check("teacher new project", "/projects/new", teacher, "New project");
await check("teacher projects", "/projects", teacher, "Projects");
await check("teacher grades", "/grades", teacher, null, "ok");
await check("teacher grade page", "/grades", teacher, null, "ok");
// teacher
await check("teacher dashboard", "/dashboard", teacher, "Awaiting review");
await check("teacher courses", "/courses", teacher, "Create a course");
await check("teacher students", "/students", teacher, "Students");
await check("teacher student profile", "/students/2", teacher, "Learning activity");
await check("teacher analytics", "/analytics", teacher, "Class activity");
await check("teacher course view", "/courses/1", teacher, "Share this course");
// cross-role: student cannot open teacher-only pages
await check("student on students page", "/students", student, "redirect-dashboard");
await closeDb();
console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
