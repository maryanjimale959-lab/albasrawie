"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, audit } from "@/lib/db";
import { getUser, hashPassword } from "@/lib/auth";
import { notify } from "@/lib/notify";
import * as courses from "@/lib/courses";

/* Every action here re-checks the role on the server: the /admin pages are
   guarded too, but a form POST must never trust the page that rendered it. */
async function requireAdmin() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

const idOf = (fd) => Number(fd.get("user_id"));
const back = (where, msg) =>
  redirect(`/admin${where ? `/${where}` : ""}?msg=${encodeURIComponent(msg)}`);

/* A decision taken from one account's own page should land back on that page,
   not on the list it was reached from — so those forms carry where they came
   from. Anything unexpected falls back to the caller's default. */
const cameFrom = (fd, fallback = "accounts") => {
  const n = String(fd.get("next") || "");
  return /^accounts(\/\d+)?$/.test(n) ? n : fallback;
};

/** How many usable administrators exist, optionally excluding one account. */
async function activeAdmins(exceptId = 0) {
  const row = await db
    .prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?")
    .get(exceptId);
  return Number(row.c);
}

async function target(userId) {
  return await db
    .prepare("SELECT id, full_name, email, role, status, email_verified FROM users WHERE id = ?")
    .get(userId);
}

/** The account must exist and must not be the administrator performing the action. */
async function guardedActor(admin, userId) {
  if (!userId) return { error: "That account no longer exists." };
  if (userId === admin.id) return { error: "You cannot change your own account here." };
  const t = await target(userId);
  if (!t) return { error: "That account no longer exists." };
  return { t };
}

/* ------------------------------------------------------------------ *
 * Approval queue — every new student and teacher account waits here once
 * it has confirmed its email.
 * ------------------------------------------------------------------ */

const waitsForApproval = (t) => ["student", "teacher"].includes(t.role) && t.status === "pending";

