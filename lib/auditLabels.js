import { db } from "./db";
import { fmtDate } from "./format";

/*
 * Human-readable names for the keys the app writes into audit_logs.
 * Every entry here maps a key that actually exists in the code; anything
 * unknown falls back to its own words rather than a guess, so a new action is
 * never displayed under the wrong label.
 */
const NAMED = {
  "admin.teacher_approved": "Approved a teacher",
  "admin.teacher_rejected": "Did not approve a teacher",
  "admin.account_suspended": "Suspended an account",
  "admin.account_restored": "Restored an account",
  "admin.role_changed": "Changed a role",
  "admin.account_created": "Created an account",
  "admin.password_reset": "Reset a password",
  "admin.course_transferred": "Handed over a course",

  "user.login": "Signed in",
  "user.register": "Created an account",
  "user.email_changed": "Changed the sign-in email",

  "course.create": "Created a course",
  "course.invite": "Shared an enrollment code",
  "course.archive": "Archived a course",
  "course.unarchive": "Unarchived a course",
  "course.code.regenerate": "Made a new course code",
  "course.code.disable": "Turned the course code off",

  "enrollment.create": "Enrolled a student",
  "enrollment.remove": "Removed a student",

  "attendance.start": "Opened an attendance session",
  "attendance.close": "Closed an attendance session",
  "attendance.reopen": "Reopened an attendance session",
  "attendance.join": "Marked attendance",
  "attendance.mark": "Marked a student",
  "attendance.correct": "Corrected an attendance record",

  "assignment.create": "Created an assignment",
  "assignment.update": "Changed an assignment",
  "assignment.submit": "Submitted an assignment",

  "project.create": "Created a project",
  "project.publish": "Published a project",
  "project.unpublish": "Unpublished a project",
  "project.submit": "Submitted a project",

  "material.create": "Added a material",
  "material.delete": "Deleted a material",
  "material.publish": "Published a material",
  "material.unpublish": "Unpublished a material",

  "announcement.create": "Posted an announcement",
  "announcement.delete": "Deleted an announcement",

  "grade.review": "Reviewed a submission",
  "grade.feedback": "Left feedback",
  "grade.release": "Released grades",
  "grade.revision": "Revised a grade",
  "grade.reopen": "Reopened a grade",

  "portfolio.create": "Published portfolio work",
  "portfolio.delete": "Removed portfolio work",
};

export const auditLabel = (action = "") =>
  NAMED[action] ||
  action
    .replace(/^admin\./, "")
    .replace(/[._]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

/*
 * Signing in is recorded, but it is noise on a screen meant to show what
 * changed. Both admin screens hide it behind a filter instead of deleting it.
 */
export const is_signin = (action = "") => action === "user.login";

/** "course:3" reads better as "course 3" when no name can be found for it. */
export const targetLabel = (target = "") => target
  .replace(/^user:/, "account ")
  .replace(/^course:/, "course ")
  .replace(/^project:/, "project ")
  .replace(/^assignment:/, "assignment ")
  .replace(/^attendance:/, "attendance ")
  .replace(/^session:/, "attendance session ")
  .replace(/^material:/, "material ")
  .replace(/^announcement:/, "announcement ")
  .replace(/^personal_project:/, "portfolio item ");

// Which column actually names each kind of record.
const NAMED_BY = {
  user: { table: "users", name: "full_name" },
  course: { table: "courses", name: "name", word: "course" },
  assignment: { table: "assignments", name: "title", word: "assignment" },
  project: { table: "projects", name: "title", word: "project" },
  material: { table: "materials", name: "title", word: "material" },
  announcement: { table: "announcements", name: "title", word: "announcement" },
  personal_project: { table: "personal_projects", name: "title", word: "portfolio item" },
  session: { table: "attendance_sessions", name: "session_date", word: "attendance", date: true },
};

/**
 * Turn audit targets into something an administrator can read: the person's
 * name rather than "account 12", the course title rather than "course 3".
 * One query per kind, so a page of 300 entries costs a handful of lookups.
 */
export async function resolveTargets(rows = []) {
  const ids = {};
  for (const row of rows) {
    const target = String(row?.target || "");
    const sep = target.indexOf(":");
    if (sep < 1) continue;
    const kind = target.slice(0, sep);
    const id = target.slice(sep + 1);
    if (!NAMED_BY[kind] || !/^\d+$/.test(id)) continue;
    (ids[kind] ||= new Set()).add(id);
  }

  const found = new Map();
  for (const [kind, set] of Object.entries(ids)) {
    const list = [...set];
    const rowsOut = await db.prepare(
      `SELECT id, ${NAMED_BY[kind].name} AS label FROM ${NAMED_BY[kind].table} WHERE id IN (${list.map(() => "?").join(",")})`
    ).all(...list);
    for (const r of rowsOut) {
      const spec = NAMED_BY[kind];
      const raw = String(r.label || "").trim();
      if (!raw) continue;
      const name = spec.date ? fmtDate(raw) : raw;
      found.set(`${kind}:${r.id}`, spec.word ? `${spec.word} · ${name}` : name);
    }
  }

  return (target = "") => found.get(String(target || "")) || targetLabel(target);
}
