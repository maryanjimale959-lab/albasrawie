"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, audit } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { courseForTeacher } from "@/lib/guards";
import { notifyCourse } from "@/lib/notify";
import { saveUpload } from "@/lib/storage";
import { getMaterial } from "@/lib/materials";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

function teacherUser() {
  const u = requireUser();
  if (u.role !== "teacher" && u.role !== "admin") redirect("/dashboard");
  if (u.role === "teacher" && u.status !== "active") redirect("/dashboard");
  return u;
}

const materialSchema = z.object({
  title: z.string().min(2, "Enter a title for the material.").max(150),
  description: z.string().max(4000, "Keep the description under 4000 characters.").optional(),
  module: z.string().max(80).optional(),
  url: z.string()
    .max(600, "That link is too long.")
    .refine((v) => v === "" || /^https?:\/\/.+/.test(v), "Links must start with http:// or https://.")
    .optional(),
});

/**
 * Add a material: exactly one of file upload, external URL, or a text note
 * (description only). Files are stored via saveUpload with kind "material"
 * and file_path keeps the returned files-row id (served by /api/f/<id>).
 */
export async function addMaterial(_prev, fd) {
  const user = teacherUser();
  const courseId = Number(fd.get("course_id"));
  const course = Number.isInteger(courseId) ? courseForTeacher(user, courseId) : null;
  if (!course) return { error: "Course not found or not yours to teach." };
  const r = materialSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  const description = d.description || null;
  const url = d.url || null;
  const file = fd.get("file");
  const hasFile = !!file && typeof file === "object" && typeof file.size === "number" && file.size > 0;
  if (!hasFile && !url && !description)
    return { error: "Add a file, paste a link, or write a note — a material needs one of them." };

  let stored = null;
  if (hasFile) {
    stored = await saveUpload(file, { ownerId: user.id, courseId: course.id, kind: "material" });
    if (stored.error) return { error: stored.error };
  }

  const id = Number(db.prepare(`
    INSERT INTO materials (course_id, teacher_id, title, description, url, file_path, file_name, module, published)
    VALUES (?,?,?,?,?,?,?,?,1)`)
    .run(course.id, user.id, d.title, description, url, stored ? String(stored.id) : null, stored ? stored.name : null, d.module || null)
    .lastInsertRowid);

  audit(user.id, "material.create", `material:${id}`, { courseId: course.id, hasFile: !!stored, url: !!url });
  notifyCourse(course.id, "material", `New material: ${d.title}`, `/courses/${course.id}/materials`, { excludeUser: user.id });
  revalidatePath(`/courses/${course.id}/materials`);
  return { error: null };
}

export async function toggleMaterialPublish(fd) {
  const user = teacherUser();
  const m = getMaterial(Number(fd.get("material_id")));
  if (!m) return { error: "Material not found." };
  if (!courseForTeacher(user, m.course_id)) return { error: "You don't teach this course." };
  db.prepare("UPDATE materials SET published = ? WHERE id = ?").run(m.published ? 0 : 1, m.id);
  audit(user.id, m.published ? "material.unpublish" : "material.publish", `material:${m.id}`);
  revalidatePath(`/courses/${m.course_id}/materials`);
  return { error: null };
}

export async function deleteMaterial(fd) {
  const user = teacherUser();
  const m = getMaterial(Number(fd.get("material_id")));
  if (!m) return { error: "Material not found." };
  if (!courseForTeacher(user, m.course_id)) return { error: "You don't teach this course." };
  db.prepare("DELETE FROM materials WHERE id = ?").run(m.id);
  audit(user.id, "material.delete", `material:${m.id}`, { title: m.title });
  revalidatePath(`/courses/${m.course_id}/materials`);
  return { error: null };
}
