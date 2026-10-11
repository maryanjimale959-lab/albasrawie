import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";

const COOKIE = "albasrawie_session";
const DAYS = 14;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

export const hashPassword = (pw) => bcrypt.hashSync(pw, 12);
export const verifyPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + DAYS * 864e5);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)")
    .run(sha(token), userId, expires.toISOString());
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires,
  });
}

export function destroySession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
  cookies().delete(COOKIE);
}

export function getUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.role, u.status, u.avatar_url, u.time_zone, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row) return null;
  if (new Date(row.expires_at) < new Date() || row.status === "suspended") {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
    return null;
  }
  return row;
}

/** Backend guard for protected pages and actions. */
export function requireUser(role) {
  const user = getUser();
  if (!user) redirect("/login");
  const adminAsTeacher = role === "teacher" && user.role === "admin";
  if (role && user.role !== role && !adminAsTeacher) redirect("/dashboard");
  return user;
}
