// Creates the platform administrator on the live server once, from ADMIN_EMAIL/ADMIN_PASSWORD.
// Plain CommonJS so it can be loaded outside the webpack bundle at server boot.
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

function openDb() {
  const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return new Database(path.join(dir, "albasrawie.db"));
}

function trySeed() {
  const email = process.env.ADMIN_EMAIL, pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 8) return true; // nothing configured to seed
  let db;
  try {
    db = openDb();
    if (!db.prepare("SELECT name FROM sqlite_master WHERE name = 'users'").get()) return false;
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return true;
    db.prepare(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Platform Administrator', ?, ?, 'admin')"
    ).run(email, bcrypt.hashSync(pw, 12));
    console.log("Administrator created.");
    return true;
  } catch (e) {
    return false;
  } finally {
    try { if (db) db.close(); } catch {}
  }
}

exports.startAdminBootstrap = () => {
  if (trySeed()) return;
  const timer = setInterval(() => {
    if (trySeed()) clearInterval(timer);
  }, 10000);
};
