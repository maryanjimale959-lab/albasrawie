// Build a schema-only copy of the SQLite database for the demo/recording instance.
// Reads the live DB strictly read-only and copies CREATE statements, never rows.
import Database from "better-sqlite3";
import fs from "fs";

const SRC = "data/albasrawie.db";
const DST = ".video/demo/albasrawie.db";
fs.mkdirSync(".video/demo", { recursive: true });
if (fs.existsSync(DST)) fs.rmSync(DST, { force: true });

const src = new Database(SRC, { readonly: true });
const rows = src.prepare(
  "SELECT sql, type FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, rowid"
).all();
const counts = src.prepare("SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM courses) c").get();
src.close();

const dst = new Database(DST);
let made = 0;
for (const r of rows) { try { dst.exec(r.sql); made++; } catch (e) { console.log("skip:", e.message.slice(0, 80)); } }
const tables = dst.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n;
dst.close();
console.log(`schema objects executed: ${made}/${rows.length}; tables in demo db: ${tables}`);
console.log(`(live db had ${counts.u} users / ${counts.c} courses — none of that was copied)`);
