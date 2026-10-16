"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, audit } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { courseForTeacher, enrolledStudentIds } from "@/lib/guards";
import { notify } from "@/lib/notify";
import { getAssignment } from "@/lib/assignments";
import { getProject } from "@/lib/projects";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

/** Teachers grade their own courses; admins may grade anywhere the guard allows. */
async function gradingUser() {
  const u = await requireUser();
  if (u.role !== "teacher" && u.role !== "admin") redirect("/dashboard");
  if (u.status !== "active") redirect("/dashboard");
  return u;
}

const targetSchema = z.object({
  student_id: z.coerce.number().int().positive("Pick a student."),
  intent: z.enum(["feedback", "release", "revision", "reopen", "review", "complete"], {
    errorMap: () => ({ message: "That grading action isn't recognised." }),
  }),
});

function scoreOf(fd, maxMarks) {
  const raw = clean(String(fd.get("score") ?? ""));
  if (raw === "") return { score: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > maxMarks) return { error: `The score must be a whole number between 0 and ${maxMarks}.` };
  return { score: n };
}

/* ------------------------------ assignments ------------------------------ */

export async function gradeAssignment(_prev, fd) {
  const user = await gradingUser();
  const parsed = targetSchema.safeParse(obj(fd));
  if (!parsed.success) return { error: firstError(parsed) };
  const assignmentId = Number(fd.get("assignment_id"));
  const { student_id: studentId, intent } = parsed.data;

  const a = await getAssignment(assignmentId);
  if (!a) return { error: "Assignment not found." };
  if (!(await courseForTeacher(user, a.course_id))) return { error: "Only the teacher of this course can grade these submissions." };
  if (!(await enrolledStudentIds(a.course_id)).includes(studentId)) return { error: "That student isn't enrolled in this course." };
  const sub = await db.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?").get(assignmentId, studentId);
  if (!sub) return { error: "There's no submission to grade for this student." };

  const feedback = clean(String(fd.get("feedback") ?? "")) || null;
  if (feedback && feedback.length > 4000) return { error: "Feedback is too long (4,000 characters max)." };
  const scored = scoreOf(fd, a.max_marks);
  if (scored.error) return { error: scored.error };
  const score = scored.score;
  if ((intent === "release") && score === null) return { error: "Enter a score before releasing the grade." };

  await db.transaction(async () => {
    switch (intent) {
      case "feedback":
        await db.prepare("UPDATE assignment_submissions SET score = COALESCE(?, score), feedback = ? WHERE id = ?").run(score, feedback, sub.id);
        await audit(user.id, "grade.feedback", `assignment:${a.id}`, { studentId, score });
        break;
      case "release":
        await db.prepare("UPDATE assignment_submissions SET score = ?, feedback = ?, status = 'graded', grade_released = 1 WHERE id = ?").run(score, feedback, sub.id);
        await audit(user.id, "grade.release", `assignment:${a.id}`, { studentId, score, max_marks: a.max_marks });
        break;
      case "revision":
        await db.prepare("UPDATE assignment_submissions SET score = COALESCE(?, score), feedback = ?, status = 'revision', grade_released = 0 WHERE id = ?").run(score, feedback, sub.id);
        await audit(user.id, "grade.revision", `assignment:${a.id}`, { studentId });
        break;
      default: // reopen -> let the student hand in again
        await db.prepare("UPDATE assignment_submissions SET status = 'revision', grade_released = 0 WHERE id = ?").run(sub.id);
        await audit(user.id, "grade.reopen", `assignment:${a.id}`, { studentId });
    }
  })();

  if (intent === "release") {
    await notify(studentId, "grade", `Grade released for "${a.title}": ${score}/${a.max_marks}`, `/assignments/${a.id}`);
  } else if (intent === "revision" || intent === "reopen") {
    await notify(studentId, "assignment", `Revision requested for "${a.title}"`, `/assignments/${a.id}`);
  }

  revalidatePath(`/assignments/${a.id}`);
  revalidatePath("/assignments");
  revalidatePath(`/courses/${a.course_id}/assignments`);
  revalidatePath("/grades");
  revalidatePath(`/courses/${a.course_id}/grades`);
  revalidatePath(`/students/${studentId}`);
  const done = { feedback: "Feedback saved.", release: `Grade released: ${score}/${a.max_marks}.`, revision: "Revision requested.", reopen: "Reopened for resubmission." };
  return { error: null, saved: done[intent] };
}

/* ------------------------------- projects -------------------------------- */

