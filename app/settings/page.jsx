import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateProfile, uploadAvatar, requestPasswordChange } from "@/app/actions/settings";
import Shell from "@/components/Shell";
import ActionForm from "@/components/ActionForm";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Albasrawie" };

function zones() {
  try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC", "Africa/Mogadishu", "Europe/London", "America/New_York"]; }
}

export default function SettingsPage() {
  const user = requireUser();
  const sp = user.role === "student" ? db.prepare("SELECT * FROM student_profiles WHERE user_id = ?").get(user.id) : null;
  const tp = user.role === "teacher" ? db.prepare("SELECT * FROM teacher_profiles WHERE user_id = ?").get(user.id) : null;
  const allZones = zones();
  const tz = user.time_zone && allZones.includes(user.time_zone) ? user.time_zone : "UTC";

  return (
    <Shell user={user}>
      <div className="page-head">
        <div style={{ display: "flex", gap: ".9rem", alignItems: "center" }}>
          <Avatar name={user.full_name} size={48} img={user.avatar_url} />
          <div><h1>Settings</h1><p className="muted">{user.email} · {user.role}</p></div>
        </div>
      </div>

      <div className="layout-2">
        <section className="panel">
          <h2>Profile</h2>
          <ActionForm action={updateProfile} submitLabel="Save changes" className="form">
            <label>Full name<input name="full_name" defaultValue={user.full_name} required maxLength={100} /></label>
            <div className="row">
              <label>Time zone
                <select name="time_zone" defaultValue={tz}>
                  {!allZones.includes(tz) && <option value={tz}>{tz}</option>}
                  {allZones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              {user.role === "student" && <label>Class / study group<input name="class_name" defaultValue={sp?.class_name || ""} maxLength={100} /></label>}
              {user.role === "teacher" && <label>Organization<input name="organization" defaultValue={tp?.organization || ""} maxLength={150} /></label>}
              {user.role === "teacher" && <label>Department<input name="department" defaultValue={tp?.department || ""} maxLength={150} /></label>}
            </div>
            <label>Biography
              <textarea name="bio" defaultValue={sp?.bio || tp?.bio || ""} maxLength={600} placeholder={user.role === "teacher" ? "A short professional biography students will see." : "What are you learning? Optional."} />
            </label>
            {user.role === "student" && (
              <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 700 }}>
                <input type="checkbox" name="portfolio_public" defaultChecked={sp?.portfolio_public === 1} style={{ width: "auto" }} />
                Show my personal portfolio on my profile to teachers I know
              </label>
            )}
          </ActionForm>
        </section>

        <div style={{ display: "grid", gap: "1.5rem", minWidth: 0 }}>
          <section className="panel">
            <h2>Profile picture</h2>
            <ActionForm action={uploadAvatar} submitLabel="Upload" className="form">
              <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required />
            </ActionForm>
            <p className="small muted">Stored privately on this server and only shown to you and your teachers.</p>
          </section>

          <section className="panel">
            <h2>Password</h2>
            <ActionForm action={requestPasswordChange} submitLabel="Change password" className="form">
              <label>Current password<input type="password" name="current" autoComplete="current-password" required /></label>
              <label>New password<input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
              <label>Confirm new password<input type="password" name="confirm" autoComplete="new-password" minLength={8} required /></label>
            </ActionForm>
            <p className="small muted">Email password-reset isn't configured for this deployment yet — change it here while signed in.</p>
          </section>
        </div>
      </div>
    </Shell>
  );
}
