import crypto from "crypto";
import Database from "better-sqlite3";

const db = new Database("data/albasrawie.db");
const mk = (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),datetime('now','+1 day'))")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email);
  return t;
};
console.log("TEACHER=" + mk("teacher@demo.albasrawie.app"));
console.log("STUDENT=" + mk("student1@demo.albasrawie.app"));
