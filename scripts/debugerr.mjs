// Grab the server-rendered error message for a path (dev mode only).
import crypto from "crypto";
import { db, closeDb } from "../lib/db.js";
const tok = async (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),?)")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email, new Date(Date.now() + 864e5).toISOString());
  return t;
};
const teacher = await tok("teacher@demo.albasrawie.app");
for (const path of ["/analytics", "/courses/1/materials"]) {
  const res = await fetch("http://localhost:3000" + path, { headers: { cookie: `albasrawie_session=${teacher}` } });
  const body = await res.text();
  const m = body.match(/"message":"([^"]+)"/);
  const st = body.match(/at eval[^"]{0,200}/);
  console.log(path, res.status);
  console.log("  msg:", m ? m[1].slice(0, 300) : "(none)");
  console.log("  at :", st ? st[0].slice(0, 200) : "");
}
await closeDb();
process.exit(0);
