"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, audit } from "@/lib/db";
import { hashPassword, verifyPassword, createSession, destroySession, requireUser, homeFor } from "@/lib/auth";
import * as courses from "@/lib/courses";
import { notify } from "@/lib/notify";
import { normalizeCode } from "@/lib/codes";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

const password = z.string().min(8, "Use at least 8 characters for the password.").max(128);
const common = {
  full_name: z.string().min(2, "Enter your full name.").max(100),
  email: z.string().email("Enter a valid email address.").max(200),
  password,
  confirm: z.string(),
};
const samePw = (d) => d.password === d.confirm;
const samePwMsg = { message: "The passwords don't match.", path: ["confirm"] };

const studentSchema = z.object({
  ...common,
  student_id: z.string().min(1, "Enter your student ID.").max(50),
  class_name: z.string().min(1, "Enter your class or study group.").max(100),
  organization: z.string().max(150).optional(),
  course_code: z.string().max(30).optional(),
}).refine(samePw, samePwMsg);

const teacherSchema = z.object({
  ...common,
  organization: z.string().max(150).optional(),
  department: z.string().max(150).optional(),
  bio: z.string().min(1, "Add a short professional biography.").max(600),
}).refine(samePw, samePwMsg);

export async function registerStudent(_prev, fd) {
  const r = studentSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  const org = d.organization || "";
  if (await db.prepare("SELECT 1 FROM users WHERE email = ?").get(d.email)) return { error: "An account with this email already exists. Log in instead." };
  if (await db.prepare("SELECT 1 FROM student_profiles WHERE student_id = ? AND organization = ?").get(d.student_id, org))
    return { error: "That student ID is already registered for this organization." };
  const userId = await db.transaction(async () => {
    const info = await db.prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?,?,?,'student')")
      .run(d.full_name, d.email, hashPassword(d.password));
    const id = Number(info.lastInsertRowid);
    await db.prepare("INSERT INTO student_profiles (user_id, student_id, class_name, organization) VALUES (?,?,?,?)")
      .run(id, d.student_id, d.class_name, org);
    await audit(id, "user.register", `user:${id}`, { role: "student" });
    return id;
  })();
  await createSession(userId);
  if (d.course_code) {
    const res = await courses.enroll(userId, d.course_code);
    if (res.ok) redirect(`/courses/${res.courseId}`);
    redirect(`/join?code=${encodeURIComponent(normalizeCode(d.course_code))}`);
  }
  redirect("/dashboard");
}

export async function registerTeacher(_prev, fd) {
  const r = teacherSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  if (await db.prepare("SELECT 1 FROM users WHERE email = ?").get(d.email)) return { error: "An account with this email already exists. Log in instead." };
  const status = process.env.REQUIRE_TEACHER_VERIFICATION === "true" ? "pending" : "active";
  const userId = await db.transaction(async () => {
    const info = await db.prepare("INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?,?,?,'teacher',?)")
      .run(d.full_name, d.email, hashPassword(d.password), status);
    const id = Number(info.lastInsertRowid);
    await db.prepare("INSERT INTO teacher_profiles (user_id, bio, organization, department) VALUES (?,?,?,?)")
      .run(id, d.bio, d.organization || null, d.department || null);
    await audit(id, "user.register", `user:${id}`, { role: "teacher", status });
    return id;
  })();
  // An account that still needs approval is not signed in — it is waiting.
  if (status !== "active") {
    await notify(userId, "teacher_pending", "Your teacher account has been received and is waiting for the platform administrator to approve it.", null);
    redirect("/login?pending=1");
  }
  await createSession(userId);
  redirect("/dashboard");
}