export async function gradeProject(_prev, fd) {
  const user = await gradingUser();
  const parsed = targetSchema.safeParse(obj(fd));
  if (!parsed.success) return { error: firstError(parsed) };
  const projectId = Number(fd.get("project_id"));
  const { student_id: studentId, intent } = parsed.data;

  const p = await getProject(projectId);
  if (!p) return { error: "Project not found." };
  if (!(await courseForTeacher(user, p.course_id))) return { error: "Only the teacher of this course can grade these submissions." };
  if (!(await enrolledStudentIds(p.course_id)).includes(studentId)) return { error: "That student isn't enrolled in this course." };
  const sub = await db.prepare("SELECT * FROM project_submissions WHERE project_id = ? AND student_id = ?").get(projectId, studentId);
  if (!sub) return { error: "This student hasn't submitted their project yet." };

  const feedback = clean(String(fd.get("feedback") ?? "")) || null;
  if (feedback && feedback.length > 4000) return { error: "Feedback is too long (4,000 characters max)." };
  const scored = scoreOf(fd, p.max_marks);
  if (scored.error) return { error: scored.error };
  const score = scored.score;
  if (intent === "complete" && score === null) return { error: "Enter a score before completing and grading the project." };

  await db.transaction(async () => {
    switch (intent) {
      case "review":
        await db.prepare("UPDATE project_submissions SET status = 'under_review', score = COALESCE(?, score), feedback = COALESCE(?, feedback) WHERE id = ?").run(score, feedback, sub.id);
        await audit(user.id, "grade.review", `project:${p.id}`, { studentId });
        break;
      case "revision":
        await db.prepare("UPDATE project_submissions SET status = 'revision', grade_released = 0, score = COALESCE(?, score), feedback = ? WHERE id = ?").run(score, feedback, sub.id);
        await audit(user.id, "grade.revision", `project:${p.id}`, { studentId });
        break;
      default: // complete & grade
        await db.prepare("UPDATE project_submissions SET status = 'completed', grade_released = 1, score = ?, feedback = COALESCE(?, feedback) WHERE id = ?").run(score, feedback, sub.id);
        await audit(user.id, "grade.release", `project:${p.id}`, { studentId, score, max_marks: p.max_marks });
    }
  })();

  if (intent === "complete") {
    await notify(studentId, "grade", `Grade released for "${p.title}": ${score}/${p.max_marks}`, `/projects/${p.id}`);
  } else if (intent === "revision") {
    await notify(studentId, "project", `Revision requested for "${p.title}"`, `/projects/${p.id}`);
  } else {
    await notify(studentId, "project", `Your project "${p.title}" is under review`, `/projects/${p.id}`);
  }

  revalidatePath(`/projects/${p.id}`);
  revalidatePath("/projects");
  revalidatePath(`/courses/${p.course_id}/projects`);
  revalidatePath("/grades");
  revalidatePath(`/courses/${p.course_id}/grades`);
  revalidatePath(`/students/${studentId}`);
  const done = { review: "Marked as under review.", revision: "Revision requested.", complete: `Grade released: ${score}/${p.max_marks}.` };
  return { error: null, saved: done[intent] };
}

/** Release every score that a teacher has filled in but not yet shown (one course). */
export async function releaseCourseGrades(fd) {
  const user = await gradingUser();
  const courseId = Number(fd.get("course_id"));
  if (!(await courseForTeacher(user, courseId))) return;
  const rows = await db.prepare(`
    SELECT s.id, s.student_id, s.score, a.max_marks, a.title, a.id AS assignment_id
    FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ? AND s.grade_released = 0 AND s.score IS NOT NULL`).all(courseId);
  if (!rows.length) return;
  await db.transaction(async () => {
    const stmt = await db.prepare("UPDATE assignment_submissions SET status = 'graded', grade_released = 1 WHERE id = ?");
    for (const r of rows) {
      await stmt.run(r.id);
      await audit(user.id, "grade.release", `assignment:${r.assignment_id}`, { studentId: r.student_id, score: r.score, max_marks: r.max_marks, bulk: true });
    }
  })();
  for (const r of rows) await notify(r.student_id, "grade", `Grade released for "${r.title}": ${r.score}/${r.max_marks}`, `/assignments/${r.assignment_id}`);
  for (const r of rows) revalidatePath(`/assignments/${r.assignment_id}`);
  revalidatePath("/grades");
  revalidatePath(`/courses/${courseId}/grades`);
  revalidatePath(`/courses/${courseId}/assignments`);
  revalidatePath("/assignments");
}
