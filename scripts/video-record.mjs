// Records the Albasrawie walkthrough as one webm clip per scene, driven through
// the real UI at natural speed against the isolated demo instance on :3100.
// Usage: node scripts/video-record.mjs [desktop|mobile]
import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";

const MODE = process.argv[2] === "mobile" ? "mobile" : "desktop";
const BASE = "http://127.0.0.1:3100";
const PW = "Demo1234!";
const CLIP_DIR = ".video/clips";
const RAW = `${CLIP_DIR}/raw-${MODE}`;
// A full pass starts clean; a SCENES-filtered re-record keeps the other clips.
if (!process.env.SCENES) { fs.rmSync(RAW, { recursive: true, force: true }); }
fs.mkdirSync(RAW, { recursive: true });

// Playwright records the page at its CSS pixel size and ignores deviceScaleFactor,
// so the vertical pass uses a 720x1280 viewport: below the app's 900px breakpoint
// (phone chrome, single column), exactly 9:16, and only a 1.5x upscale to 1080x1920.
const VIEWPORT = MODE === "mobile" ? { width: 720, height: 1280 } : { width: 1920, height: 1080 };
const RECORD = MODE === "mobile" ? { width: 720, height: 1280 } : { width: 1920, height: 1080 };
const DPR = 1;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const log = (...a) => console.log(`[${MODE}]`, ...a);

/** Eased cursor move so the pointer glides instead of teleporting. */
async function glide(page, x, y, ms = 700) {
  const [cx, cy] = await page.evaluate(() => window.__m || [0, 0]);
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const nx = cx + (x - cx) * e, ny = cy + (y - cy) * e;
    await page.mouse.move(nx, ny);
  }
  await page.evaluate(([a, b]) => { window.__m = [a, b]; }, [x, y]);
}

async function hover(page, locator, { ms = 500, click = false } = {}) {
  const box = await locator.boundingBox();
  if (!box) return;
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, ms);
  if (click) { await page.mouse.down(); await wait(90); await page.mouse.up(); }
}

async function type(page, selector, text, { delay = 55 } = {}) {
  const loc = page.locator(selector).first();
  await hover(page, loc);
  await loc.click();
  await loc.fill("");
  await loc.pressSequentially(text, { delay });
}

async function login(page, email) {
  // Reuse the page when the caller is already on /login, so the shot can linger
  // on the empty form before the same proven typing path runs.
  if (!page.url().endsWith("/login")) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await wait(700);
  }
  await type(page, 'input[name="email"]', email);
  await type(page, 'input[name="password"]', PW, { delay: 40 });
  await wait(350);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/dashboard|courses|profile/, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  await wait(900);
}

/** One browser context = one clip, so scenes can be ordered freely in the edit. */
const ONLY = (process.env.SCENES || "").split(",").map((s) => s.trim()).filter(Boolean);
async function scene(index, name, fn, { auth = null, startUrl = "/" } = {}) {
  if (ONLY.length && !ONLY.includes(index)) { log(`skip ${index} ${name}`); return { name, file: null, skipped: true }; }
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, recordVideo: { dir: RAW, size: RECORD } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  let failed = null;
  let authDone = 0;
  try {
    await page.goto(BASE + startUrl, { waitUntil: "networkidle" });
    if (auth) await login(page, auth);
    else await wait(900);
    // Seconds of clip spent on the sign-in preamble; the edit cuts from here so
    // a scene never opens on the login form.
    authDone = (Date.now() - t0) / 1000;
    await fn(page);
  } catch (e) { failed = e.message.split("\n")[0]; }
  const video = page.video();
  await ctx.close();
  const from = await video.path();
  const to = path.join(RAW, `${index}-${name}.webm`);
  fs.renameSync(from, to);
  const kb = Math.round(fs.statSync(to).size / 1024);
  log(`${index} ${name.padEnd(22)} ${kb} KB  signin=${authDone.toFixed(1)}s ${failed ? "FAILED: " + failed : ""}${errors.length ? " ERRORS: " + errors[0].slice(0, 90) : ""}`);
  return { id: index, name, file: to, authDone, failed, errors };
}

const results = [];
let courseCode = null;

// 01 — landing page: brand, scroll through the pitch, end on the footer credit
results.push(await scene("01", "landing", async (page) => {
  await wait(1400);
  for (const y of [520, 1180, 1900, 2700, 3500]) { await page.mouse.wheel(0, y === 520 ? 520 : 600); await wait(950); }
  await wait(900);
}, { startUrl: "/" }));

// 02 — teacher signs in (linger on the empty form, then type)
results.push(await scene("02", "teacher-login", async (page) => {
  await wait(2400);
  await login(page, "teacher@demo.albasrawie.app");
  await wait(1500);
}, { startUrl: "/login" }));

// 03 — teacher dashboard tour
results.push(await scene("03", "teacher-dashboard", async (page) => {
  await wait(1500);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 420); await wait(800); }
}, { auth: "teacher@demo.albasrawie.app", startUrl: "/dashboard" }));

