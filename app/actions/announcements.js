"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, audit } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { courseForTeacher } from "@/lib/guards";
import { notifyCourse } from "@/lib/notify";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

async function teacherUser() {
  const u = await requireUser();
  if (u.role !== "teacher" && u.role !== "admin") redirect("/dashboard");
  if (u.role === "teacher" && u.status !== "active") redirect("/dashboard");
  return u;
}

const announceSchema = z.object({
  title: z.string().min(2, "Give the announcement a short title.").max(150),
  content: z.string().min(1, "Write the announcement message.").max(8000),
});

export async function addAnnouncement(_prev, fd) {
  const user = await teacherUser();
  const courseId = Number(fd.get("course_id"));
  const course = Number.isInteger(courseId) ? await courseForTeacher(user, courseId) : null;
  if (!course) return { error: "Course not found or not yours to teach." };
  const r = announceSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const info = await db.prepare("INSERT INTO announcements (course_id, teacher_id, title, content) VALUES (?,?,?,?)")
    .run(course.id, user.id, r.data.title, r.data.content);
  const id = Number(info.lastInsertRowid);
  await audit(user.id, "announcement.create", `announcement:${id}`, { courseId: course.id });
  await notifyCourse(course.id, "announcement", `${course.name}: ${r.data.title}`, `/courses/${course.id}/announcements`, { excludeUser: user.id });
  revalidatePath(`/courses/${course.id}/announcements`);
  return { error: null };
}

export async function deleteAnnouncement(fd) {
  const user = await teacherUser();
  const ann = await db.prepare("SELECT * FROM announcements WHERE id = ?").get(Number(fd.get("announcement_id")));
  if (!ann) return { error: "Announcement not found." };
  if (user.role !== "admin" && ann.teacher_id !== user.id) return { error: "Only the author can delete an announcement." };
  if (!(await courseForTeacher(user, ann.course_id))) return { error: "You don't teach this course." };
  await db.prepare("DELETE FROM announcements WHERE id = ?").run(ann.id);
  await audit(user.id, "announcement.delete", `announcement:${ann.id}`, { title: ann.title });
  revalidatePath(`/courses/${ann.course_id}/announcements`);
  return { error: null };
}
