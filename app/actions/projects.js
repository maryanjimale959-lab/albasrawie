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
import { getProject, projectMilestones, projectSubmissionFor } from "@/lib/projects";
import { toDbDateTime } from "@/lib/assignments";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

const linkOk = (v) => !v || /^https?:\/\/.+\..+/i.test(v);

/** "2026-06-01" (date input) -> end of that UTC day, so deadline maths stay sane. */
function toDeadline(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} 23:59:00`;
  return toDbDateTime(v);
}
const toDateOnly = (value) => {
  const v = clean(value);
  return v ? String(v).slice(0, 10) : null;
};

const projectSchema = z.object({
  course_id: z.coerce.number().int().positive("Choose which course this belongs to."),
  title: z.string().min(2, "Enter a title for the project.").max(150),
  description: z.string().max(2000).optional(),
  objectives: z.string().max(4000).optional(),
  instructions: z.string().max(4000).optional(),
  start_date: z.string().max(32).optional(),
  deadline: z.string().max(32).optional(),
  max_marks: z.coerce.number().int("Max marks must be a whole number.").min(1, "Max marks must be at least 1.").max(1000, "Max marks must be 1000 or less."),
  project_type: z.enum(["individual", "group"], { errorMap: () => ({ message: "Choose individual or group." }) }),
  rubric: z.string().max(4000).optional(),
  reference_links: z.string().max(2000).optional(),
});

const revalidateProject = (projectId, courseId) => {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath(`/courses/${courseId}/projects`);
};
const isActiveTeacher = async () => {
  const u = await requireUser("teacher");
  if (u.status !== "active") redirect("/dashboard");
  return u;
};

/** Milestones arrive as milestone_1 … milestone_5; empties are skipped, order kept. */
function readMilestones(fd) {
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const v = clean(String(fd.get(`milestone_${i}`) || ""));
    if (v) out.push(v.slice(0, 200));
  }
  return out;
}

/* ------------------------------ teacher ------------------------------ */

export async function createProject(_prev, fd) {
  const user = await isActiveTeacher();
  const r = projectSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  const course = await courseForTeacher(user, d.course_id);
  if (!course) return { error: "Course not found. Pick one of the courses you teach." };
  if (course.archived) return { error: "This course is archived. Restore it before publishing new work." };
  const deadline = toDeadline(d.deadline);
  if (d.deadline && !deadline) return { error: "The deadline doesn't look right. Pick a date." };
  const startDate = toDateOnly(d.start_date);
  const milestones = readMilestones(fd);
  const publish = fd.get("publish") === "1";

  const file = fd.get("attachment");
  let attachment = { path: null, name: null };
  if (file && typeof file.size === "number" && file.size > 0) {
    const up = await saveUpload(file, { ownerId: user.id, courseId: course.id, kind: "project" });
    if (up.error) return { error: up.error };
    attachment = { path: String(up.id), name: up.name };
  }

  const id = await db.transaction(async () => {
    const info = await db.prepare(`INSERT INTO projects
      (course_id, title, description, objectives, instructions, start_date, deadline, max_marks, project_type, rubric, reference_links, attachment_path, attachment_name, published)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(course.id, d.title, d.description || null, d.objectives || null, d.instructions || null, startDate, deadline,
        d.max_marks, d.project_type, d.rubric || null, d.reference_links || null, attachment.path, attachment.name, publish ? 1 : 0);
    const newId = Number(info.lastInsertRowid);
    const stmt = await db.prepare("INSERT INTO project_milestones (project_id, title, position) VALUES (?,?,?)");
    for (const [i, title] of milestones.entries()) await stmt.run(newId, title, i + 1);
    await audit(user.id, "project.create", `project:${newId}`, { courseId: course.id, milestones: milestones.length, published: publish });
    return newId;
  })();

  if (publish) await notifyCourse(course.id, "project", `New project: ${d.title}`, `/projects/${id}`, { excludeUser: user.id });
  revalidateProject(id, course.id);
  redirect(`/projects/${id}`);
}

export async function toggleProjectPublish(fd) {
  const user = await isActiveTeacher();
  const id = Number(fd.get("project_id"));
  const p = await getProject(id);
  if (!p || !(await courseForTeacher(user, p.course_id))) return;
  const next = p.published ? 0 : 1;
  await db.prepare("UPDATE projects SET published = ? WHERE id = ?").run(next, id);
  await audit(user.id, next ? "project.publish" : "project.unpublish", `project:${id}`);
  if (next) await notifyCourse(p.course_id, "project", `New project: ${p.title}`, `/projects/${id}`, { excludeUser: user.id });
  revalidateProject(id, p.course_id);
}

/* ------------------------------ student ------------------------------ */

export async function toggleMilestone(fd) {
  const user = await requireUser("student");
  const projectId = Number(fd.get("project_id"));
  const milestoneId = Number(fd.get("milestone_id"));
  const p = await getProject(projectId);
  if (!p || !p.published) return;
  if (!(await courseForStudent(user, p.course_id))) return;
  const milestone = (await projectMilestones(projectId)).find((m) => m.id === milestoneId);
  if (!milestone) return;

  await db.transaction(async () => {
    const existing = await db.prepare("SELECT id FROM project_progress WHERE project_id = ? AND student_id = ? AND milestone_id = ?")
      .get(projectId, user.id, milestoneId);
    if (existing) {
      await db.prepare("DELETE FROM project_progress WHERE id = ?").run(existing.id);
    } else {
      await db.prepare("INSERT INTO project_progress (project_id, student_id, milestone_id) VALUES (?,?,?)").run(projectId, user.id, milestoneId);
      await logActivity(user.id, {
        courseId: p.course_id, type: "project_milestone", relatedId: milestoneId, verification: "verified",
        description: `Milestone "${milestone.title}" on "${p.title}"`,
      });
    }
  })();
  revalidateProject(projectId, p.course_id);
}

