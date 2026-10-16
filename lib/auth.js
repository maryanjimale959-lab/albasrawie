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

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + DAYS * 864e5);
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)")
    .run(sha(token), userId, expires.toISOString());
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires,
  });
}

export async function destroySession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
  cookies().delete(COOKIE);
}

export async function getUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const row = await db.prepare(`
    SELECT u.id, u.full_name, u.email, u.role, u.status, u.avatar_url, u.time_zone, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row) return null;
  // Anything that is not active — suspended, or a teacher still awaiting
  // approval — cannot hold a working session.
  if (new Date(row.expires_at) < new Date() || row.status !== "active") {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
    return null;
  }
  return row;
}

/** Where each role actually works. An administrator's home is the console. */
export const homeFor = (role) => (role === "admin" ? "/admin" : "/dashboard");

/** Backend guard for protected pages and actions.
 *  `opts.next` keeps the address the visitor asked for, so a signed-out person
 *  who opens /admin is sent to the sign-in page and back to the console after
 *  they sign in — rather than being left standing at a bare login form. */
export async function requireUser(role, opts = {}) {
  const user = await getUser();
  if (!user) redirect(opts.next ? `/login?next=${encodeURIComponent(opts.next)}` : "/login");
  const adminAsTeacher = role === "teacher" && user.role === "admin";
  if (role && user.role !== role && !adminAsTeacher) redirect(homeFor(user.role));
  return user;
}

/** Guard for the console's own pages: signed in, whatever the role.
 *  `app/admin/layout.jsx` decides whether to show the console or to refuse the
 *  visitor in words on the same address — a page that bounces a teacher to
 *  `/dashboard` would look like the admin link "opened the teacher account".
 *  Every action in `app/admin/actions.js` still re-checks the role itself. */
export async function requireConsoleUser() {
  const user = await getUser();
  if (!user) redirect("/login?next=%2Fadmin");
  return user;
}
