"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, audit } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { courseForStudent, courseForTeacher } from "@/lib/guards";
import { logActivity } from "@/lib/activity";
import { notifyCourse } from "@/lib/notify";
import { saveUpload } from "@/lib/storage";
import { allowedTypes, getAssignment, submissionFor, submissionStatus, toDbDateTime } from "@/lib/assignments";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

const TYPES = ["text", "link", "file"];
const TYPES_ERROR = "Allow at least one submission type (text, link or file).";

const assignmentSchema = z.object({
  course_id: z.coerce.number().int().positive("Choose which course this belongs to."),
  title: z.string().min(2, "Enter a title for the assignment.").max(150),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(4000).optional(),
  due_at: z.string().max(32).optional(),
  max_marks: z.coerce.number().int("Max marks must be a whole number.").min(1, "Max marks must be at least 1.").max(1000, "Max marks must be 1000 or less."),
  rubric: z.string().max(4000).optional(),
});

const revalidateAssignment = (assignmentId, courseId) => {
  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/assignments");
  revalidatePath(`/courses/${courseId}/assignments`);
};

const pickedTypes = (fd) => [...new Set([...fd.getAll("types")].map((t) => String(t).trim()))].filter((t) => TYPES.includes(t));
const isActiveTeacher = () => {
  const u = requireUser("teacher");
  if (u.status !== "active") redirect("/dashboard");
  return u;
};

/* ------------------------------ teacher ------------------------------ */

export async function createAssignment(_prev, fd) {
  const user = isActiveTeacher();
  const r = assignmentSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  const course = courseForTeacher(user, d.course_id);
  if (!course) return { error: "Course not found. Pick one of the courses you teach." };
  if (course.archived) return { error: "This course is archived. Restore it before publishing new work." };
  const types = pickedTypes(fd);
  if (!types.length) return { error: TYPES_ERROR };

  const file = fd.get("attachment");
  let attachment = { path: null, name: null };
  if (file && typeof file.size === "number" && file.size > 0) {
    const up = await saveUpload(file, { ownerId: user.id, courseId: course.id, kind: "assignment" });
    if (up.error) return { error: up.error };
    attachment = { path: String(up.id), name: up.name };
  }
  const publish = fd.get("publish") === "1";
  const due = toDbDateTime(d.due_at);
  if (d.due_at && !due) return { error: "The due date doesn't look right. Pick a date and time." };

  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO assignments
      (course_id, title, description, instructions, due_at, max_marks, allowed_types, rubric, attachment_path, attachment_name, published)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(course.id, d.title, d.description || null, d.instructions || null, due, d.max_marks,
        types.join(","), d.rubric || null, attachment.path, attachment.name, publish ? 1 : 0);
    const newId = Number(info.lastInsertRowid);
    audit(user.id, "assignment.create", `assignment:${newId}`, { courseId: course.id, published: publish });
    return newId;
  })();

  if (publish) notifyCourse(course.id, "assignment", `New assignment: ${d.title}`, `/assignments/${id}`, { excludeUser: user.id });
  revalidateAssignment(id, course.id);
  redirect(`/assignments/${id}`);
}

export async function updateAssignment(_prev, fd) {
  const user = isActiveTeacher();
  const r = z.object({ assignment_id: z.coerce.number().int().positive() }).safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const a = getAssignment(r.data.assignment_id);
  if (!a) return { error: "Assignment not found." };
  if (!courseForTeacher(user, a.course_id)) return { error: "You can only edit assignments in your own courses." };
  const d = assignmentSchema.safeParse({ ...obj(fd), course_id: a.course_id }).data;
  if (!d) return { error: "Check the title, due date and max marks." };
  const types = pickedTypes(fd);
  if (!types.length) return { error: TYPES_ERROR };
  const due = toDbDateTime(d.due_at);
  if (d.due_at && !due) return { error: "The due date doesn't look right. Pick a date and time." };

  db.prepare(`UPDATE assignments SET title = ?, description = ?, instructions = ?, due_at = ?, max_marks = ?, allowed_types = ?, rubric = ? WHERE id = ?`)
    .run(d.title, d.description || null, d.instructions || null, due, d.max_marks, types.join(","), d.rubric || null, a.id);
  audit(user.id, "assignment.update", `assignment:${a.id}`, { types, max_marks: d.max_marks });
  revalidateAssignment(a.id, a.course_id);
  return { error: null, saved: "Assignment details saved." };
}

