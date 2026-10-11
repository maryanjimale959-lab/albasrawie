const { chromium } = require("playwright-core");
const BASE = "https://albasrawie-production.up.railway.app";
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const p = await b.newPage();
  const out = {};
  async function login(email, pw) {
    await p.goto(BASE + "/login", { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.fill('#email, input[name="email"]', email);
    await p.fill('#password, input[name="password"]', pw);
    await p.click('button[type="submit"]');
    await p.waitForTimeout(4500);
  }
  try {
    await login("teacher@demo.albasrawie.app", "Demo1234!");
    out.teacherUrl = p.url();
    await p.goto(BASE + "/courses", { waitUntil: "networkidle" });
    const body = ((await p.textContent("body")) || "").replace(/\s+/g, " ");
    out.coursesShown = (body.match(/course/gi) || []).length > 0;
    out.courseNames = [...body.matchAll(/[A-Z][a-zA-Z ]{4,30}/g)].slice(0, 0);
    await p.screenshot({ path: "qa-live-teacher-courses.png" });
    // fresh context: admin
    const ctx = await b.newContext();
    const pa = await ctx.newPage();
    await pa.goto(BASE + "/login", { waitUntil: "networkidle" });
    await pa.waitForTimeout(1200);
    await pa.fill('#email, input[name="email"]', "maryanjimale959@gmail.com");
    await pa.fill('#password, input[name="password"]', "no4RU8gS5fgM");
    await pa.click('button[type="submit"]');
    await pa.waitForTimeout(4500);
    await pa.goto(BASE + "/courses/new", { waitUntil: "networkidle" });
    out.adminCoursesNewUrl = pa.url();
    out.adminCanCreate = !!(await pa.$('input[name="name"]'));
  } catch (e) {
    out.error = e.message.slice(0, 200);
  }
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
