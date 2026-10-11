// Verify the Gemini scene images are wired into the landing page, auth, and in-app surfaces.
import crypto from "crypto";
import fs from "fs";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3125";
const db = new Database("data/albasrawie.db");
const tok = (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),datetime('now','+1 day'))")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email);
  return t;
};
const teacher = tok("teacher@demo.albasrawie.app");
const student = tok("student1@demo.albasrawie.app");

const out = "qa3";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function shot({ name, path, cookie, theme = "light", viewport = { width: 1380, height: 900 } }) {
  const ctx = await browser.newContext({ viewport });
  if (cookie) await ctx.addCookies([{ name: "albasrawie_session", value: cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem("albasrawie-theme", t); } catch (e) {} }, theme);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const scenes = [];
  page.on("response", (r) => { const u = r.url(); if (u.includes("/brand/scene-")) scenes.push(`${r.status()}:${u.split("/").pop()}`); });
  try { await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 40000 }); } catch (e) { errors.push("nav " + e.message); }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const uniq = [...new Set(scenes)];
  console.log(`[${name}] ${path} scenes=${uniq.join(",") || "none"}${errors.length ? "  !! " + errors.join(" | ") : ""}`);
  await ctx.close();
}

await shot({ name: "01-landing-light", path: "/" });
await shot({ name: "02-landing-dark", path: "/", theme: "dark" });
await shot({ name: "03-landing-mobile", path: "/", viewport: { width: 390, height: 844 } });
await shot({ name: "04-login-light", path: "/login" });
await shot({ name: "05-login-dark", path: "/login", theme: "dark" });
await shot({ name: "06-register", path: "/register" });
await shot({ name: "07-teacher-dashboard", path: "/dashboard", cookie: teacher });
await shot({ name: "08-student-dashboard", path: "/dashboard", cookie: student });
await shot({ name: "09-course-detail", path: "/courses/1", cookie: teacher });
await shot({ name: "10-profile", path: "/profile", cookie: student });
await shot({ name: "11-join-page", path: "/join", cookie: student });

// Assertion: how many gallery figures + that their srcs resolve
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const figs = await page.locator(".l-gallery .l-shot img").evaluateAll((els) => els.map((e) => ({ src: e.getAttribute("src"), w: e.naturalWidth, h: e.naturalHeight })));
  console.log("gallery images:", JSON.stringify(figs));
  const heroBg = await page.locator(".l-hero").evaluate((el) => getComputedStyle(el).backgroundImage);
  console.log("l-hero bg:", heroBg.replace(/.*url\("([^"]+)"\).*/, "$1"));
  await ctx.close();
}

await browser.close();
console.log("done");
