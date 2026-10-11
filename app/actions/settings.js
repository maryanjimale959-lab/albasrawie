"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const obj = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, clean(v)]));
const firstError = (r) => r.error.issues[0].message;

export async function updateProfile(_prev, fd) {
  const user = requireUser();
  const r = z.object({
    full_name: z.string().min(2, "Enter your full name.").max(100),
    bio: z.string().max(600).optional(),
    organization: z.string().max(150).optional(),
    department: z.string().max(150).optional(),
    class_name: z.string().max(100).optional(),
    portfolio_public: z.enum(["on", "off"]).optional(),
    time_zone: z.string().max(60).optional(),
  }).safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const d = r.data;
  if (d.time_zone) {
    try { new Intl.DateTimeFormat("en", { timeZone: d.time_zone }); } catch { return { error: "That time zone isn't valid." }; }
  }
  db.transaction(() => {
    db.prepare("UPDATE users SET full_name = ?, time_zone = COALESCE(?, time_zone) WHERE id = ?").run(d.full_name, d.time_zone || null, user.id);
    if (user.role === "student") {
      const existing = db.prepare("SELECT user_id FROM student_profiles WHERE user_id = ?").get(user.id);
      if (existing) {
        db.prepare(`UPDATE student_profiles SET class_name = COALESCE(?, class_name), bio = ?, portfolio_public = CASE ? WHEN 'on' THEN 1 ELSE 0 END WHERE user_id = ?`)
          .run(d.class_name || null, d.bio ?? null, d.portfolio_public || "off", user.id);
      } else {
        db.prepare(`INSERT INTO student_profiles (user_id, student_id, class_name, bio, portfolio_public)
          VALUES (?, ?, COALESCE(?, ''), ?, CASE ? WHEN 'on' THEN 1 ELSE 0 END)`)
          .run(user.id, `ST-${user.id}`, d.class_name || null, d.bio ?? null, d.portfolio_public || "off");
      }
    } else if (user.role === "teacher") {
      const existing = db.prepare("SELECT user_id FROM teacher_profiles WHERE user_id = ?").get(user.id);
      if (existing) {
        db.prepare(`UPDATE teacher_profiles SET bio = ?, organization = COALESCE(?, organization), department = COALESCE(?, department) WHERE user_id = ?`)
          .run(d.bio ?? null, d.organization || null, d.department || null, user.id);
      } else {
        db.prepare(`INSERT INTO teacher_profiles (user_id, bio, organization, department) VALUES (?,?,?,?)`)
          .run(user.id, d.bio ?? null, d.organization || null, d.department || null);
      }
    }
  })();
  revalidatePath("/settings");
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { error: null, ok: "Profile updated." };
}

export async function uploadAvatar(_prev, fd) {
  const user = requireUser();
  const file = fd.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return { error: "Use a PNG, JPEG, WebP or GIF image." };
  const res = await saveUpload(file, { ownerId: user.id, kind: "avatar" });
  if (res.error) return { error: res.error };
  db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(`/api/f/${res.id}`, user.id);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { error: null, ok: "Profile picture updated." };
}

export async function requestPasswordChange(_prev, fd) {
  const user = requireUser();
  const r = z.object({ current: z.string(), password: z.string().min(8, "Use at least 8 characters.").max(128), confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "The new passwords don't match.", path: ["confirm"] })
    .safeParse(obj(fd));
  if (!r.success) return { error: firstError(r) };
  const { verifyPassword, hashPassword } = await import("@/lib/auth");
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
  if (!verifyPassword(r.data.current, row.password_hash)) return { error: "Current password is incorrect." };
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(r.data.password), user.id);
  // Log out every other device, keep this session alive.
  const { cookies } = await import("next/headers");
  const crypto = await import("crypto");
  const current = cookies().get("albasrawie_session")?.value;
  const curHash = current ? crypto.createHash("sha256").update(current).digest("hex") : "";
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(user.id, curHash);
  return { error: null, ok: "Password changed. Other devices will need to sign in again." };
}
