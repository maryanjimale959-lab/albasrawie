import crypto from "crypto";
import { db, closeDb } from "../lib/db.js";
import { chromium } from "playwright-core";

const t = crypto.randomBytes(32).toString("base64url");
await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),?)")
  .run(crypto.createHash("sha256").update(t).digest("hex"), "teacher@demo.albasrawie.app", new Date(Date.now() + 864e5).toISOString());

const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
for (const host of ["localhost", "192.168.18.29"]) {
  const c = await b.newContext();
  await c.addCookies([{ name: "albasrawie_session", value: t, domain: host, path: "/" }]);
  const p = await c.newPage();
  await p.goto(`http://${host}:3125/courses/1`, { waitUntil: "networkidle" });
  const link = (await p.locator(".link-box").first().textContent().catch(() => "<none>")).trim();
  const code = (await p.locator(".code").first().textContent().catch(() => "<none>")).trim();
  const qr = await p.locator(".share-qr img").first().getAttribute("src").catch(() => "");
  console.log(host.padEnd(15), "code=" + code, "| link=" + link, "| qr=" + (qr ? "yes" : "no"));
  await c.close();
}
await b.close();
await closeDb();
