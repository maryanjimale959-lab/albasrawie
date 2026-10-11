// Public invitation link check (the "open it on my phone" path) + LAN origin rewrite.
import fs from "fs";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3125";
const out = "qa2";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function shot(label, path, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1380, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const bg = [];
  page.on("response", (r) => { if (r.url().includes("/brand/")) bg.push(`${r.status()} ${r.url().split("/").pop()}`); });
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(600);
  const h = await page.locator("h1, h2").first().textContent().catch(() => "");
  const txt = (await page.locator("body").innerText()).slice(0, 400).replace(/\s+/g, " ");
  await page.screenshot({ path: `${out}/${label}.png`, fullPage: true });
  console.log(`[${label}] ${page.url().replace(BASE, "")} | heading="${(h||"").trim()}" | bg=${bg.join(",") || "none"} | ${txt}`);
  if (errors.length) console.log("  ERRORS:", errors.join(" | "));
  await ctx.close();
}

await shot("20-join-by-code", "/join/PY-DEMO1");
await shot("21-join-by-code-phone", "/join/PY-DEMO1", { width: 390, height: 844 });
await shot("22-join-bad-code", "/join/NOPE-XX");

// LAN origin rewrite: hit the server via its private IPv4 so Host is not localhost.
const os = await import("os");
const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
if (ip) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://${ip}:3125/login`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch((e) => console.log("lan nav err", e.message));
  console.log(`[lan] reached http://${ip}:3125/login -> ${page.url()}`);
  await ctx.close();
}

await browser.close();
console.log("done");
