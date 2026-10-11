// Live end-to-end smoke: register a student, create a course as admin, join course as student.
const { chromium } = require("playwright-core");
const BASE = "https://albasrawie-production.up.railway.app";
const ADMIN = ["maryanjimale959@gmail.com", "no4RU8gS5fgM"];
const stamp = Date.now();
const STU = { name: "Qa Student " + stamp, sid: "QA" + stamp, cls: "Test Group", email: `qa.student.${stamp}@example.com`, pw: "QaPassw0rd" };

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const log = (...a) => console.log(...a);
  const errors = [];

  async function login(ctx, email, pw) {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
    await p.goto(BASE + "/login", { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.fill('#email, input[name="email"]', email);
    await p.fill('#password, input[name="password"]', pw);
    await p.click('button[type="submit"]');
    await p.waitForTimeout(4000);
    return p;
  }

  try {
    // 1) student registration
    const ctxS = await browser.newContext();
    const ps = await ctxS.newPage();
    ps.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
    await ps.goto(BASE + "/register", { waitUntil: "networkidle" });
    await ps.fill('input[name="full_name"]', STU.name);
    await ps.fill('input[name="student_id"]', STU.sid);
    await ps.fill('input[name="class_name"]', STU.cls);
    await ps.fill('input[name="email"]', STU.email);
    await ps.fill('input[name="password"]', STU.pw);
    await ps.fill('input[name="confirm"]', STU.pw);
    await ps.click('button[type="submit"]');
    await ps.waitForTimeout(5000);
    log("register student ->", ps.url());

    // 2) admin creates a course
    const ctxA = await browser.newContext();
    const pa = await login(ctxA, ...ADMIN);
    await pa.goto(BASE + "/courses/new", { waitUntil: "networkidle" });
    await pa.fill('input[name="name"]', "Live Test Course");
    await pa.fill('textarea[name="description"]', "Automated smoke test course.");
    await pa.click('button[type="submit"]');
    await pa.waitForTimeout(5000);
    log("admin create course ->", pa.url());
    const alert = await pa.textContent(".form-error, .alert, [role=alert]").catch(() => null);
    if (alert) log("course form alert:", alert.trim().slice(0, 200));

    // 3) find join code on course page, student joins
    const courseBody = await pa.textContent("body");
    const codeMatch = courseBody.match(/#?([A-Z0-9]{6,10})/);
    if (codeMatch) {
      await ps.goto(BASE + "/join/" + codeMatch[1], { waitUntil: "networkidle" });
      await ps.waitForTimeout(2500);
      const b = await ps.textContent(".alert, [role=alert], form").catch(() => "");
      const btn = await ps.$('button[type="submit"]');
      if (btn) { await btn.click(); await ps.waitForTimeout(4000); }
      log("student join ->", ps.url());
      const coursesHtml = await ps.evaluate(async () => {
        const r = await fetch("/courses", { credentials: "include" });
        return (await r.text()).includes("Live Test Course");
      }).catch(() => "n/a");
      log("course visible to student:", coursesHtml);
    } else {
      log("no join code found in course page");
    }
  } catch (e) {
    errors.push("fatal: " + e.message);
  }
  log("errors:", JSON.stringify(errors, null, 2));
  await browser.close();
})();
