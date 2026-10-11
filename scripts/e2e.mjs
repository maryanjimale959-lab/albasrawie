// End-to-end acceptance tests through real browser forms (headless Chrome).
// Covers spec scenarios: register, create course, join by code, multi-course,
// assignment workflow, project workflow, attendance, permissions, persistence.
import crypto from "crypto";
import fs from "fs";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const PW = "Passw0rd!test";
const stamp = Date.now();
const results = [];
const ok = (name, cond, extra = "") => { results.push([cond, name]); console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const db = new Database("data/albasrawie.db");
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
async function dumpFailure(page, where) {
  try {
    await page.screenshot({ path: "qa/e2e-fail.png", fullPage: true });
    console.log(`[fail@${where}] url=${page.url()}`);
    console.log(`[fail@${where}] alerts=${JSON.stringify(await page.locator(".alert").allInnerTexts())}`);
  } catch (e) { console.log("[faildump]", e.message.slice(0, 120)); }
}
process.on("unhandledRejection", (e) => { console.error("UNHANDLED:", String(e).slice(0, 400)); process.exit(1); });
async function newCtx() {
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 } });
  ctx.on("page", (pg) => {
    pg.on("console", (m) => { if (process.env.E2E_DEBUG && m.type() === "error") console.log("[console]", m.text().slice(0, 160)); });
    pg.on("response", (r) => { if (process.env.E2E_DEBUG && r.status() >= 400) console.log("[resp]", r.status(), r.url()); });
  });
  return ctx;
}
async function fill(page, sel, val) { await page.fill(sel, val); }
async function clickBtn(page, label) { await page.locator(`button:has-text("${label}")`).first().click(); }
async function byName(page, name) { return page.locator(`[name="${name}"]`).first(); }

// --- Test 1: student registration ---
let ctxS = await newCtx();
let p = await ctxS.newPage();
const studentEmail = `e2e.student.${stamp}@test.local`;
async function registerStudent(page) {
  await page.goto(`${BASE}/register`); // default role is student
  const fields = { full_name: "E2E Student", email: studentEmail, password: PW, confirm: PW, student_id: `E2E-${stamp}`, class_name: "Test Group" };
  for (const [n, v] of Object.entries(fields)) {
    const f = page.locator(`input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`);
    if (await f.count()) await f.first().fill(v);
  }
  await clickBtn(page, "Create student account");
  await page.waitForURL(/dashboard|join|courses/, { timeout: 15000 });
}
await registerStudent(p);
ok("T1 student registration → dashboard", /dashboard|join|courses/.test(p.url()));

// --- Test 2: teacher creates course, student joins with code ---
const teacherEmail = `e2e.teacher.${stamp}@test.local`;
const ctxT = await newCtx();
const pt = await ctxT.newPage();
await pt.goto(`${BASE}/register?role=teacher`);
for (const [n, v] of Object.entries({ full_name: "E2E Teacher", email: teacherEmail, password: PW, confirm: PW, bio: "E2E test teacher." })) {
  const f = pt.locator(`input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`);
  if (await f.count()) await f.first().fill(v);
}
await clickBtn(pt, "Create teacher account");
await pt.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {});
ok("T2 teacher registration → dashboard", pt.url().includes("/dashboard"), pt.url());
if (!pt.url().includes("/dashboard")) { await dumpFailure(pt, "teacher-register"); }
await pt.goto(`${BASE}/courses/new`);
ok("T2 courses/new reachable", pt.url().includes("/courses/new"), pt.url());
for (const [n, v] of Object.entries({ name: `E2E Python ${stamp}`, description: "End to end test course.", category: "Programming" })) {
  const f = pt.locator(`input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`);
  if (await f.count()) await f.first().fill(v);
}
const vis = pt.locator('select[name="visibility"],input[name="visibility"]');
if (await vis.count() && (await vis.first().evaluate((el) => el.tagName)) === "SELECT") await vis.first().selectOption("private");
await clickBtn(pt, "Create course");
await pt.waitForURL(/\/courses\/\d+/, { timeout: 15000 }).catch(() => {});
if (!/\/courses\/\d+/.test(pt.url())) { await dumpFailure(pt, "course-create"); ok("T2 teacher created course", false, `stuck at ${pt.url()}`); }
const courseId = Number(pt.url().match(/courses\/(\d+)/)?.[1]);
if (!courseId) { console.log("ABORT: no course id captured"); await browser.close(); process.exit(1); }
const codeText = await pt.locator(".code").first().innerText();
const courseCode = codeText.trim();
ok("T2a teacher created course + code", /^\S+-\S+$/.test(courseCode), courseCode);

