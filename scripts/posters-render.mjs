// Renders the launch posters from marketing/posters.html at exact social sizes.
// Usage: node scripts/posters-render.mjs
import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const HTML = path.join(ROOT, "marketing", "posters.html");
const OUT = path.join(ROOT, ".video", "posters");
fs.mkdirSync(OUT, { recursive: true });

const SIZES = {
  feed: { width: 1080, height: 1350, file: "albasrawie-poster-feed-1080x1350.png" },
  story: { width: 1080, height: 1920, file: "albasrawie-poster-story-1080x1920.png" },
  banner: { width: 1584, height: 396, file: "albasrawie-linkedin-banner-1584x396.png" },
};

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
for (const [fmt, s] of Object.entries(SIZES)) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
  await page.goto(`file:///${HTML.replace(/\\/g, "/")}?fmt=${fmt}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const target = path.join(OUT, s.file);
  await page.screenshot({ path: target });
  console.log(`${s.file}  ${s.width}x${s.height}  ${Math.round(fs.statSync(target).size / 1024)} KB`);
  await page.close();
}
await browser.close();
console.log("posters done");
