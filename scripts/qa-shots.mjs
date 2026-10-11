// Headless visual QA: screenshots of the redesigned pages (light + dark).
import crypto from "crypto";
import fs from "fs";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";

const db = new Database("data/albasrawie.db");
const tok = (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),datetime('now','+1 day'))")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email);
  return t;
};
const student = tok("student1@demo.albasrawie.app");
const teacher = tok("teacher@demo.albasrawie.app");

const out = "qa";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function shots(pages, cookie, prefix) {
  for (const [theme, name, path] of pages) {
    const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 } });
    await ctx.addCookies([{ name: "albasrawie_session", value: cookie, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.addInitScript((t) => { try { localStorage.setItem("albasrawie-theme", t); } catch (e) {} }, theme);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      await page.goto("http://localhost:3124" + path, { waitUntil: "networkidle", timeout: 30000 });
    } catch (e) {
      errors.push("nav: " + e.message);
    }
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${prefix}-${name}-${theme}.png`, fullPage: true });
    console.log(`${prefix}-${name}-${theme}.png ${errors.length ? "ERRORS: " + errors.join(" | ") : "ok"}`);
    await ctx.close();
  }
}

const teacherPages = [
  ["light", "login", "/login"],
  ["light", "dashboard", "/dashboard"],
  ["dark", "dashboard", "/dashboard"],
  ["light", "courses", "/courses"],
  ["light", "course-detail", "/courses/1"],
  ["light", "analytics", "/analytics"],
];
const studentPages = [
  ["light", "dashboard", "/dashboard"],
  ["light", "profile", "/profile"],
  ["light", "attendance-join", "/attendance/join"],
];

await shots(teacherPages, teacher, "teacher");
await shots(studentPages, student, "student");
await browser.close();
console.log("done");