export async function approveAccount(fd) {
  const admin = await requireAdmin();
  const userId = idOf(fd);
  const check = await guardedActor(admin, userId);
  if (check.error) back(cameFrom(fd, ""), check.error);
  const t = check.t;
  if (!waitsForApproval(t))
    back(cameFrom(fd, ""), `${t.full_name} is not waiting for approval.`);
  if (Number(t.email_verified) === 0)
    back(cameFrom(fd, ""), `${t.full_name} has not confirmed their email yet, so they cannot be approved.`);

  const profile = t.role === "student"
    ? await db.prepare("SELECT pending_course_code FROM student_profiles WHERE user_id = ?").get(t.id)
    : null;
  await db.transaction(async () => {
    await db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(t.id);
    if (t.role === "teacher")
      await notify(t.id, "teacher_approved", "Your teacher account has been approved. You can create your first course now.", "/courses/new");
    else
      await notify(t.id, "student_approved", "Your student account has been approved. Join a course with the code your teacher gave you.", "/join");
    await audit(admin.id, t.role === "teacher" ? "admin.teacher_approved" : "admin.student_approved", `user:${t.id}`, { email: t.email });
  })();
  /* The course code a student gave at sign-up is used now that they can study. */
  if (profile?.pending_course_code) {
    await courses.enroll(t.id, profile.pending_course_code).catch((e) => console.error("[approve] enroll failed:", e.message));
    await db.prepare("UPDATE student_profiles SET pending_course_code = NULL WHERE user_id = ?").run(t.id);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  back(cameFrom(fd, ""), `Approved ${t.full_name}. They have been notified in the app.`);
}

export async function rejectAccount(fd) {
  const admin = await requireAdmin();
  const userId = idOf(fd);
  const reason = String(fd.get("reason") || "").trim().slice(0, 300);
  const check = await guardedActor(admin, userId);
  if (check.error) back(cameFrom(fd, ""), check.error);
  const t = check.t;
  if (!waitsForApproval(t))
    back(cameFrom(fd, ""), `${t.full_name} is not waiting for approval.`);

  await db.transaction(async () => {
    /* Suspension rather than deletion: the record stays so an appeal is not a
       mystery, and login already refuses suspended accounts with its own note.
       Their sessions are dropped so an open tab stops working immediately. */
    await db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(t.id);
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(t.id);
    await notify(
      t.id,
      `${t.role}_rejected`,
      reason
        ? `Your ${t.role} account was not approved: ${reason}`
        : `Your ${t.role} account was not approved. Reply to whoever shared the sign-up link with you.`,
      "/login"
    );
    await audit(admin.id, `admin.${t.role}_rejected`, `user:${t.id}`, { email: t.email, reason: reason || null });
  })();
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  back(cameFrom(fd, ""), `Not approved: ${t.full_name}, and they have been signed out.`);
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export async function suspendAccount(fd) {
  const admin = await requireAdmin();
  const userId = idOf(fd);
  const check = await guardedActor(admin, userId);
  if (check.error) back(cameFrom(fd), check.error);
  const t = check.t;
  if (t.status === "suspended") back(cameFrom(fd), `${t.full_name} is already suspended.`);
  if (t.role === "admin" && (await activeAdmins(t.id)) === 0)
    back(cameFrom(fd), "There must be at least one active administrator left.");

  await db.transaction(async () => {
    await db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(t.id);
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(t.id);
    await notify(t.id, "account_suspended", "Your account has been suspended by a platform administrator.", "/login");
    await audit(admin.id, "admin.account_suspended", `user:${t.id}`, { email: t.email, role: t.role });
  })();
  revalidatePath("/admin/accounts");
  back(cameFrom(fd), `Suspended ${t.full_name} and ended their sessions.`);
}

export async function restoreAccount(fd) {
  const admin = await requireAdmin();
  const userId = idOf(fd);
  const check = await guardedActor(admin, userId);
  if (check.error) back(cameFrom(fd), check.error);
  const t = check.t;
  if (t.status !== "suspended") back(cameFrom(fd), `${t.full_name} is not suspended.`);

  await db.transaction(async () => {
    await db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(t.id);
    await notify(t.id, "account_restored", "Your account has been restored. Welcome back.", "/dashboard");
    await audit(admin.id, "admin.account_restored", `user:${t.id}`, { email: t.email });
  })();
  revalidatePath("/admin/accounts");
  back(cameFrom(fd), `Restored ${t.full_name}.`);
}

/**
 * Role changes in any direction. Promotions need nothing but a click; a step
 * down to student asks for the two things only a real student record has, a
 * student ID and a class, and refuses while the teacher still runs courses —
 * those would be left without anyone to mark them.
 */
export async function changeRole(fd) {
  const admin = await requireAdmin();
  const userId = idOf(fd);
  const next = String(fd.get("role") || "");
  const studentRef = String(fd.get("student_id") || "").trim().slice(0, 64);
  const classRef = String(fd.get("class_name") || "").trim().slice(0, 120);
  const check = await guardedActor(admin, userId);
  if (check.error) back(cameFrom(fd), check.error);
  const t = check.t;

  if (next === t.role) back(cameFrom(fd), `${t.full_name} is already ${roleWord(t.role)}.`);
  if (!["student", "teacher", "admin"].includes(next))
    back(cameFrom(fd), "Choose a role: student, teacher or administrator.");
  if (t.status !== "active")
    back(cameFrom(fd), `${t.full_name} is ${t.status}. Settle that before changing the role.`);
  if (t.role === "admin" && (await activeAdmins(t.id)) === 0)
    back(cameFrom(fd), "There must be at least one active administrator left.");

  if (next === "admin") {
    const existingAdmin = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND id <> ?").get(t.id);
    if (Number(existingAdmin?.c || 0) >= 1) {
      back(cameFrom(fd), "Only one system administrator is allowed in this system.");
    }
  }

  if (next === "student") {
    if (!studentRef || !classRef)
      back(cameFrom(fd), "A student account needs a student ID and a class or study group.");
    const clash = await db.prepare(
      "SELECT 1 FROM student_profiles WHERE student_id = ? AND organization = ? AND user_id <> ?"
    ).get(studentRef, "", t.id);
    if (clash) back(cameFrom(fd), `Student ID ${studentRef} is already used by another account.`);
    const stillTeaching = Number((await db.prepare(
      "SELECT COUNT(*) c FROM courses WHERE teacher_id = ? AND archived = 0").get(t.id)).c);
    if (stillTeaching)
      back(cameFrom(fd), `${t.full_name} still runs ${stillTeaching} live course${stillTeaching === 1 ? "" : "s"}. Archive them before making this account a student.`);
  }

  await db.transaction(async () => {
    await db.prepare("UPDATE users SET role = ? WHERE id = ?").run(next, t.id);
    if (next === "teacher") {
      /* A teacher without a profile row would break the profile page, so give
         them an empty one; they fill in their biography in Settings. */
      const has = await db.prepare("SELECT user_id FROM teacher_profiles WHERE user_id = ?").get(t.id);
      if (!has) await db.prepare("INSERT INTO teacher_profiles (user_id, bio, organization, department) VALUES (?,?,NULL,NULL)").run(t.id, "");
    }
    if (next === "student") {
      await db.prepare(`
        INSERT INTO student_profiles (user_id, student_id, class_name, organization)
        VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE student_id = VALUES(student_id), class_name = VALUES(class_name)`
      ).run(t.id, studentRef, classRef, "");
    }
    await notify(
      t.id,
      "role_changed",
      next === "admin"
        ? "You have been made a platform administrator."
        : next === "teacher"
          ? "You have been given a teacher account. Create your first course whenever you are ready."
          : "Your account is now a student account. Join a course with its code to get going.",
      next === "admin" ? "/admin" : next === "teacher" ? "/courses/new" : "/join"
    );
    await audit(admin.id, "admin.role_changed", `user:${t.id}`, { from: t.role, to: next, student_id: next === "student" ? studentRef : undefined });
  })();
  revalidatePath("/admin/accounts");
  revalidatePath("/admin");
  back(cameFrom(fd), `${t.full_name} is now ${roleWord(next)}.`);
}

/** "a teacher" / "an administrator" / "a student", for messages that stay grammatical. */
const roleWord = (r) => (r === "admin" ? "an administrator" : `a ${r}`);

/* ------------------------------------------------------------------ *
 * Creating an account from the console
 * ------------------------------------------------------------------ */

const emailLooksReal = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/**
 * The console used to be able to do everything to an account except make one,
 * so the only way a new person could arrive was through the public sign-up
 * pages. An administrator can now open a student, a teacher or another
 * administrator directly; these accounts start active because the
 * administrator is the approval, and the password is set here so the person
 * can sign in the moment they are handed it.
 */
export async function createAccount(_prev, fd) {
  const admin = await requireAdmin();
  const role = String(fd.get("role") || "");
  const full_name = String(fd.get("full_name") || "").trim().slice(0, 100);
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const studentRef = String(fd.get("student_id") || "").trim().slice(0, 64);
  const classRef = String(fd.get("class_name") || "").trim().slice(0, 120);
  const organization = String(fd.get("organization") || "").trim().slice(0, 150);
  const department = String(fd.get("department") || "").trim().slice(0, 150);
  const bio = String(fd.get("bio") || "").trim().slice(0, 600);

  /* Validation failures come back to the form instead of bouncing through the
     query string, so the administrator keeps what they typed. */
  const fail = (error) => ({ error });
  if (!["student", "teacher", "admin"].includes(role)) return fail("Choose the kind of account to create.");
  if (role === "admin") {
    const existingAdmin = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get();
    if (Number(existingAdmin?.c || 0) >= 1) {
      return fail("Only one system administrator is allowed in this system.");
    }
  }
  if (full_name.length < 2) return fail("Enter the person's full name.");
  if (!emailLooksReal(email)) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Use a password of at least 8 characters to hand over.");
  if (role === "student" && (!studentRef || !classRef)) return fail("A student account needs a student ID and a class or study group.");
  if (await db.prepare("SELECT 1 FROM users WHERE email = ?").get(email))
    return fail(`An account already uses ${email}. Open it from the list instead of making a second one.`);
  if (role === "student") {
    const clash = await db.prepare("SELECT 1 FROM student_profiles WHERE student_id = ? AND organization = ?")
      .get(studentRef, "");
    if (clash) return fail(`Student ID ${studentRef} is already registered. Change it or open the existing account.`);
  }

  const userId = await db.transaction(async () => {
    const info = await db.prepare(
      "INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?,?,?,?, 'active')"
    ).run(full_name, email, hashPassword(password), role);
    const id = Number(info.lastInsertRowid);
    if (role === "student")
      await db.prepare("INSERT INTO student_profiles (user_id, student_id, class_name, organization, bio) VALUES (?,?,?,?,?)")
        .run(id, studentRef, classRef, "", bio || null);
    if (role === "teacher")
      await db.prepare("INSERT INTO teacher_profiles (user_id, bio, organization, department) VALUES (?,?,?,?)")
        .run(id, bio, organization || null, department || null);
    await notify(
      id,
      "account_created",
      role === "admin"
        ? "An administrator account was opened for you on this platform. Sign in with the password you were given and change it in Settings."
        : role === "teacher"
          ? "A teacher account was opened for you on this platform. Sign in with the password you were given, then create your first course."
          : "A student account was opened for you on this platform. Sign in with the password you were given and join your first course with its code.",
      role === "admin" ? "/admin" : role === "teacher" ? "/courses/new" : "/join"
    );
    await audit(admin.id, "admin.account_created", `user:${id}`, { email, role });
    return id;
  })();

  revalidatePath("/admin/accounts");
  revalidatePath("/admin");
  redirect(`/admin/accounts/${userId}?msg=${encodeURIComponent(
    `${full_name} is ${roleWord(role)} and can sign in now. Hand them the password and ask them to change it in Settings.`
  )}`);
}

/**
 * The sign-in pages tell people who lose their credentials to contact the
 * administrator, so the administrator needs a way to answer that. This sets a
 * new password and ends the account's open sessions; nothing else is touched.
 */
export async function resetPassword(fd) {
  const admin = await requireAdmin();
  const userId = idOf(fd);
  const password = String(fd.get("password") || "");
  const check = await guardedActor(admin, userId);
  if (check.error) back(cameFrom(fd), check.error);
  const t = check.t;
  if (password.length < 8) back(`accounts/${t.id}`, "Use a password of at least 8 characters.");

  await db.transaction(async () => {
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), t.id);
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(t.id);
    await notify(t.id, "password_reset", "Your password was reset by the platform administrator. Sign in with the new one and change it in Settings.", "/login");
    await audit(admin.id, "admin.password_reset", `user:${t.id}`, { email: t.email });
  })();
  back(`accounts/${t.id}`, `New password set for ${t.full_name}, and their open sessions were signed out.`);
}