// 04 — teacher creates a course and gets a share code
results.push(await scene("04", "create-course", async (page) => {
  await page.goto(`${BASE}/courses/new`, { waitUntil: "networkidle" });
  await wait(900);
  await type(page, 'input[name="name"]', "Graphics Programming");
  await type(page, 'textarea[name="description"]', "Shaders, rendering and the maths behind real-time graphics.");
  await type(page, 'input[name="category"]', "Computer Science");
  await wait(400);
  await page.locator('button:has-text("Create course")').first().click();
  await page.waitForURL(/\/courses\/\d+/, { timeout: 25000 });
  await wait(1600);
  courseCode = (await page.locator(".code").first().innerText()).trim();
  await wait(1200);
}, { auth: "teacher@demo.albasrawie.app", startUrl: "/dashboard" }));

// 05 — teacher publishes an assignment
results.push(await scene("05", "publish-assignment", async (page) => {
  await page.goto(`${BASE}/assignments/new`, { waitUntil: "networkidle" });
  await wait(900);
  await type(page, 'input[name="title"]', "Shader basics: colour ramp");
  await type(page, 'textarea[name="instructions"]', "Write a fragment shader that maps UV position to a colour ramp. Submit your source as a link or paste the code.");
  await wait(300);
  const cb = page.locator('input[name="publish"]');
  if (await cb.count()) await cb.first().check();
  await wait(500);
  await page.locator('button:has-text("Create assignment")').first().click();
  await page.waitForURL(/\/assignments\/\d+/, { timeout: 25000 });
  await wait(1500);
}, { auth: "teacher@demo.albasrawie.app", startUrl: "/dashboard" }));

// 06 — teacher opens an attendance session and shows the QR
results.push(await scene("06", "attendance-qr", async (page) => {
  await page.goto(`${BASE}/courses/1/attendance`, { waitUntil: "networkidle" });
  await wait(1100);
  const start = page.locator('button:has-text("Start session")').first();
  if (await start.count()) { await hover(page, start); await start.click(); await page.waitForTimeout(2600); await page.waitForLoadState("networkidle"); }
  await wait(1500);
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 380); await wait(700); }
}, { auth: "teacher@demo.albasrawie.app", startUrl: "/dashboard" }));

// 07 — teacher analytics
results.push(await scene("07", "analytics", async (page) => {
  await wait(1500);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 430); await wait(780); }
}, { auth: "teacher@demo.albasrawie.app", startUrl: "/analytics" }));

// 08 — student signs in and sees the heatmap dashboard
results.push(await scene("08", "student-dashboard", async (page) => {
  await wait(1500);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 430); await wait(820); }
  await wait(700);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -430); await wait(500); }
}, { auth: "student1@demo.albasrawie.app", startUrl: "/dashboard" }));

// 09 — student joins the new course with the code the teacher just got
results.push(await scene("09", "join-by-code", async (page) => {
  const code = process.env.COURSE_CODE || courseCode;
  if (!code) throw new Error("no course code captured");
  await wait(1000);
  const box = page.locator('input[name="code"]').first();
  await hover(page, box);
  await box.click();
  await box.pressSequentially(code, { delay: 90 });
  await wait(500);
  await page.locator('button:has-text("Find course")').first().click();
  await page.waitForURL(/join/, { timeout: 25000 });
  await wait(1500);
  await page.locator('button:has-text("Join this course")').first().click();
  await page.waitForURL(/\/courses\/\d+/, { timeout: 25000 });
  await wait(1800);
}, { auth: "student1@demo.albasrawie.app", startUrl: "/dashboard" }));

// 10 — student hands in an assignment
results.push(await scene("10", "submit-assignment", async (page) => {
  await page.goto(`${BASE}/assignments`, { waitUntil: "networkidle" });
  await wait(1200);
  const row = page.locator('a[href^="/assignments/"]').first();
  await hover(page, row);
  await row.click();
  await page.waitForURL(/\/assignments\/\d+/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await wait(1200);
  const ta = page.locator('textarea[name="content"]');
  if (await ta.count()) {
    await hover(page, ta.first());
    await ta.first().click();
    await ta.first().pressSequentially("My shader maps the U coordinate across a black-to-white ramp and mixes in a hue shift over time.", { delay: 28 });
    await wait(500);
    await page.locator('button:has-text("Submit assignment")').first().click();
    await page.waitForTimeout(2600);
  }
  await wait(1400);
}, { auth: "student1@demo.albasrawie.app", startUrl: "/dashboard" }));

// 11 — student public profile: streaks and portfolio
results.push(await scene("11", "student-profile", async (page) => {
  await wait(1500);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 430); await wait(760); }
}, { auth: "student1@demo.albasrawie.app", startUrl: "/profile" }));

await browser.close();
// Merge so a SCENES-filtered re-record does not erase the timings of other scenes.
const manifestPath = `${RAW}/manifest.json`;
const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { results: [] };
const byId = new Map(prev.results.map((r) => [r.id, r]));
for (const r of results) if (!r.skipped) byId.set(r.id, r);
fs.writeFileSync(manifestPath, JSON.stringify({ mode: MODE, courseCode, results: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) }, null, 2));
log("done. course code created on camera:", courseCode);
const bad = results.filter((r) => !r.skipped && (r.failed || (r.errors || []).length));
log(bad.length ? `${bad.length} scene(s) need attention: ` + bad.map((b) => b.name).join(", ") : "all scenes clean");
