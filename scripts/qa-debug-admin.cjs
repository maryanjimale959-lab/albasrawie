const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const p = await b.newPage();
  await p.goto("https://albasrawie-production.up.railway.app/login", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.fill('#email, input[name="email"]', "maryanjimale959@gmail.com");
  await p.fill('#password, input[name="password"]', "no4RU8gS5fgM");
  await p.click('button[type="submit"]');
  await p.waitForTimeout(6000);
  console.log("url:", p.url());
  const alert = await p.textContent(".auth-alert").catch(() => null);
  console.log("alert:", alert && alert.trim());
  await p.goto("https://albasrawie-production.up.railway.app/courses/new", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  console.log("courses/new url:", p.url());
  console.log("has name input:", (await p.$('input[name="name"]')) ? "yes" : "no");
  console.log("h1:", await p.textContent("h1").catch(() => ""));
  const body = ((await p.textContent("body")) || "").replace(/\s+/g, " ").trim().slice(0, 300);
  console.log("body:", body);
  await b.close();
})();
