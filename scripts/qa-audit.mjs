// Deeper audit: element clips + in-page text/background contrast for the photo surfaces.
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
const teacher = await tok("teacher@demo.albasrawie.app");
const student = await tok("student1@demo.albasrawie.app");

const out = "qa4";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

// Average colour of a region by drawing the page into a canvas is blocked cross-origin for images;
// instead we sample the *rendered screenshot* clip in PowerShell afterwards. Here we just export clips.
async function clip(sel, file, { cookie, theme = "light", viewport = { width: 1380, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  if (cookie) await ctx.addCookies([{ name: "albasrawie_session", value: cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem("albasrawie-theme", t); } catch (e) {} }, theme);
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE + sel.page, { waitUntil: "networkidle", timeout: 40000 });
  try {
    const el = page.locator(sel.sel).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await el.screenshot({ path: `${out}/${file}.png` });
    const box = await el.boundingBox();
    console.log(`[${file}] ${sel.page} ${sel.sel} -> ${box ? Math.round(box.width) + "x" + Math.round(box.height) : "n/a"}${errs.length ? " ERR " + errs.join("|") : ""}`);
  } catch (e) {
    console.log(`[${file}] FAILED: ${e.message}`);
  }
  await ctx.close();
}

await clip({ page: "/", sel: ".l-hero" }, "hero-landing-light");
await clip({ page: "/", sel: ".l-hero" }, "hero-landing-dark", { theme: "dark" });
await clip({ page: "/", sel: ".l-gallery" }, "gallery-light");
await clip({ page: "/", sel: ".l-shot-1" }, "shot-1");
await clip({ page: "/", sel: ".l-shot-3" }, "shot-3");
await clip({ page: "/login", sel: ".auth-wrap" }, "login-full");
await clip({ page: "/dashboard", sel: ".hero" }, "hero-teacher", { cookie: teacher });
await clip({ page: "/dashboard", sel: ".hero" }, "hero-student", { cookie: student });
await clip({ page: "/dashboard", sel: ".hero" }, "hero-teacher-dark", { cookie: teacher, theme: "dark" });
await clip({ page: "/courses/1", sel: ".hero" }, "hero-course", { cookie: teacher });
await clip({ page: "/profile", sel: ".profile-hero" }, "hero-profile", { cookie: student });
await clip({ page: "/join", sel: ".join-hero" }, "hero-join", { cookie: student });

await browser.close();
await closeDb();
console.log("done");