export async function toggleAssignmentPublish(fd) {
  const user = isActiveTeacher();
  const id = Number(fd.get("assignment_id"));
  const a = getAssignment(id);
  if (!a || !courseForTeacher(user, a.course_id)) return;
  const next = a.published ? 0 : 1;
  db.prepare("UPDATE assignments SET published = ? WHERE id = ?").run(next, id);
  audit(user.id, next ? "assignment.publish" : "assignment.unpublish", `assignment:${id}`);
  if (next) notifyCourse(a.course_id, "assignment", `New assignment: ${a.title}`, `/assignments/${id}`, { excludeUser: user.id });
  revalidateAssignment(id, a.course_id);
}

/* ------------------------------ student ------------------------------ */

const linkOk = (v) => /^https?:\/\/.+\..+/i.test(v);

export async function submitAssignment(_prev, fd) {
  const user = requireUser("student");
  const r = z.object({ assignment_id: z.coerce.number().int().positive() }).safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const a = getAssignment(r.data.assignment_id);
  if (!a || !a.published) return { error: "This assignment isn't available any more." };
  if (!courseForStudent(user, a.course_id)) return { error: "You're not enrolled in this course." };

  const existing = submissionFor(a.id, user.id);
  if (existing && existing.status !== "revision") {
    return { error: "Your work is with the teacher. You can hand in a new version once a revision is requested." };
  }
  const types = allowedTypes(a);
  const content = String(fd.get("content") || "").trim();
  const link = String(fd.get("link") || "").trim();
  const file = fd.get("file");
  const hasFile = file && typeof file.size === "number" && file.size > 0;

  let channel = null;
  let storedFile = { path: null, name: null };
  if (hasFile) {
    if (!types.includes("file")) return { error: "Files aren't an accepted submission type for this assignment." };
    const up = await saveUpload(file, { ownerId: user.id, courseId: a.course_id, kind: "submission" });
    if (up.error) return { error: up.error };
    storedFile = { path: String(up.id), name: up.name };
    channel = "file";
  } else if (link) {
    if (!types.includes("link")) return { error: "Links aren't an accepted submission type for this assignment." };
    if (!linkOk(link)) return { error: "Enter a full link starting with http:// or https://." };
    channel = "link";
  } else if (content) {
    if (!types.includes("text")) return { error: "Typed answers aren't an accepted submission type for this assignment." };
    channel = "text";
  } else {
    return { error: "Add your answer first — type it, paste a link, or attach a file." };
  }
  if (content.length > 20000) return { error: "That typed answer is too long (20,000 characters max)." };

  const now = new Date();
  const status = submissionStatus(a.due_at, now);
  const stamp = now.toISOString().slice(0, 19).replace("T", " ");
  const values = {
    content: channel === "text" ? content : null,
    link: channel === "link" ? link : null,
    path: channel === "file" ? storedFile.path : null,
    name: channel === "file" ? storedFile.name : null,
  };

  db.transaction(() => {
    if (existing) {
      db.prepare(`UPDATE assignment_submissions
        SET content = ?, link = ?, file_path = ?, file_name = ?, status = ?, submitted_at = ?, grade_released = 0 WHERE id = ?`)
        .run(values.content, values.link, values.path, values.name, status, stamp, existing.id);
    } else {
      db.prepare(`INSERT INTO assignment_submissions
        (assignment_id, student_id, content, link, file_path, file_name, status, submitted_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(a.id, user.id, values.content, values.link, values.path, values.name, status, stamp);
    }
    logActivity(user.id, {
      courseId: a.course_id, type: "assignment_submitted", relatedId: a.id, verification: "verified",
      description: `Submitted "${a.title}"`,
    });
    audit(user.id, "assignment.submit", `assignment:${a.id}`, { status });
  })();

  revalidateAssignment(a.id, a.course_id);
  redirect(`/assignments/${a.id}`);
}
