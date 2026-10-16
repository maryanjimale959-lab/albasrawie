import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateProfile, requestPasswordChange, changeSignInEmail } from "@/app/actions/settings";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import AvatarUploader from "@/components/AvatarUploader";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Albasrawie" };

function zones() {
  try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC", "Africa/Mogadishu", "Europe/London", "America/New_York"]; }
}

export default async function SettingsPage() {
  const user = await requireUser();
  const sp = user.role === "student" ? await db.prepare("SELECT * FROM student_profiles WHERE user_id = ?").get(user.id) : null;
  const tp = user.role === "teacher" ? await db.prepare("SELECT * FROM teacher_profiles WHERE user_id = ?").get(user.id) : null;
  const allZones = zones();
  const tz = user.time_zone && allZones.includes(user.time_zone) ? user.time_zone : "UTC";
  const roleColor = user.role === "admin" ? "violet" : user.role === "teacher" ? "blue" : "green";

  return (
    <Shell user={user}>
      <div className="page-head" style={{ marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "0.4rem" }}>
            <h1 style={{ margin: 0 }}>Account Settings</h1>
            <Pill tone={roleColor}>{user.role.toUpperCase()}</Pill>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Manage your personal profile, profile photo, and security credentials.
          </p>
        </div>
      </div>

      <div className="layout-2">
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          {/* Profile Picture Card */}
          <section className="panel" style={{ border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              </svg>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Profile Picture</h2>
            </div>
            <AvatarUploader user={user} />
          </section>

          {/* Profile Information Card */}
          <section className="panel" style={{ border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Personal Profile</h2>
            </div>
            <ActionForm action={updateProfile} submitLabel="Save profile changes" className="form">
              <label>
                Full name
                <input name="full_name" defaultValue={user.full_name} required maxLength={100} />
              </label>

              <div className="row">
                <label>
                  Time zone
                  <select name="time_zone" defaultValue={tz}>
                    {!allZones.includes(tz) && <option value={tz}>{tz}</option>}
                    {allZones.map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                {user.role === "student" && (
                  <label>
                    Class / study group
                    <input name="class_name" defaultValue={sp?.class_name || ""} maxLength={100} />
                  </label>
                )}
                {user.role === "teacher" && (
                  <label>
                    Organization
                    <input name="organization" defaultValue={tp?.organization || ""} maxLength={150} />
                  </label>
                )}
                {user.role === "teacher" && (
                  <label>
                    Department
                    <input name="department" defaultValue={tp?.department || ""} maxLength={150} />
                  </label>
                )}
              </div>

              <label>
                Biography
                <textarea
                  name="bio"
                  rows={3}
                  defaultValue={sp?.bio || tp?.bio || ""}
                  maxLength={600}
                  placeholder={
                    user.role === "teacher"
                      ? "A short professional biography your students will see."
                      : "Brief bio about your studies or interests."
                  }
                />
              </label>

              {user.role === "student" && (
                <label className="check-chip" style={{ marginTop: "0.5rem" }}>
                  <input
                    type="checkbox"
                    name="portfolio_public"
                    value="on"
                    defaultChecked={sp?.portfolio_public === 1}
                  />
                  <span>Show my personal portfolio to teachers I study with</span>
                </label>
              )}
            </ActionForm>
          </section>
        </div>

        {/* Security & Credentials */}
        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel" style={{ border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.75rem" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Sign-in Email</h2>
            </div>
            <p className="muted small" style={{ marginBottom: "1rem" }}>
              Currently registered as <strong>{user.email}</strong>.
            </p>
            <ActionForm action={changeSignInEmail} submitLabel="Update email address" className="form">
              <label>
                New sign-in email
                <input type="email" name="email" autoComplete="email" required maxLength={190} placeholder="new-email@domain.com" />
              </label>
              <label>
                Current password to verify
                <input type="password" name="current" autoComplete="current-password" required placeholder="••••••••" />
              </label>
            </ActionForm>
          </section>

          <section className="panel" style={{ border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.75rem" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Change Password</h2>
            </div>
            <p className="muted small" style={{ marginBottom: "1rem" }}>
              Ensure your password has at least 8 characters.
            </p>
            <ActionForm action={requestPasswordChange} submitLabel="Update password" className="form">
              <label>
                Current password
                <input type="password" name="current" autoComplete="current-password" required placeholder="••••••••" />
              </label>
              <label>
                New password
                <input type="password" name="password" autoComplete="new-password" minLength={8} required placeholder="••••••••" />
              </label>
              <label>
                Confirm new password
                <input type="password" name="confirm" autoComplete="new-password" minLength={8} required placeholder="••••••••" />
              </label>
            </ActionForm>
          </section>
        </div>
      </div>
    </Shell>
  );
}