// Simple in-memory throttle: 8 failed attempts per email per 15 minutes.
const attempts = globalThis.__loginAttempts || (globalThis.__loginAttempts = new Map());
function throttled(email) {
  const now = Date.now();
  const list = (attempts.get(email) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(email, list);
  return list.length >= 8;
}

export async function login(_prev, fd) {
  const { email = "", password = "", next = "", as = "" } = obj(fd);
  const key = email.toLowerCase();
  if (throttled(key)) return { error: "Too many attempts. Wait 15 minutes and try again." };
  const u = await db.prepare("SELECT id, password_hash, status, role FROM users WHERE email = ?").get(email);
  if (!u || !verifyPassword(password, u.password_hash)) {
    attempts.get(key).push(Date.now());
    return { error: "The email or password is incorrect." };
  }
  if (u.status === "suspended") return { error: "This account is suspended. Contact the platform administrator." };
  if (u.status === "pending") return { error: "This teacher account is waiting for approval from the platform administrator." };
  /* A sign-in reached from a teacher page is for teachers. Checked only after
     the password is right, so the page never confirms an email on its own. */
  const wanted = ["student", "teacher"].includes(as) ? as : "";
  if (wanted && u.role !== wanted && u.role !== "admin") {
    return {
      error: wanted === "teacher"
        ? "That is a student account, so it cannot sign in from the teacher link. Use the student sign-in instead."
        : "That is a teacher account. Teachers sign in from the link their administrator shared.",
    };
  }
  attempts.delete(key);
  await createSession(u.id);
  await audit(u.id, "user.login", `user:${u.id}`);
  /* Each role has its own home. An administrator goes straight to the console
     instead of stopping at the dashboard and being bounced from there. */
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : homeFor(u.role));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const courseSchema = z.object({
  name: z.string().min(2, "Enter a course name.").max(120),
  description: z.string().max(1000).optional(),
  category: z.string().max(80).optional(),
  organization: z.string().max(150).optional(),
  class_name: z.string().max(100).optional(),
  level: z.string().max(80).optional(),
  visibility: z.enum(["private", "listed"]),
});

async function requireActiveTeacher() {
  const u = await requireUser("teacher");
  if (u.status !== "active") redirect("/dashboard");
  return u;
}

export async function createCourse(_prev, fd) {
  const u = await requireActiveTeacher();
  const r = courseSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const id = await courses.createCourse(u.id, r.data);
  redirect(`/courses/${id}`);
}

const idOf = (fd) => Number(fd.get("course_id"));

export async function regenerateCode(fd) {
  const u = await requireActiveTeacher();
  await courses.regenerateCode(u.id, idOf(fd));
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function disableCode(fd) {
  const u = await requireActiveTeacher();
  await courses.disableCode(u.id, idOf(fd));
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function toggleEnrollment(fd) {
  const u = await requireActiveTeacher();
  await courses.setEnrollmentOpen(u.id, idOf(fd), fd.get("open") === "1");
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function toggleArchive(fd) {
  const u = await requireActiveTeacher();
  await courses.setArchived(u.id, idOf(fd), fd.get("archive") === "1");
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function deleteCourse(fd) {
  const u = await requireActiveTeacher();
  const courseId = idOf(fd);
  const res = await courses.deleteCourse(u.id, courseId);
  if (res?.error) return { error: res.error };
  revalidatePath("/dashboard");
  revalidatePath("/courses");
  redirect("/dashboard");
}
export async function removeStudent(fd) {
  const u = await requireActiveTeacher();
  await courses.removeStudent(u.id, idOf(fd), Number(fd.get("student_id")));
  revalidatePath(`/courses/${idOf(fd)}`);
}

export async function goToJoin(_prev, fd) {
  await requireUser("student");
  const code = normalizeCode(fd.get("code"));
  if (!code) return { error: "Enter a course code." };
  redirect(`/join/${encodeURIComponent(code)}`);
}

export async function confirmJoin(_prev, fd) {
  const u = await requireUser("student");
  const res = await courses.enroll(u.id, fd.get("code"));
  if (res.ok || res.already) redirect(`/courses/${res.courseId}`);
  return { error: res.error };
}

export async function inviteStudent(_prev, fd) {
  const u = await requireActiveTeacher();
  const courseId = Number(fd.get("course_id"));
  const course = await courses.ownedCourse(u.id, courseId);
  if (!course) return { error: "Course not found." };
  const email = String(fd.get("email") || "").trim();
  const student = await db.prepare("SELECT id, full_name FROM users WHERE email = ? AND role = 'student'").get(email);
  if (!student) return { error: "No student account uses that email. Share the code or link with them instead." };
  const active = await db.prepare("SELECT code FROM course_codes WHERE course_id = ? AND active = 1").get(courseId);
  if (!active) return { error: "This course has no active code. Generate a new code first." };
  if (!course.enrollment_open) return { error: "Enrollment is closed. Open it before inviting students." };
  await db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)").run(
    student.id, "invitation",
    `You have been invited to join ${course.name}. Enter course code ${active.code} to join.`,
    `/join/${active.code}`
  );
  await audit(u.id, "course.invite", `course:${courseId}`, { studentId: student.id });
  revalidatePath(`/courses/${courseId}`);
  return { error: null, sent: `Invitation sent to ${student.full_name} inside Albasrawie.` };
}

export async function markNotificationsRead() {
  const u = await requireUser();
  await db.prepare("UPDATE notifications SET `read` = 1 WHERE user_id = ?").run(u.id);
  revalidatePath("/notifications");
}
