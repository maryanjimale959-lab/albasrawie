// Creates the platform administrator on the live server once, from ADMIN_EMAIL/ADMIN_PASSWORD.
// Plain CommonJS so it can be loaded outside the webpack bundle at server boot, and it keeps its
// own short-lived MySQL connection instead of importing the app's data layer — the two must not
// fight over module formats at boot.
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

/** Same variables lib/db.js reads; duplicated on purpose so this file has no app imports. */
function connectionOptions() {
  const fromEnv = process.env.MYSQL_URL || process.env.DATABASE_URL || "";
  const url = /^mysql(?!db):\/\//i.test(fromEnv.trim()) ? fromEnv.trim() : "";
  const useSsl =
    process.env.MYSQL_SSL === "true" ||
    process.env.MYSQL_SSL === "1" ||
    /ssl(-mode)?=/i.test(url);

  const sslOpt = useSsl ? { ssl: { rejectUnauthorized: false } } : {};
  if (url) return { uri: url, connectTimeout: 20000, ...sslOpt };
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "albasrawie",
    connectTimeout: 20000,
    ...sslOpt,
  };
}

/**
 * Returns true when there is nothing left to do, false when the caller should retry.
 * The app builds its own tables on the first request, so at a cold boot the users
 * table may not exist yet — that is a "try again shortly", not a failure.
 */
async function trySeed() {
  const email = process.env.ADMIN_EMAIL;
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 8) return true; // nothing configured to seed
  let conn;
  try {
    conn = await mysql.createConnection(connectionOptions());
    const [tables] = await conn.query(
      "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'"
    );
    if (!tables.length) return false;
    const [rows] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (rows.length) return true;
    await conn.query(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Platform Administrator', ?, ?, 'admin')",
      [email, bcrypt.hashSync(pw, 12)]
    );
    console.log("Administrator created.");
    return true;
  } catch (e) {
    return false;
  } finally {
    try { if (conn) await conn.end(); } catch {}
  }
}

exports.startAdminBootstrap = () => {
  const tick = () =>
    trySeed()
      .then((done) => { if (done && timer) clearInterval(timer); })
      .catch(() => {});
  let timer = null;
  tick().then((done) => { if (done) return; timer = setInterval(tick, 10000); });
};
