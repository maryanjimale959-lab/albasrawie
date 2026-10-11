// Headless login test v2 for the live Albasrawie site; dumps the visible alert text.
const { chromium } = require("playwright-core");

(async () => {
  const url = process.argv[2];
  const email = process.argv[3];
  const password = process.argv[4];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const out = {};
  try {
    await page.goto(url + "/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500); // let hydration finish
    await page.fill('#email, input[name="email"]', email);
    await page.fill('#password, input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(6000);
    out.url = page.url();
    out.title = await page.title();
    const alert = await page.textContent(".auth-alert").catch(() => null);
    out.alert = alert && alert.trim();
    out.ok = /dashboard|courses|settings|students/.test(out.url) && !alert;
    await page.screenshot({ path: "live-login-check.png" });
  } catch (e) {
    out.error = e.message;
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(out.ok ? 0 : 1);
})();
