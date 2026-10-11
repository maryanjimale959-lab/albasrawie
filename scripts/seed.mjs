// Creates the first platform administrator. Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";

const email = process.env.ADMIN_EMAIL, pw = process.env.ADMIN_PASSWORD;
if (!email || !pw || pw.length < 8) { console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars)."); process.exit(1); }
fs.mkdirSync("data", { recursive: true });
const db = new Database("data/albasrawie.db");
db.exec("SELECT 1");
const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (exists) { console.log("Admin already exists."); process.exit(0); }
try {
  db.prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Platform Administrator', ?, ?, 'admin')").run(email, bcrypt.hashSync(pw, 12));
  console.log("Administrator created.");
} catch (e) { console.error("Start the app once first so the database tables exist, then run seed again.", e.message); process.exit(1); }
