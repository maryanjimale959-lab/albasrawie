import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { teacherCourses } from "@/lib/courses";
import { localDate } from "@/lib/activity";
import Shell from "@/components/Shell";
import { StatCard, Bars, Pill, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics · Albasrawie" };

const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function AnalyticsPage() {
  const user = requireUser("teacher");
  const courses = teacherCourses(user.id).filter((c) => !c.archived);
  const today = localDate(user.time_zone);

  return (
    <Shell user={user}>
      <div className="page-head">
        <div><h1>Analytics</h1><p className="muted">How your classes are doing — submissions, attendance and activity.</p></div>
      </div>
      {courses.length === 0 ? (
        <Empty title="No active courses" text="Create a course and invite students to see analytics here." />
      ) : courses.map((c) => {
        const stats = db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM enrollments WHERE course_id = ? AND status='active') students,
            (SELECT COUNT(*) FROM assignments WHERE course_id = ? AND published=1) assignments,
            (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.course_id=?) subs,
            (SELECT COUNT(*) FROM assignments a JOIN enrollments e ON e.course_id=a.id AND e.status='active'
              WHERE a.course_id=? AND a.published=1 AND EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id=a.id AND s.student_id=e.student_id)) done_pairs,
            (SELECT COUNT(*) FROM assignments a JOIN enrollments e ON e.course_id=a.id AND e.status='active'
              WHERE a.course_id=? AND a.published=1) all_pairs,
            (SELECT ROUND(AVG(100.0*s.score/a.max_marks),1) FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id
              WHERE a.course_id=? AND s.grade_released=1 AND s.score IS NOT NULL) avg_assign,
            (SELECT ROUND(100.0*SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END)/COUNT(*)) FROM attendance_records r
              JOIN attendance_sessions s ON s.id=r.session_id AND s.status='closed' WHERE s.course_id=?) att_rate`).get(c.id, c.id, c.id, c.id, c.id, c.id, c.id);
        const weekly = [];
        for (let w = 11; w >= 0; w--) {
          const from = addDays(today, -w * 7 - 6), to = addDays(today, -w * 7);
          const n = db.prepare(`SELECT COUNT(*) n FROM learning_activities la JOIN enrollments e ON e.student_id = la.student_id AND e.course_id = ? AND e.status='active'
            WHERE la.activity_date BETWEEN ? AND ?`).get(c.id, from, to).n;
          weekly.push({ label: `Week of ${from}`, short: from.slice(5, 7), count: n });
        }
        const topStudents = db.prepare(`
          SELECT u.id, u.full_name, COUNT(*) n FROM learning_activities la JOIN users u ON u.id = la.student_id
          JOIN enrollments e ON e.student_id = u.id AND e.course_id = ? AND e.status='active'
          GROUP BY u.id ORDER BY n DESC LIMIT 5`).all(c.id);
        const needSupport = db.prepare(`
          SELECT u.id, u.full_name,
            (SELECT COUNT(*) FROM assignments a WHERE a.course_id=? AND a.published=1 AND a.due_at < datetime('now')
              AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id=a.id AND s.student_id=u.id)) missing,
            (SELECT ROUND(100.0*SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END)/COUNT(*)) FROM attendance_records r
              JOIN attendance_sessions s ON s.id=r.session_id AND s.status='closed' WHERE s.course_id=? AND r.student_id=u.id) att
          FROM enrollments e JOIN users u ON u.id=e.student_id
          WHERE e.course_id=? AND e.status='active' GROUP BY u.id HAVING missing > 0 OR att < 70 ORDER BY missing DESC LIMIT 5`).all(c.id, c.id, c.id);

        return (
          <Reveal key={c.id}>
            <section className="panel">
            <div className="section-title">
              <h2><Link href={`/courses/${c.id}`}>{c.name}</Link></h2>
              <span className="chip" style={{ fontFamily: "ui-monospace, monospace" }}>{c.course_code}</span>
            </div>
            <div className="stat-grid">
              <StatCard label="Students" value={c.student_count} />
              <StatCard label="Submission rate" value={stats.all_pairs ? `${Math.round((stats.done_pairs / stats.all_pairs) * 100)}%` : "—"} hint={`${stats.subs} submissions`} tone={stats.all_pairs && stats.done_pairs / stats.all_pairs < 0.6 ? "warn" : "green"} />
              <StatCard label="Avg grade" value={stats.avg_assign === null ? "—" : `${Math.round(stats.avg_assign)}%`} />
              <StatCard label="Attendance" value={stats.att_rate === null ? "—" : `${stats.att_rate}%`} />
            </div>
            <h3>Class activity — last 12 weeks</h3>
            <Bars data={weekly} unit="activities" />
            <div className="row" style={{ marginTop: ".5rem" }}>
              <div>
                <h3>Most active students</h3>
                {topStudents.length === 0 ? <p className="muted small">No activity recorded yet.</p> : topStudents.map((s, i) => (
                  <div key={s.id} className="feed-item"><span className="feed-dot" /><span className="feed-main"><Link href={`/students/${s.id}`}>{i + 1}. {s.full_name}</Link></span><span className="feed-date">{s.n} items</span></div>
                ))}
              </div>
              <div>
                <h3>May need support</h3>
                {needSupport.length === 0 ? <p className="muted small">No warnings.</p> : needSupport.map((s) => (
                  <div key={s.id} className="feed-item"><span className="feed-dot" style={{ background: "var(--danger)" }} /><span className="feed-main"><Link href={`/students/${s.id}`}>{s.full_name}</Link></span>
                    {s.missing > 0 && <Pill tone="red">{s.missing} missing</Pill>}
                    {s.att !== null && s.att < 70 && <Pill tone="amber">{s.att}% attendance</Pill>}
                  </div>
                ))}
              </div>
            </div>
          </section>
          </Reveal>
        );
      })}
    </Shell>
  );
}
