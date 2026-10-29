import nodemailer from "nodemailer";

/* Outgoing mail over the SMTP mailbox set in SMTP_* (see .env.example).
 * Without SMTP_HOST, development prints the message to the server log so the
 * sign-up flow can still be walked through; production refuses, because a code
 * nobody receives is a locked door. */

const g = globalThis;

function transport() {
  if (g.__albasrawieMail) return g.__albasrawieMail;
  const port = Number(process.env.SMTP_PORT || 587);
  g.__albasrawieMail = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined,
  });
  return g.__albasrawieMail;
}

/** Sends one message. Resolves to { ok: true } or { error } — never throws. */
export async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === "production") {
      console.error("[mail] SMTP_HOST is not set, so no email can be sent.");
      return { error: "Email is not set up on this server yet." };
    }
    console.log(`[mail] (dev, not sent) to=${to} subject=${subject}\n${text}`);
    return { ok: true };
  }
  try {
    await transport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to, subject, text, html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[mail] send failed:", e.message);
    return { error: "The email could not be sent." };
  }
}