/* ------------------------------------------------------------------ *
 * Handing a course to another teacher
 * ------------------------------------------------------------------ */

/**
 * A course outlives the account that made it. When a staff account is a
 * placeholder, is leaving, or was suspended, the administrator moves the course
 * to the teacher who will actually run it — the roster, the register and every
 * mark already recorded travel with it.
 */
export async function transferCourse(fd) {
  const admin = await requireAdmin();
  const courseId = Number(fd.get("course_id"));
  const toId = Number(fd.get("to_teacher_id"));
  if (!courseId || !toId) back("courses", "Choose the course and the teacher to hand it to.");
  const course = await db.prepare("SELECT id, name, teacher_id FROM courses WHERE id = ?").get(courseId);
  if (!course) back("courses", "That course no longer exists.");
  const from = await db.prepare("SELECT id, full_name, role FROM users WHERE id = ?").get(course.teacher_id);
  const to = await db.prepare("SELECT id, full_name, role, status FROM users WHERE id = ?").get(toId);
  const say = (m) => back(`courses`, m);
  if (!to) say("That teacher account no longer exists.");
  if (!["teacher", "admin"].includes(to.role)) say(`${to.full_name} is a ${to.role} account. Make them a teacher first.`);
  if (to.status !== "active") say(`${to.full_name} is ${to.status}. Restore the account before handing it a course.`);
  if (course.teacher_id === to.id) say(`${course.name} is already theirs.`);

  await db.transaction(async () => {
    await db.prepare("UPDATE courses SET teacher_id = ? WHERE id = ?").run(to.id, course.id);
    /* An administrator who takes a course needs the profile row the course
       pages expect, exactly as a promoted account would. */
    if (!(await db.prepare("SELECT user_id FROM teacher_profiles WHERE user_id = ?").get(to.id)))
      await db.prepare("INSERT INTO teacher_profiles (user_id, bio, organization, department) VALUES (?,?,NULL,NULL)").run(to.id, "");
    await notify(to.id, "course_transferred", `${course.name} has been handed to you. It is yours to run from now on.`, `/courses/${course.id}`);
    if (from) await notify(from.id, "course_transferred_away", `${course.name} has been moved to ${to.full_name} by a platform administrator.`, "/courses");
    await audit(admin.id, "admin.course_transferred", `course:${course.id}`, { from: from?.full_name || null, to: to.full_name });
  })();
  revalidatePath("/admin/courses");
  revalidatePath("/admin");
  back("courses", `${course.name} now belongs to ${to.full_name}. Its students, register and marks came with it.`);
}
