// Grab the server-rendered error message for a path (dev mode only).
import crypto from "crypto";
import Database from "better-sqlite3";
const db = new Database("data/albasrawie.db");
const tok = (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),datetime('now','+1 day'))")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email);
  return t;
};
const teacher = tok("teacher@demo.albasrawie.app");
for (const path of ["/analytics", "/courses/1/materials"]) {
  const res = await fetch("http://localhost:3000" + path, { headers: { cookie: `albasrawie_session=${teacher}` } });
  const body = await res.text();
  const m = body.match(/"message":"([^"]+)"/);
  const st = body.match(/at eval[^"]{0,200}/);
  console.log(path, res.status);
  console.log("  msg:", m ? m[1].slice(0, 300) : "(none)");
  console.log("  at :", st ? st[0].slice(0, 200) : "");
}
process.exit(0);
