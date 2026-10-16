// Headless visual QA: screenshots of key pages in light and dark themes.
import crypto from "crypto";
import fs from "fs";
import { db, closeDb } from "../lib/db.js";
import { chromium } from "playwright-core";

const tok = async (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),?)")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email, new Date(Date.now() + 864e5).toISOString());
  return t;
};
const student = await tok("student1@demo.albasrawie.app");
const teacher = await tok("teacher@demo.albasrawie.app");

const out = "qa";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function shots(pages, cookie, prefix) {
  for (const [theme, name, path] of pages) {
    const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 } });
    await ctx.addCookies([{ name: "albasrawie_session", value: cookie, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.addInitScript((t) => { try { localStorage.setItem("albasrawie-theme", t); } catch (e) {} }, theme);
    await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.screenshot({ path: `${out}/${prefix}-${name}-${theme}.png`, fullPage: true });
    console.log(`${prefix}/${name} ${theme} ${errors.length ? "PAGEERROR: " + errors[0].slice(0, 120) : "ok"}`);
    await ctx.close();
  }
}

await shots([
  ["light", "login", "/login"],
  ["dark", "login", "/login"],
], "", "auth");
await shots([
  ["light", "dashboard", "/dashboard"],
  ["dark", "profile", "/profile"],
  ["light", "course", "/courses/1"],
  ["dark", "activity", "/activity"],
  ["light", "assignments", "/assignments"],
  ["dark", "assignment", "/assignments/1"],
  ["light", "projects", "/projects"],
  ["dark", "grades", "/grades"],
], student, "student");
await shots([
  ["dark", "dashboard", "/dashboard"],
  ["light", "attendance", "/courses/1/attendance"],
  ["dark", "analytics", "/analytics"],
  ["light", "students", "/students"],
  ["light", "assignment-grade", "/assignments/1"],
  ["dark", "project-review", "/projects/1"],
  ["light", "grades", "/courses/1/grades"],
], teacher, "teacher");

await browser.close();
await closeDb();
console.log("done");
