// Geometry + legibility checks for the landing gallery bento grid.
import { chromium } from "playwright-core";

const BASE = "http://localhost:3125";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

for (const vp of [{ width: 1380, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.locator("#inside").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const g = await page.locator(".l-gallery").boundingBox();
  const boxes = await page.locator(".l-gallery .l-shot").evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })
  );
  // coverage ratio = sum(areas) / bounding area
  const area = boxes.reduce((a, b) => a + b.w * b.h, 0);
  const cover = area / (g.width * g.height);
  console.log(`vp=${vp.width} grid=${Math.round(g.width)}x${Math.round(g.height)} tiles=${cover.toFixed(3)} cover`);
  boxes.forEach((b, i) => console.log(`  shot-${i + 1}: ${b.w}x${b.h} @ (${b.x - Math.round(g.x)},${b.y - Math.round(g.y)})`));
  // caption contrast: computed color vs overlay gradient end
  const cap = await page.locator(".l-shot figcaption").first().evaluate((el) => getComputedStyle(el).color);
  console.log("  caption color:", cap);
  await ctx.close();
}
await browser.close();
