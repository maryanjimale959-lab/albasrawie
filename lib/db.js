import mysql from "mysql2/promise";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { TABLES, POST_STATEMENTS } from "./schema.js";

const req = typeof require !== "undefined" ? require : createRequire(import.meta.url);

/* ------------------------------------------------------------------ *
 * Albasrawie data layer — MySQL / MariaDB with automatic SQLite fallback
 *
 * Primary: MySQL / MariaDB (production server, whole school)
 * Fallback: SQLite via better-sqlite3 (local testing when MySQL is not running)
 * ------------------------------------------------------------------ */

const txStore = new AsyncLocalStorage();
const g = globalThis;

function getSqlite() {
  if (g.__albasrawieSqlite) return g.__albasrawieSqlite;
  const Database = req("better-sqlite3");
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, "albasrawie.db");
  const sdb = new Database(dbFile);
  sdb.pragma("busy_timeout = 5000");
  sdb.pragma("journal_mode = WAL");
  sdb.pragma("foreign_keys = ON");

  sdb.function("FIELD", { varargs: true }, (v, ...opts) => {
    const idx = opts.indexOf(v);
    return idx === -1 ? 999 : idx + 1;
  });
  sdb.function("GREATEST", { varargs: true }, (...args) => {
    const valid = args.filter((x) => x !== null && x !== undefined && x !== "");
    if (!valid.length) return null;
    return valid.sort().pop();
  });
  sdb.function("UTC_TIMESTAMP", () => {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  });

  g.__albasrawieSqlite = sdb;
  return sdb;
}

function translateSqlForSqlite(sql) {
  let s = sql;
  if (/attendance_records.*ON DUPLICATE KEY UPDATE/is.test(s)) {
    s = s.replace(
      /ON DUPLICATE KEY UPDATE.*/is,
      `ON CONFLICT(session_id, student_id) DO UPDATE SET status=excluded.status, method=excluded.method, marked_at=datetime('now'), marked_by=excluded.marked_by, note=COALESCE(excluded.note, attendance_records.note)`
    );
  }
  if (/student_profiles.*ON DUPLICATE KEY UPDATE/is.test(s)) {
    s = s.replace(
      /ON DUPLICATE KEY UPDATE.*/is,
      `ON CONFLICT(user_id) DO UPDATE SET student_id=excluded.student_id, class_name=excluded.class_name`
    );
  }
  s = s.replace(/INSERT IGNORE INTO/gi, "INSERT OR IGNORE INTO");
  return s;
}

/** Connection settings, from a URL or from discrete MYSQL_* variables. */
export function poolOptions() {
  const fromEnv = process.env.MYSQL_URL || process.env.DATABASE_URL || "";
  const url = /^mysql(?!db):\/\//i.test(fromEnv.trim()) ? fromEnv.trim() : "";

  const target = url
    ? { uri: url }
    : {
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || "albasrawie",
      };

  const useSsl =
    process.env.MYSQL_SSL === "true" ||
    process.env.MYSQL_SSL === "1" ||
    /ssl(-mode)?=/i.test(url);

  return {
    ...target,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
    queueLimit: 0,
    dateStrings: true,
    decimalNumbers: true,
    enableKeepAlive: true,
    connectTimeout: 5000,
  };
}

/** Statements that are safe to re-run on every boot. */
const IGNORABLE = new Set([
  "ER_TABLE_EXISTS_ERROR", // 1050
  "ER_DUP_FIELDNAME", // 1060
  "ER_DUP_KEYNAME", // 1061
  "ER_CANT_DROP_FIELD_OR_KEY", // 1091
]);

function translateError(e) {
  if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) {
    const key = (String(e.sqlMessage || "").match(/for key '([^']+)'/) || [])[1] || "";
    const err = new Error(`UNIQUE constraint failed${key ? `: ${key}` : ""}`);
    err.code = "SQLITE_CONSTRAINT_UNIQUE";
    err.isDuplicate = true;
    err.cause = e;
    return err;
  }
  if (e && (e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146)) {
    const err = new Error(`no such table: ${String(e.sqlMessage || "").split("'").pop()}`);
    err.isMissingTable = true;
    err.cause = e;
    return err;
  }
  return e;
}

