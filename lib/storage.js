import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "./db";

const UPLOAD_DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif",
  "text/plain", "text/markdown", "application/zip",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4", "video/webm",
]);
export const MAX_FILE_MB = 20;

/** Save a File from FormData into access-controlled storage. Returns the files row or { error }. */
export async function saveUpload(file, { ownerId, courseId = null, kind = "misc" }) {
  if (!file || typeof file.size !== "number" || file.size === 0) return { error: "No file was selected." };
  if (file.size > MAX_FILE_MB * 1024 * 1024) return { error: `Files must be ${MAX_FILE_MB} MB or smaller.` };
  const name = (file.name || "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 150);
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED.has(file.type) && !/\.(pdf|png|jpe?g|webp|gif|txt|md|zip|rar|7z|tar|gz|docx?|pptx?|xlsx?|mp4|webm|csv|json|py|js|ts|html|css)$/.test(ext))
    return { error: "That file type isn't supported. Use PDF, Office, image, video, zip/archive, code, txt or md." };
  const stored = crypto.randomBytes(16).toString("hex") + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
  const id = Number((await db.prepare("INSERT INTO files (owner_id, course_id, kind, stored_name, original_name, mime, size) VALUES (?,?,?,?,?,?,?)")
    .run(ownerId, courseId, kind, stored, name, file.type || null, file.size)).lastInsertRowid);
  return { id, name, url: `/api/f/${id}` };
}

export const getFile = async (id) => await db.prepare("SELECT * FROM files WHERE id = ?").get(id);
export const uploadPath = (storedName) => path.join(UPLOAD_DIR, path.basename(storedName));

/**
 * Access rules for downloads:
 * - the owner can always open their file;
 * - a teacher can open files attached to a course they teach;
 * - a student can open a course file (material, or an attachment on a published
 *   assignment) for a course they're enrolled in;
 * - a student can open their own submission; the course teacher can open any submission in their course;
 * - admins can open anything.
 * The rules are pure, but checking them needs queries, so this is async.
 */
export async function canAccessFile(user, row) {
  if (!row) return false;
  if (row.kind === "avatar") return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (row.owner_id === user.id) return true;
  if (!row.course_id) return false;
  const course = await db.prepare("SELECT teacher_id FROM courses WHERE id = ?").get(row.course_id);
  if (!course) return false;
  if (course.teacher_id === user.id && user.role === "teacher") return true;
  if (user.role === "student") {
    const enrolled = !!(await db.prepare("SELECT 1 FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'").get(user.id, row.course_id));
    if (!enrolled) return false;
    if (row.kind === "material") return true;
    const id = String(row.id);
    // attachment on a published assignment / project in the student's course
    if (await db.prepare("SELECT 1 FROM assignments WHERE course_id = ? AND published = 1 AND (attachment_path = ? OR attachment_path = ?)").get(row.course_id, id, row.stored_name)) return true;
    if (await db.prepare("SELECT 1 FROM materials WHERE course_id = ? AND (file_path = ? OR file_path = ?)").get(row.course_id, id, row.stored_name)) return true;
    return false;
  }
  return false;
}
