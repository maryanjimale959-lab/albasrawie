import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "./db";
import { sendMail } from "./mail";

/* Sign-up email codes: six digits, ten minutes, five tries, one new code a minute.
 * The browser holding the sign-up gets a random token in a short-lived cookie;
 * the code and the token are stored only as hashes. */

const COOKIE = "albasrawie_verify";
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const codeHash = (userId, code) => sha(`${userId}:${code}`);

/** "ma•••••@gmail.com" — enough for the person to recognise their address. */
export const maskEmail = (email) =>
  String(email).replace(/^(.{1,2})[^@]*(@.*)$/, (_, head, domain) => `${head}•••••${domain}`);

function message(name, code) {
  const text = [
    `Hello ${name},`,
    "",
    `Your Albasrawie verification code is: ${code}`,
    "",
    `It expires in ${CODE_MINUTES} minutes. If you did not create an account, ignore this email.`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111">
    <p>Hello ${name.replace(/[<>&"]/g, "")},</p>
    <p>Your Albasrawie verification code is:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
    <p>It expires in ${CODE_MINUTES} minutes. If you did not create an account, ignore this email.</p>
  </div>`;
  return { text, html };
}

/** Issues a fresh code for this account, emails it, and marks this browser as the one verifying. */
export async function sendCode(user) {
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + CODE_MINUTES * 60e3);
  await db.prepare("DELETE FROM email_codes WHERE user_id = ?").run(user.id);
  await db.prepare("INSERT INTO email_codes (user_id, code_hash, token_hash, sent_at, expires_at) VALUES (?,?,?,?,?)")
    .run(user.id, codeHash(user.id, code), sha(token), now.toISOString(), expires.toISOString());
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60,
  });
  const { text, html } = message(user.full_name, code);
  return await sendMail({ to: user.email, subject: `${code} is your Albasrawie verification code`, text, html });
}

/** The account this browser is verifying, or null. */
export async function pendingVerification() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const row = await db.prepare(`
    SELECT c.user_id, c.code_hash, c.sent_at, c.expires_at, c.attempts, u.email, u.full_name, u.email_verified
    FROM email_codes c JOIN users u ON u.id = c.user_id WHERE c.token_hash = ?`).get(sha(token));
  if (!row || Number(row.email_verified) === 1) return null;
  return row;
}

/** Sends a new code to the account this browser is verifying, at most once a minute. */
export async function resendCode() {
  const p = await pendingVerification();
  if (!p) return { error: "This sign-up has expired. Sign in with your email and password to get a new code." };
  const wait = RESEND_SECONDS - Math.floor((Date.now() - new Date(p.sent_at).getTime()) / 1000);
  if (wait > 0) return { error: `Wait ${wait} seconds before asking for another code.` };
  const sent = await sendCode({ id: p.user_id, email: p.email, full_name: p.full_name });
  if (sent.error) return { error: `${sent.error} Try again in a few minutes.` };
  return { ok: `A new code is on its way to ${maskEmail(p.email)}.` };
}

/** Checks a typed code. On success the account is marked verified and the code is spent. */
export async function checkCode(raw) {
  const p = await pendingVerification();
  if (!p) return { error: "This sign-up has expired. Sign in with your email and password to get a new code." };
  const code = String(raw || "").replace(/\D/g, "");
  if (code.length !== 6) return { error: "Enter the 6-digit code from the email." };
  if (new Date(p.expires_at) < new Date()) return { error: "That code has expired. Send a new code and use the newest email." };
  if (Number(p.attempts) >= MAX_ATTEMPTS) return { error: "Too many wrong codes. Send a new code and try again." };
  const ok = crypto.timingSafeEqual(Buffer.from(codeHash(p.user_id, code)), Buffer.from(p.code_hash));
  if (!ok) {
    await db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?").run(p.user_id);
    const left = MAX_ATTEMPTS - Number(p.attempts) - 1;
    return { error: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Send a new code and try again." };
  }
  await db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(p.user_id);
  await db.prepare("DELETE FROM email_codes WHERE user_id = ?").run(p.user_id);
  cookies().delete(COOKIE);
  return { ok: true, userId: p.user_id };
}
