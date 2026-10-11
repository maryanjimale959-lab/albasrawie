import Database from "better-sqlite3";
const db = new Database("data/albasrawie.db");
const s = db.prepare("SELECT s.id, s.code, c.id AS cid FROM attendance_sessions s JOIN courses c ON c.id = s.course_id ORDER BY s.id DESC LIMIT 1").get();
const cc = db.prepare("SELECT course_code FROM courses LIMIT 1").get();
console.log("SESSION=" + s.id);
console.log("COURSE_ID=" + s.cid);
console.log("CODE=" + cc.course_code);
