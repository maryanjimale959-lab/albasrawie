// DOM + asset assertions for the branded welcome/auth/join experience.
import crypto from "crypto";
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

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function check(label, path, { cookie, viewport, waitFor } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1380, height: 900 } });
  if (cookie) await ctx.addCookies([{ name: "albasrawie_session", value: cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const bg = [];
  page.on("response", (r) => { const u = r.url(); if (u.includes("/brand/") || u.endsWith(".png")) bg.push(`${r.status()} ${u.split("/").pop()}`); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  if (waitFor) { try { await page.waitForSelector(waitFor, { timeout: 8000 }); } catch (e) { errors.push("missing selector: " + waitFor); } }
  const logos = await page.locator("img.logo, .on-dark img, img[alt*='logo' i], img[src*='logo']").count();
  const qr = await page.locator("img.share-qr, img[src^='data:image/png']").count();
  const joinHero = await page.locator(".join-hero, .hero, .auth-photo, .auth-veil").count();
  console.log(`[${label}] url=${page.url().replace(BASE,"")} logos=${logos} qr=${qr} hero/bg=${joinHero} imgs=${bg.length ? bg.join(", ") : "none"}${errors.length ? "  !! " + errors.join(" | ") : ""}`);
  await ctx.close();
}

await check("landing", "/", { waitFor: "h1" });
await check("landing-mobile", "/", { viewport: { width: 390, height: 844 }, waitFor: "h1" });
await check("login", "/login", { waitFor: "form" });
await check("register", "/register", { waitFor: "form" });
await check("join", "/join");
await check("teacher-course", "/courses/1", { cookie: teacher });
await check("teacher-attendance", "/courses/1/attendance", { cookie: teacher });
await check("student-dashboard", "/dashboard", { cookie: student });
await check("student-attendance", "/attendance", { cookie: student });

await browser.close();
console.log("done");
