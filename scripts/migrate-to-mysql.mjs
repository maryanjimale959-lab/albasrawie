/*
 * One-time move from the old SQLite file to MySQL / MariaDB.
 *
 *   npm run migrate:mysql                        # reads data/albasrawie.db
 *   npm run migrate:mysql -- --from ../backup.db
 *   npm run migrate:mysql -- --dry-run           # counts only, writes nothing
 *   npm run migrate:mysql -- --table users,courses
 *
 * It reads the connection settings from the same environment variables the app uses
 * (MYSQL_URL / DATABASE_URL, or MYSQL_HOST, _PORT, _USER, _PASSWORD, _DATABASE),
 * creates the MySQL schema if it is not there yet, then copies every table that
 * exists on both sides.
 *
 * Primary keys are copied as-is, so an id keeps pointing at the same student, course
 * or session afterwards — nothing in the app references a row by anything other than
 * those ids. A table that already holds rows is replaced rather than appended to,
 * because running this twice must leave the same database behind.
 *
 * Uploads live on the filesystem (data/uploads) and are not touched here; copy that
 * folder to the server alongside the database.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { db, closeDb } from "../lib/db.js";
import { TABLES } from "../lib/schema.js";

const argv = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : fallback;
};

const DRY = argv.includes("--dry-run");
const from = path.resolve(valueOf("from", path.join("data", "albasrawie.db")));
const only = valueOf("table", "").split(",").map((s) => s.trim()).filter(Boolean);

if (!fs.existsSync(from)) {
  console.error(`No SQLite file at ${from}\nPass --from <path> if it lives somewhere else.`);
  process.exit(1);
}

// Table names come from the file itself; anything unexpected is refused rather than interpolated.
const safe = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unexpected table name: ${name}`);
  return name;
};

const src = new Database(from, { readonly: true });
const sqliteTables = src
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map((r) => safe(r.name));

const sqliteColumns = (table) => src.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
const quote = (id) => `\`${String(id).replace(/`/g, "``")}\``;

let conn = null; // set once the MySQL connection is open; used for value escaping
const rowsOf = (table, cols) =>
  src.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${table}"`).all();
const countOf = (table) => src.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;

(async () => {
  const pool = await db.getPool(); // opening the pool also creates any missing tables
  conn = await pool.getConnection();
  const [found] = await conn.query(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE()"
  );
  const have = new Set(found.map((r) => String(r.name).toLowerCase()));

  // Copy in the schema's own order so a parent row always exists before its children.
  const order = TABLES.map((sql) => sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]);
  const rank = (t) => { const i = order.indexOf(t); return i === -1 ? 999 : i; };
  const tables = (only.length ? sqliteTables.filter((t) => only.includes(t)) : sqliteTables)
    .sort((a, b) => rank(a) - rank(b));

  console.log(DRY ? "\nDRY RUN — nothing will be written\n" : "");
  /* A desktop SQLite file can hold values a strict MySQL would reject (an empty
     string where a date belongs, a zero timestamp). Widen the mode for this import
     so the data lands and is reported on, instead of the script stopping at row one. */
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  if (!DRY) await conn.query("SET SESSION sql_mode = 'NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");

  const summary = [];
  let failed = false;
  for (const table of tables) {
    if (!have.has(table.toLowerCase())) { summary.push([table, countOf(table), "-", "not in MySQL"]); continue; }
    const dst = await mysqlColumns(table);
    const shared = sqliteColumns(table).filter((c) => dst.includes(c.toLowerCase()));
    const skipped = sqliteColumns(table).filter((c) => !shared.includes(c));
    const total = countOf(table);
    if (!shared.length) { summary.push([table, total, 0, "no columns in common"]); continue; }
    if (DRY) { summary.push([table, total, total, "would copy"]); continue; }

    try {
      await conn.query(`DELETE FROM ${quote(table)}`);
      const rows = rowsOf(table, shared);
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const values = chunk
          .map((r) => `(${shared.map((c) => (r[c] === undefined ? "NULL" : conn.escape(r[c]))).join(", ")})`)
          .join(", ");
        await conn.query(`INSERT INTO ${quote(table)} (${shared.map(quote).join(", ")}) VALUES ${values}`);
      }
      const [[check]] = await conn.query(`SELECT COUNT(*) AS n FROM ${quote(table)}`);
      const ok = Number(check.n) === rows.length;
      summary.push([table, rows.length, check.n, ok ? "ok" : "COUNT MISMATCH"]);
      if (!ok) failed = true;
      if (skipped.length) console.log(`  ${table}: left behind ${skipped.join(", ")}`);
    } catch (e) {
      summary.push([table, total, 0, `FAILED: ${e.sqlMessage || e.message}`]);
      failed = true;
    }
  }

  if (!DRY && !failed) {
    /* Put every auto-increment counter past the copied ids so rows created after the
       move never collide with rows that came from SQLite. */
    for (const table of tables) {
      if (!have.has(table.toLowerCase())) continue;
      const cols = await mysqlColumns(table);
      if (!cols.includes("id")) continue;
      const [[r]] = await conn.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM ${quote(table)}`);
      if (Number(r.next) > 1) await conn.query(`ALTER TABLE ${quote(table)} AUTO_INCREMENT = ${Number(r.next)}`);
    }
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  conn.release();
  src.close();

  const pad = (s, n) => String(s ?? "").padEnd(n);
  console.log(pad("table", 26) + pad("sqlite", 9) + pad("mysql", 9) + "result");
  console.log("-".repeat(74));
  for (const r of summary) console.log(pad(r[0], 26) + pad(r[1], 9) + pad(r[2], 9) + r[3]);

  await closeDb();
  if (failed) { console.error("\nSome tables did not come across — fix them and run this again."); process.exit(1); }
  console.log(DRY ? "\nNothing written." : `\nMigrated ${tables.length} tables from ${from}.`);
  console.log("Uploads were not moved: copy data/uploads to the server as well.");
})().catch(async (e) => {
  console.error("\nMigration stopped:", e.sqlMessage || e.message);
  if (e.code) console.error("MySQL error:", e.code);
  try { await closeDb(); } catch { /* pool never opened */ }
  process.exit(1);
});

async function mysqlColumns(table) {
  const [rows] = await conn.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  );
  return rows.map((r) => String(r.name).toLowerCase());
}
