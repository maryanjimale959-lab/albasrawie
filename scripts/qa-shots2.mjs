// Visual QA round 2 — welcome page, branded auth, invitation/QR, join flow.
import crypto from "crypto";
import fs from "fs";
import { db, closeDb } from "../lib/db.js";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3125";
const tok = async (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),?)")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email, new Date(Date.now() + 864e5).toISOString());
  return t;
};
const student = await tok("student1@demo.albasrawie.app");
const teacher = await tok("teacher@demo.albasrawie.app");

const out = "qa2";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function shot({ theme = "light", name, path, cookie, viewport = { width: 1380, height: 900 } }) {
  const ctx = await browser.newContext({ viewport });
  if (cookie) await ctx.addCookies([{ name: "albasrawie_session", value: cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem("albasrawie-theme", t); } catch (e) {} }, theme);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    errors.push("nav: " + e.message);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(`${name}.png ${errors.length ? "ERRORS: " + errors.join(" | ") : "ok"}`);
  await ctx.close();
}

// Public (no session)
await shot({ name: "01-landing-light", path: "/" });
await shot({ name: "02-landing-dark", path: "/", theme: "dark" });
await shot({ name: "03-login-light", path: "/login" });
await shot({ name: "04-login-dark", path: "/login", theme: "dark" });
await shot({ name: "05-register-light", path: "/register" });
// Phone viewport (the "open it on my phone" scenario)
await shot({ name: "06-phone-landing", path: "/", viewport: { width: 390, height: 844 } });
await shot({ name: "07-phone-login", path: "/login", viewport: { width: 390, height: 844 } });

// Teacher
await shot({ name: "08-teacher-dashboard", path: "/dashboard", cookie: teacher });
await shot({ name: "09-teacher-courses", path: "/courses", cookie: teacher });
await shot({ name: "10-teacher-course-share", path: "/courses/1", cookie: teacher });
await shot({ name: "11-teacher-attendance", path: "/courses/1/attendance", cookie: teacher });
await shot({ name: "12-teacher-students", path: "/students", cookie: teacher });

// Student
await shot({ name: "13-student-dashboard", path: "/dashboard", cookie: student });
await shot({ name: "14-student-attendance", path: "/attendance", cookie: student });
await shot({ name: "15-student-attendance-join", path: "/attendance/join", cookie: student });
await shot({ name: "16-student-join-code", path: "/join", cookie: student });

await browser.close();
await closeDb();
console.log("done");
