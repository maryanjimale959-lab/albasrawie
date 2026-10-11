"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, audit } from "@/lib/db";
import { hashPassword, verifyPassword, createSession, destroySession, requireUser } from "@/lib/auth";
import * as courses from "@/lib/courses";
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
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(d.email)) return { error: "An account with this email already exists. Log in instead." };
  if (db.prepare("SELECT 1 FROM student_profiles WHERE student_id = ? AND organization = ?").get(d.student_id, org))
    return { error: "That student ID is already registered for this organization." };
  const userId = db.transaction(() => {
    const id = Number(db.prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?,?,?,'student')")
      .run(d.full_name, d.email, hashPassword(d.password)).lastInsertRowid);
    db.prepare("INSERT INTO student_profiles (user_id, student_id, class_name, organization) VALUES (?,?,?,?)")
      .run(id, d.student_id, d.class_name, org);
    audit(id, "user.register", `user:${id}`, { role: "student" });
    return id;
  })();
  createSession(userId);
  if (d.course_code) {
    const res = courses.enroll(userId, d.course_code);
    if (res.ok) redirect(`/courses/${res.courseId}`);
    redirect(`/join?code=${encodeURIComponent(normalizeCode(d.course_code))}`);
  }
  redirect("/dashboard");
}

export async function registerTeacher(_prev, fd) {
  const r = teacherSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(d.email)) return { error: "An account with this email already exists. Log in instead." };
  const status = process.env.REQUIRE_TEACHER_VERIFICATION === "true" ? "pending" : "active";
  const userId = db.transaction(() => {
    const id = Number(db.prepare("INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?,?,?,'teacher',?)")
      .run(d.full_name, d.email, hashPassword(d.password), status).lastInsertRowid);
    db.prepare("INSERT INTO teacher_profiles (user_id, bio, organization, department) VALUES (?,?,?,?)")
      .run(id, d.bio, d.organization || null, d.department || null);
    audit(id, "user.register", `user:${id}`, { role: "teacher", status });
    return id;
  })();
  createSession(userId);
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
  const { email = "", password = "", next = "" } = obj(fd);
  const key = email.toLowerCase();
  if (throttled(key)) return { error: "Too many attempts. Wait 15 minutes and try again." };
  const u = db.prepare("SELECT id, password_hash, status FROM users WHERE email = ?").get(email);
  if (!u || !verifyPassword(password, u.password_hash)) {
    attempts.get(key).push(Date.now());
    return { error: "The email or password is incorrect." };
  }
  if (u.status === "suspended") return { error: "This account is suspended. Contact the platform administrator." };
  attempts.delete(key);
  createSession(u.id);
  audit(u.id, "user.login", `user:${u.id}`);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  destroySession();
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

function requireActiveTeacher() {
  const u = requireUser("teacher");
  if (u.status !== "active") redirect("/dashboard");
  return u;
}

export async function createCourse(_prev, fd) {
  const u = requireActiveTeacher();
  const r = courseSchema.safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const id = courses.createCourse(u.id, r.data);
  redirect(`/courses/${id}`);
}

const idOf = (fd) => Number(fd.get("course_id"));

export async function regenerateCode(fd) {
  const u = requireActiveTeacher();
  courses.regenerateCode(u.id, idOf(fd));
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function disableCode(fd) {
  const u = requireActiveTeacher();
  courses.disableCode(u.id, idOf(fd));
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function toggleEnrollment(fd) {
  const u = requireActiveTeacher();
  courses.setEnrollmentOpen(u.id, idOf(fd), fd.get("open") === "1");
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function toggleArchive(fd) {
  const u = requireActiveTeacher();
  courses.setArchived(u.id, idOf(fd), fd.get("archive") === "1");
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${idOf(fd)}`);
}
export async function removeStudent(fd) {
  const u = requireActiveTeacher();
  courses.removeStudent(u.id, idOf(fd), Number(fd.get("student_id")));
  revalidatePath(`/courses/${idOf(fd)}`);
}

export async function goToJoin(_prev, fd) {
  requireUser("student");
  const code = normalizeCode(fd.get("code"));
  if (!code) return { error: "Enter a course code." };
  redirect(`/join/${encodeURIComponent(code)}`);
}

export async function confirmJoin(_prev, fd) {
  const u = requireUser("student");
  const res = courses.enroll(u.id, fd.get("code"));
  if (res.ok || res.already) redirect(`/courses/${res.courseId}`);
  return { error: res.error };
}

export async function inviteStudent(_prev, fd) {
  const u = requireActiveTeacher();
  const courseId = Number(fd.get("course_id"));
  const course = courses.ownedCourse(u.id, courseId);
  if (!course) return { error: "Course not found." };
  const email = String(fd.get("email") || "").trim();
  const student = db.prepare("SELECT id, full_name FROM users WHERE email = ? AND role = 'student'").get(email);
  if (!student) return { error: "No student account uses that email. Share the code or link with them instead." };
  const active = db.prepare("SELECT code FROM course_codes WHERE course_id = ? AND active = 1").get(courseId);
  if (!active) return { error: "This course has no active code. Generate a new code first." };
  if (!course.enrollment_open) return { error: "Enrollment is closed. Open it before inviting students." };
  db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)").run(
    student.id, "invitation",
    `You have been invited to join ${course.name}. Enter course code ${active.code} to join.`,
    `/join/${active.code}`
  );
  audit(u.id, "course.invite", `course:${courseId}`, { studentId: student.id });
  revalidatePath(`/courses/${courseId}`);
  return { error: null, sent: `Invitation sent to ${student.full_name} inside Albasrawie.` };
}

export async function markNotificationsRead() {
  const u = requireUser();
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(u.id);
  revalidatePath("/notifications");
}
