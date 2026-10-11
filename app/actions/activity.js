"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity, localDate, tzOf } from "@/lib/activity";
import { courseForStudent } from "@/lib/guards";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

const logSchema = z.object({
  title: z.string().min(2, "Give the activity a short title.").max(120),
  minutes: z.coerce.number().int().min(0).max(1440),
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
  course_id: z.string().optional(),
  kind: z.enum(["study", "external"]),
}).refine((d) => d.log_date <= localDate("UTC") && d.log_date >= "2020-01-01", { message: "That date is in the future.", path: ["log_date"] });

/** Students log learning done outside the platform. Always marked self-reported. */
export async function logStudyActivity(_prev, fd) {
  const user = requireUser("student");
  const r = logSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  let courseId = null;
  if (d.course_id) {
    const c = courseForStudent(user, Number(d.course_id));
    if (!c) return { error: "Pick one of your courses or leave it unlinked." };
    courseId = c.id;
  }
  db.transaction(() => {
    const id = Number(db.prepare("INSERT INTO study_logs (student_id, course_id, title, minutes, log_date) VALUES (?,?,?,?,?)")
      .run(user.id, courseId, d.title, d.minutes, d.log_date).lastInsertRowid);
    logActivity(user.id, {
      courseId,
      type: d.kind === "study" ? "study_logged" : "external_project",
      relatedId: id,
      verification: "self_reported",
      description: d.kind === "study"
        ? `Logged ${d.minutes} min of study: ${d.title}`
        : `External work: ${d.title}`,
      date: d.log_date,
    });
  })();
  revalidatePath("/activity");
  revalidatePath("/dashboard");
  return { error: null, ok: "Logged. It counts on your calendar as self-reported." };
}

export async function deleteStudyLog(fd) {
  const user = requireUser("student");
  const id = Number(fd.get("id"));
  const row = db.prepare("SELECT * FROM study_logs WHERE id = ? AND student_id = ?").get(id, user.id);
  if (!row) return;
  db.transaction(() => {
    db.prepare("DELETE FROM study_logs WHERE id = ?").run(id);
    db.prepare("DELETE FROM learning_activities WHERE student_id = ? AND related_id = ? AND type IN ('study_logged','external_project')").run(user.id, id);
  })();
  revalidatePath("/activity");
  revalidatePath("/dashboard");
}
