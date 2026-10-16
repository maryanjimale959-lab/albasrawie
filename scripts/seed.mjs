// Creates the first platform administrator. Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed
import bcrypt from "bcryptjs";
import { db, closeDb } from "../lib/db.js";

const email = process.env.ADMIN_EMAIL, pw = process.env.ADMIN_PASSWORD;
if (!email || !pw || pw.length < 8) { console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars)."); process.exit(1); }
// Opening the pool through lib/db.js builds any missing table, so there is no
// "run the app first" step any more.
try {
  const exists = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) { console.log("Admin already exists."); await closeDb(); process.exit(0); }
  await db.prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Platform Administrator', ?, ?, 'admin')").run(email, bcrypt.hashSync(pw, 12));
  console.log("Administrator created.");
} catch (e) { console.error("Could not reach MySQL — check MYSQL_URL or the MYSQL_* variables in .env (the tables are created on first connect), then run seed again.", e.message); process.exit(1); }
await closeDb();