export async function submitProject(_prev, fd) {
  const user = await requireUser("student");
  const r = z.object({ project_id: z.coerce.number().int().positive() }).safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const p = await getProject(r.data.project_id);
  if (!p || !p.published) return { error: "This project isn't available any more." };
  if (!(await courseForStudent(user, p.course_id))) return { error: "You're not enrolled in this course." };

  const existing = await projectSubmissionFor(p.id, user.id);
  if (existing && existing.status !== "revision") {
    return { error: "Your project is with the teacher. You can hand in a new version once a revision is requested." };
  }

  const description = clean(String(fd.get("description") || ""));
  const demoUrl = clean(String(fd.get("demo_url") || ""));
  const repoUrl = clean(String(fd.get("repo_url") || ""));
  if (!description) return { error: "Describe what you built before handing it in." };
  if (description.length > 8000) return { error: "That description is too long (8,000 characters max)." };
  if (demoUrl && !linkOk(demoUrl)) return { error: "The demo link must start with http:// or https://." };
  if (repoUrl && !linkOk(repoUrl)) return { error: "The repository link must start with http:// or https://." };

  const file = fd.get("screenshot");
  let shot = { path: null, name: null };
  if (file && typeof file.size === "number" && file.size > 0) {
    const up = await saveUpload(file, { ownerId: user.id, courseId: p.course_id, kind: "project" });
    if (up.error) return { error: up.error };
    shot = { path: String(up.id), name: up.name };
  }

  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  await db.transaction(async () => {
    if (existing) {
      await db.prepare(`UPDATE project_submissions
        SET description = ?, demo_url = ?, repo_url = ?, screenshot_path = ?, screenshot_name = ?, status = 'submitted', submitted_at = ?, grade_released = 0 WHERE id = ?`)
        .run(description, demoUrl || null, repoUrl || null, shot.path, shot.name, stamp, existing.id);
    } else {
      await db.prepare(`INSERT INTO project_submissions
        (project_id, student_id, description, demo_url, repo_url, screenshot_path, screenshot_name, status, submitted_at)
        VALUES (?,?,?,?,?,?,?,'submitted',?)`)
        .run(p.id, user.id, description, demoUrl || null, repoUrl || null, shot.path, shot.name, stamp);
    }
    await logActivity(user.id, {
      courseId: p.course_id, type: "project_submitted", relatedId: p.id, verification: "verified",
      description: `Submitted "${p.title}"`,
    });
    await audit(user.id, "project.submit", `project:${p.id}`);
  })();

  revalidateProject(p.id, p.course_id);
  redirect(`/projects/${p.id}`);
}

/* -------------------------- personal (portfolio) ---------------------- */

const personalSchema = z.object({
  title: z.string().min(2, "Enter the project title.").max(150),
  description: z.string().min(10, "Add a short description (at least 10 characters).").max(2000),
  technologies: z.string().max(300).optional(),
  demo_url: z.string().max(300).optional(),
  repo_url: z.string().max(300).optional(),
  completed_on: z.string().max(32).optional(),
});

export async function createPersonalProject(_prev, fd) {
  const user = await requireUser("student");
  const r = personalSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  if (d.demo_url && !linkOk(d.demo_url)) return { error: "The demo link must start with http:// or https://." };
  if (d.repo_url && !linkOk(d.repo_url)) return { error: "The repository link must start with http:// or https://." };
  const technologies = (d.technologies || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20).join(",");
  const completed = toDateOnly(d.completed_on);

  const file = fd.get("image");
  let image = { path: null, name: null };
  if (file && typeof file.size === "number" && file.size > 0) {
    const up = await saveUpload(file, { ownerId: user.id, courseId: null, kind: "portfolio" });
    if (up.error) return { error: up.error };
    image = { path: String(up.id), name: up.name };
  }

  await db.transaction(async () => {
    const info = await db.prepare(`INSERT INTO personal_projects
      (student_id, title, description, technologies, demo_url, repo_url, image_path, image_name, completed_on)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(user.id, d.title, d.description, technologies || null, d.demo_url || null, d.repo_url || null, image.path, image.name, completed);
    const newId = Number(info.lastInsertRowid);
    await logActivity(user.id, {
      courseId: null, type: "external_project", relatedId: newId, verification: "self_reported",
      description: `Personal project "${d.title}"`,
    });
    await audit(user.id, "portfolio.create", `personal_project:${newId}`);
    return newId;
  })();

  revalidatePath("/projects");
  redirect("/projects");
}

export async function deletePersonalProject(fd) {
  const user = await requireUser("student");
  const id = Number(fd.get("personal_project_id"));
  const row = await db.prepare("SELECT * FROM personal_projects WHERE id = ?").get(id);
  if (!row || row.student_id !== user.id) return;
  await db.transaction(async () => {
    await db.prepare("DELETE FROM personal_projects WHERE id = ?").run(id);
    await db.prepare("DELETE FROM learning_activities WHERE student_id = ? AND type = 'external_project' AND related_id = ?").run(user.id, id);
    await audit(user.id, "portfolio.delete", `personal_project:${id}`, { title: row.title });
  })();
  revalidatePath("/projects");
}
