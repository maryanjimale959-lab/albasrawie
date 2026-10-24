// Renders the video's title, section and end cards to PNG at both delivery sizes.
// Usage: node scripts/video-cards.mjs
import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const HTML = path.join(ROOT, ".video/cards/cards.html").replace(/\\/g, "/");
const OUT = path.join(ROOT, ".video/cards");
const CARDS = ["title", "teachers", "students", "end"];
const SIZES = { wide: { width: 1920, height: 1080 }, vert: { width: 1080, height: 1920 } };

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
for (const card of CARDS) {
  for (const [fmt, size] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    await page.goto(`file:///${HTML.replace(/^\//, "")}?card=${card}&fmt=${fmt}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(450);
    const file = path.join(OUT, `${card}-${fmt}.png`);
    await page.screenshot({ path: file });
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`${card}-${fmt}.png ${size.width}x${size.height} ${kb} KB`);
    await page.close();
  }
}
await browser.close();
console.log("cards done");
