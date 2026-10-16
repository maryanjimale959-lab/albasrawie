import crypto from "crypto";
import { db, closeDb } from "../lib/db.js";

const mk = async (email) => {
  const t = crypto.randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,(SELECT id FROM users WHERE email=?),?)")
    .run(crypto.createHash("sha256").update(t).digest("hex"), email, new Date(Date.now() + 864e5).toISOString());
  return t;
};
const teacher = await mk("teacher@demo.albasrawie.app");
console.log("TEACHER=" + teacher);
const student = await mk("student1@demo.albasrawie.app");
console.log("STUDENT=" + student);
await closeDb();