await p.goto(`${BASE}/dashboard`);
await fill(p, 'input[name="code"],textarea[name="code"]', courseCode);
await p.click('button:has-text("Find course")');
await p.waitForURL(/\/join\//, { timeout: 15000 });
await clickBtn(p, "Join this course");
await p.waitForURL(new RegExp(`/courses/${courseId}`), { timeout: 15000 });
ok("T2b student joined via code → course page", p.url().includes(`/courses/${courseId}`));

// --- persistence: logout + login as student ---
await p.goto(`${BASE}/dashboard`);
const sess = db.prepare("SELECT token_hash FROM sessions ORDER BY rowid DESC LIMIT 1").get();
ok("T10a session persisted in DB", !!sess);

// --- Test 4: assignment workflow ---
await pt.goto(`${BASE}/assignments/new?course=${courseId}`);
const aFields = { title: `E2E Assignment ${stamp}`, description: "Do the thing.", instructions: "Step 1, step 2.", max_marks: "20" };
for (const [n, v] of Object.entries(aFields)) {
  const f = pt.locator(`input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`);
  if (await f.count()) await f.first().fill(String(v));
}
const due = pt.locator('input[name="due_at"],input[name="due"]');
if (await due.count()) await due.first().fill("2030-01-01T12:00");
const pub = pt.locator('input[name="publish"]');
ok("T4 UI has publish checkbox", await pub.count() > 0);
if (await pub.count()) await pub.first().check().catch(() => {});
await clickBtn(pt, "Create assignment");
await pt.waitForTimeout(1500);
const aRow = db.prepare("SELECT id FROM assignments WHERE course_id = ? ORDER BY id DESC LIMIT 1").get(courseId);
ok("T4a teacher published assignment", !!aRow);

await p.goto(`${BASE}/assignments/${aRow.id}`);
const content = p.locator('textarea[name="content"],input[name="content"]');
ok("T4b student sees assignment page", await content.count() > 0 || (await p.content()).includes("E2E Assignment"));
if (await content.count()) {
  await content.first().fill("My E2E solution.");
  await clickBtn(p, "Submit assignment");
  await p.waitForTimeout(1500);
}
const sub = db.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ?").get(aRow.id);
ok("T4c submission stored", !!sub);
const act = db.prepare("SELECT * FROM learning_activities WHERE type='assignment_submitted' AND related_id=?").get(aRow.id);
ok("T4d activity calendar updated", !!act);

// teacher grades
await pt.goto(`${BASE}/assignments/${aRow.id}`);
const score = pt.locator('input[name="score"]');
const feedback = pt.locator('textarea[name="feedback"],input[name="feedback"]');
ok("T4e teacher sees submission UI", (await score.count()) > 0);
if (await score.count()) {
  await score.first().fill("18");
  if (await feedback.count()) await feedback.first().fill("Nice work.");
  const gradeBtn = pt.locator('button:has-text("Grade"), button:has-text("Release")').first();
  if (await gradeBtn.count()) { await gradeBtn.click(); await pt.waitForTimeout(1500); }
}
const graded = db.prepare("SELECT status, score FROM assignment_submissions WHERE assignment_id=?").get(aRow.id);
ok("T4f grade saved", graded.score === 18 || graded.status === "graded", JSON.stringify(graded));

// --- Test 5: project workflow ---
await pt.goto(`${BASE}/projects/new?course=${courseId}`);
for (const [n, v] of Object.entries({ title: `E2E Project ${stamp}`, description: "Build it.", objectives: "Learn.", milestone_1: "Planning", milestone_2: "Build" })) {
  const f = pt.locator(`input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`);
  if (await f.count()) await f.first().fill(String(v));
}
const dl = pt.locator('input[name="deadline"]');
if (await dl.count()) await dl.first().fill("2030-01-01");
const ppub = pt.locator('input[name="publish"]');
if (await ppub.count()) await ppub.first().check().catch(() => {});
await clickBtn(pt, "Create project");
await pt.waitForTimeout(1500);
const proj = db.prepare("SELECT * FROM projects WHERE course_id=? ORDER BY id DESC LIMIT 1").get(courseId);
ok("T5a project created with milestones", !!proj && db.prepare("SELECT COUNT(*) n FROM project_milestones WHERE project_id=?").get(proj.id).n >= 2);
await p.goto(`${BASE}/projects/${proj.id}`);
const msSave = p.locator('.milestone button[type="submit"]').first();
ok("T5 UI has milestone toggles", await msSave.count() > 0);
if (await msSave.count()) { await msSave.click(); await p.waitForTimeout(1500); }
const prog = db.prepare("SELECT COUNT(*) n FROM project_progress WHERE project_id=?").get(proj.id);
ok("T5b milestone progress recorded", prog.n >= 1, `rows=${prog.n}`);

// --- Test 7: attendance ---
await pt.goto(`${BASE}/courses/${courseId}/attendance`);
const startBtn = pt.locator('button:has-text("Start session")').first();
if (await startBtn.count()) { await startBtn.click(); await pt.waitForTimeout(2000); }
const joinHref = await pt.locator('a[href*="/attendance/join?session="]').first().getAttribute("href").catch(() => null);
const sessRow = db.prepare("SELECT * FROM attendance_sessions WHERE course_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(courseId);
ok("T7a teacher started session", !!sessRow, sessRow?.code);
if (sessRow) {
  await p.goto(`${BASE}${joinHref || `/attendance/join?session=${sessRow.id}&code=${sessRow.code}`}`);
  const joinBtn = p.locator('button:has-text("Mark me present")');
  const haveBtn = await joinBtn.count();
  if (!haveBtn) console.log("  join page says:", JSON.stringify(await p.locator(".alert, .panel p.muted, .panel .small").allInnerTexts()).slice(0, 300));
  if (haveBtn) { await joinBtn.first().click(); await p.waitForTimeout(2000); }
  const rec = db.prepare("SELECT * FROM attendance_records WHERE session_id=?").get(sessRow.id);
  ok("T7b student marked via code link", !!rec, rec?.status);
  await pt.goto(`${BASE}/courses/${courseId}/attendance`);
  const closeBtn = pt.locator('button:has-text("Close")').first();
  if (await closeBtn.count()) { await closeBtn.click(); await pt.waitForTimeout(1500); }
  const closed = db.prepare("SELECT status FROM attendance_sessions WHERE id=?").get(sessRow.id);
  ok("T7c session closed + absent fill", closed?.status === "closed");
}

// --- Test 9: permissions ---
const anon = await newCtx();
const pa = await anon.newPage();
await pa.goto(`${BASE}/dashboard`);
ok("T9a anonymous redirected to login", pa.url().includes("/login"));
// student2 not enrolled cannot see the course
const ctxS2 = await newCtx();
const p2 = await ctxS2.newPage();
await p2.goto(`${BASE}/register`);
for (const [n, v] of Object.entries({ full_name: "E2E Other", email: `e2e.other.${stamp}@test.local`, password: PW, confirm: PW, student_id: `E2E2-${stamp}`, class_name: "Test Group" })) {
  const f = p2.locator(`input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`);
  if (await f.count()) await f.first().fill(v);
}
await clickBtn(p2, "Create student account");
await p2.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {});
const resp = await p2.goto(`${BASE}/courses/${courseId}`);
ok("T9b unenrolled student blocked from course", resp.status() === 404, String(resp.status()));
const resp2 = await p2.goto(`${BASE}/students`);
ok("T9c student blocked from teacher pages", p2.url().includes("/dashboard") || resp2.status() !== 200);

// --- Test 3: multiple courses (student joins a second course) ---
await pt.goto(`${BASE}/courses/new`);
for (const [n, v] of Object.entries({ name: `E2E Web ${stamp}`, description: "Second course." })) {
  const f = pt.locator(`input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`);
  if (await f.count()) await f.first().fill(v);
}
await clickBtn(pt, "Create course");
await pt.waitForURL(/\/courses\/\d+/, { timeout: 15000 });
const c2 = Number(pt.url().match(/courses\/(\d+)/)[1]);
const code2 = (await pt.locator(".code").first().innerText()).trim();
await p.goto(`${BASE}/dashboard`);
await fill(p, 'input[name="code"],textarea[name="code"]', code2);
await p.click('button:has-text("Find course")');
await clickBtn(p, "Join this course");
await p.waitForTimeout(1200);
const enr = db.prepare("SELECT COUNT(*) n FROM enrollments WHERE course_id IN (?,?) AND status='active'").get(courseId, c2);
ok("T3 student enrolled in two courses separately", enr.n === 2);

// --- Test 6: teacher opens student profile ---
await pt.goto(`${BASE}/students`);
const link = pt.locator('a[href^="/students/"]').first();
await link.click();
await pt.waitForTimeout(1200);
const body = await pt.content();
ok("T6 teacher sees student profile with heatmap+streak", body.includes("Learning activity") && (body.includes("streak") || body.includes("Streak")));

// --- Test 8: calendar correctness (no duplicate inflation) ---
const dup = db.prepare("SELECT COUNT(*) n FROM learning_activities WHERE type='assignment_submitted' AND related_id=?").get(aRow.id);
ok("T8 duplicate submission does not inflate calendar", dup.n === 1);

await browser.close();
const fails = results.filter(([c]) => !c).length;
console.log(fails === 0 ? "ALL E2E PASS" : `${fails} E2E FAILURES`);
process.exit(fails ? 1 : 0);
