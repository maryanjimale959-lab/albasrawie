// Verify invite code prefill, logged-in join, and LAN-aware share link + QR payload.
import crypto from "crypto";
import os from "os";
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
const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
console.log("LAN IP:", ip);

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

// 1) register prefill
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("http://localhost:3125/register?code=PY-DEMO1", { waitUntil: "networkidle" });
  const codeVal = await page.locator("input[name=course_code]").inputValue().catch(() => "<none>");
  console.log("register prefill course_code =", JSON.stringify(codeVal));
  await ctx.close();
}

// 2) logged-in student hits /join/PY-DEMO1
{
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "albasrawie_session", value: student, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("http://localhost:3125/join/PY-DEMO1", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const txt = (await page.locator("body").innerText()).slice(0, 300).replace(/\s+/g, " ");
  console.log("[student join] url=", page.url(), "|", txt, errs.length ? "ERR " + errs.join("|") : "");
  await page.screenshot({ path: "qa2/23-student-join-code.png", fullPage: true });
  await ctx.close();
}

// 3) teacher share panel via LAN host -> link + QR should use LAN IP
if (ip) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "albasrawie_session", value: teacher, domain: ip, path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`http://${ip}:3125/courses/1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const linkText = await page.locator(".share-link, input[readonly], code").allInnerTexts().catch(() => []);
  const inputVals = await page.locator("input").evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
  const qrSrc = await page.locator("img.share-qr, img[src^='data:image/png']").first().getAttribute("src").catch(() => "");
  console.log("share texts:", JSON.stringify(linkText).slice(0, 300));
  console.log("share input values:", JSON.stringify(inputVals).slice(0, 300));
  console.log("qr present:", qrSrc ? "yes (data url, " + qrSrc.length + " chars)" : "no");
  const lanShown = [...linkText, ...inputVals].some((s) => s && s.includes(ip));
  console.log("LAN IP appears in share link:", lanShown);
  await page.screenshot({ path: "qa2/24-teacher-share-lan.png", fullPage: true });
  await ctx.close();
}

await browser.close();
await closeDb();
console.log("done");
