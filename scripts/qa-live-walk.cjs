// Headless walkthrough of the live Albasrawie site: logs in as admin, visits every main page,
// records HTTP status problems, console errors, and failed requests.
const { chromium } = require("playwright-core");

const BASE = "https://albasrawie-production.up.railway.app";
const EMAIL = process.argv[2];
const PW = process.argv[3];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const report = { pages: [], consoleErrors: [], failedRequests: [] };
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 400) report.failedRequests.push(r.status() + " " + r.url().replace(BASE, "")); });
  page.on("requestfailed", (r) => report.failedRequests.push("FAILED " + r.url().replace(BASE, "")));

  try {
    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.fill('#email, input[name="email"]', EMAIL);
    await page.fill('#password, input[name="password"]', PW);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    report.loginUrl = page.url();

    for (const path of ["/dashboard", "/courses", "/students", "/analytics", "/attendance", "/settings"]) {
      try {
        const resp = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
        const body = (await page.textContent("body") || "").slice(0, 400);
        const broken = /application error|internal server error|something went wrong|this page could not be found/i.test(body);
        report.pages.push({ path, status: resp && resp.status(), broken, h1: await page.textContent("h1").catch(() => "") });
      } catch (e) {
        report.pages.push({ path, error: e.message.slice(0, 150) });
      }
    }
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.screenshot({ path: "qa-live-home.png", fullPage: false });
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await page.screenshot({ path: "qa-live-dashboard.png", fullPage: false });
  } catch (e) {
    report.fatal = e.message;
  }
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
