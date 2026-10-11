// Pushes the local SQLite db + uploads to the live server's temp migration endpoint.
const fs = require("fs");
const Database = require("better-sqlite3");

(async () => {
  const secret = process.env.MIGSEC;
  const db = new Database("data/albasrawie.db");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
  const files = fs.readdirSync("data/uploads").map((name) => ({ name, b64: fs.readFileSync("data/uploads/" + name).toString("base64") }));
  const payload = { db: fs.readFileSync("data/albasrawie.db").toString("base64"), files };
  console.log("payload MB:", (JSON.stringify(payload).length / 1e6).toFixed(2));
  const res = await fetch("https://albasrawie-production.up.railway.app/api/import", {
    method: "POST",
    headers: { "content-type": "application/json", "x-migration-secret": secret },
    body: JSON.stringify(payload),
  });
  console.log(res.status, await res.text());
})();
