import { getUser } from "@/lib/auth";
import { courseForTeacher } from "@/lib/guards";
import * as att from "@/lib/attendance";

export const dynamic = "force-dynamic";

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(_req, { params }) {
  const user = getUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (user.role === "student") return new Response("Not found", { status: 404 });

  const session = att.getSession(Number(params.sessionId));
  if (!session || session.course_id !== Number(params.id)) return new Response("Not found", { status: 404 });
  const course = courseForTeacher(user, session.course_id); // re-checks ownership server-side
  if (!course) return new Response("Not found", { status: 404 });

  const rows = att.sessionRecords(session.id);
  const lines = ["name,student_id,status,marked_at,method"];
  for (const r of rows) {
    lines.push([r.full_name, r.roll_no || "", r.status, r.marked_at, r.method].map(csvCell).join(","));
  }
  const csv = lines.join("\r\n") + "\r\n";

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendance-course-${course.id}-session-${session.id}.csv"`,
      "cache-control": "no-store",
    },
  });
}