async function createPool() {
  const pool = await mysql.createPool(poolOptions());
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'", (e) => {
      if (e) console.error("[db] could not pin session time_zone to UTC:", e.message);
    });
  });
  for (const sql of [...TABLES, ...POST_STATEMENTS]) {
    try {
      await pool.query(sql);
    } catch (e) {
      if (IGNORABLE.has(e.code)) continue;
      throw e;
    }
  }
  return pool;
}

/** Resolves to the shared pool, or falls back to local SQLite if MySQL is unavailable. */
async function getPool() {
  if (g.__albasrawieUseSqlite) return null;
  if (process.env.USE_SQLITE === "true") {
    g.__albasrawieUseSqlite = true;
    return null;
  }
  if (!g.__albasrawiePool) {
    g.__albasrawiePool = createPool().catch((e) => {
      g.__albasrawiePool = null;
      if (e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT" || e.code === "ENOTFOUND") {
        console.warn(`[db] MySQL not running (${e.message}). Using local SQLite database (data/albasrawie.db).`);
        g.__albasrawieUseSqlite = true;
        return null;
      }
      throw e;
    });
  }
  return g.__albasrawiePool;
}

async function run(sql, params = []) {
  const pool = await getPool();
  if (g.__albasrawieUseSqlite || !pool) {
    const s = getSqlite();
    const cleanSql = translateSqlForSqlite(sql);
    const stmt = s.prepare(cleanSql);
    const trimmed = cleanSql.trim().toUpperCase();
    if (trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA")) {
      const rows = stmt.all(...params);
      return [rows];
    } else {
      const res = stmt.run(...params);
      return [{ affectedRows: res.changes, insertId: Number(res.lastInsertRowid) }];
    }
  }
  const conn = txStore.getStore();
  if (conn) return conn.query(sql, params);
  return pool.query(sql, params);
}

function prepare(sql) {
  return {
    async get(...params) {
      try {
        const [rows] = await run(sql, params);
        return rows && rows.length ? rows[0] : undefined;
      } catch (e) {
        throw translateError(e);
      }
    },
    async all(...params) {
      try {
        const [rows] = await run(sql, params);
        return rows || [];
      } catch (e) {
        throw translateError(e);
      }
    },
    async run(...params) {
      try {
        const [res] = await run(sql, params);
        return {
          changes: Number(res?.affectedRows ?? res?.changes ?? 0),
          lastInsertRowid: Number(res?.insertId ?? res?.lastInsertRowid ?? 0),
        };
      } catch (e) {
        throw translateError(e);
      }
    },
    async all_(...params) {
      return this.all(...params);
    },
  };
}

function transaction(fn) {
  return async function transactional(...args) {
    const pool = await getPool();
    if (g.__albasrawieUseSqlite || !pool) {
      const s = getSqlite();
      s.exec("BEGIN IMMEDIATE");
      try {
        const out = await fn(...args);
        s.exec("COMMIT");
        return out;
      } catch (err) {
        try { s.exec("ROLLBACK"); } catch {}
        throw err;
      }
    }
    if (txStore.getStore()) return fn(...args);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await txStore.run(conn, () => fn(...args));
      await conn.commit();
      return out;
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      throw e;
    } finally {
      conn.release();
    }
  };
}

async function exec(script) {
  const pool = await getPool();
  if (g.__albasrawieUseSqlite || !pool) {
    const s = getSqlite();
    s.exec(script);
    return;
  }
  const conn = txStore.getStore() || pool;
  for (const statement of script.split(/;\s*(?:\r?\n|$)/)) {
    const sql = statement.trim();
    if (sql) await conn.query(sql);
  }
}

export const db = { prepare, transaction, exec, getPool };

export async function closeDb() {
  if (g.__albasrawiePool) {
    const pool = await g.__albasrawiePool;
    if (pool && pool.end) await pool.end();
    g.__albasrawiePool = null;
  }
  if (g.__albasrawieSqlite) {
    try { g.__albasrawieSqlite.close(); } catch {}
    g.__albasrawieSqlite = null;
  }
}

export function audit(userId, action, target, details) {
  const pending = db
    .prepare("INSERT INTO audit_logs (user_id, action, target, details) VALUES (?,?,?,?)")
    .run(userId ?? null, action, target ?? null, details ? JSON.stringify(details) : null);
  pending.catch((e) => console.error("[audit] write failed:", e.message));
  return pending;
}
