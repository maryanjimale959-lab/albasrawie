import Link from "next/link";
import { Empty, Pill, Progress, StatCard } from "./ui";
import { fmtDate } from "@/lib/format";
import { ensureCourseSettings } from "@/lib/guards";
import { courseGradeSummary, gradeTone, pendingReleaseCount, releasedGradeRows, studentCourseGrades } from "@/lib/grades";
import { teacherCourses } from "@/lib/courses";
import { releaseCourseGrades } from "@/app/actions/grades";

const show = (n) => (n === null ? "—" : `${n}%`);

function CategoryLine({ label, cat }) {
  return (
    <div className="grade-line">
      <span className="grow">{label}</span>
      <span className="muted small">{cat.count > 0 ? `${cat.score}/${cat.max} · weight ${cat.weight}%` : "No released grades yet"}</span>
      <Pill tone={gradeTone(cat.percent)}>{show(cat.percent)}</Pill>
    </div>
  );
}

function GradeCard({ entry, studentId }) {
  const g = entry.grade;
  const rows = releasedGradeRows(studentId, entry.id);
  return (
    <section className="panel" aria-labelledby={`grade-${entry.id}`}>
      <div className="section-title">
        <h2 id={`grade-${entry.id}`}><Link href={`/courses/${entry.id}`}>{entry.name}</Link></h2>
        <Pill tone={gradeTone(g.overall)}>{g.overall === null ? "No grades yet" : `Overall ${g.overall}%`}</Pill>
      </div>
      <Progress value={g.overall ?? 0} label={show(g.overall)} />
      <div className="grade-cats">
        <CategoryLine label="Assignments" cat={g.assignments} />
        <CategoryLine label="Projects" cat={g.projects} />
        <CategoryLine label="Quizzes" cat={g.quizzes} />
      </div>
      {rows.length === 0 ? (
        <p className="small muted">{entry.teacher_name} hasn't released any marks for this course yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Assessment</th><th>Date</th><th>Score</th><th>Feedback</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`}>
                  <td><span className="chip">{r.kind === "assignment" ? "Assignment" : "Project"}</span> {r.title}</td>
                  <td>{fmtDate(r.submitted_at)}</td>
                  <td><strong>{r.score}</strong>/{r.max_marks}</td>
                  <td>
                    <Link href={`/${r.kind === "assignment" ? "assignments" : "projects"}/${r.parent_id}`}>View</Link>
                    {r.feedback && <span className="muted small"> · {r.feedback.slice(0, 60)}{r.feedback.length > 60 ? "…" : ""}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StudentGrades({ user, courseId }) {
  const entries = studentCourseGrades(user.id, { courseId });
  if (!entries.length) {
    return (
      <Empty title="No grades yet" text="Join a course and your released marks will show up here.">
        <Link href="/courses" className="btn">My courses</Link>
      </Empty>
    );
  }
  const overallList = entries.map((e) => e.grade.overall).filter((n) => n !== null);
  const average = overallList.length ? Math.round(overallList.reduce((n, v) => n + v, 0) / overallList.length) : null;
  const released = entries.reduce((n, e) => n + e.grade.assignments.count + e.grade.projects.count, 0);
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Average" value={show(average)} hint="across graded courses" />
        <StatCard label="Courses graded" value={`${overallList.length}/${entries.length}`} />
        <StatCard label="Released marks" value={released} tone="green" />
      </div>
      {entries.map((e) => <GradeCard key={e.id} entry={e} studentId={user.id} />)}
    </>
  );
}

function TeacherGrades({ user, courseId, course, basePath }) {
  const id = Number(courseId);
  if (!id) {
    const list = teacherCourses(user.id);
    if (!list.length) {
      return (
        <Empty title="No courses yet" text="Grades appear once you have a course with released marks.">
          <Link href="/courses/new" className="btn">Create a course</Link>
        </Empty>
      );
    }
    return (
      <section className="panel" aria-labelledby="pick-h">
        <h2 id="pick-h">Pick a course</h2>
        <p className="small muted">Choose a course to see each student's overall percentage.</p>
        <form className="row" method="get" action={basePath}>
          <label>Course
            <select name="course" defaultValue="">
              <option value="" disabled>Choose a course…</option>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? " (archived)" : ""}</option>)}
            </select>
          </label>
          <div style={{ alignSelf: "end" }}><button className="btn" type="submit">Show grades</button></div>
        </form>
      </section>
    );
  }

  const summary = courseGradeSummary(id);
  const weights = ensureCourseSettings(id);
  const pending = pendingReleaseCount(id);
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Students" value={summary.studentCount} />
        <StatCard label="Class average" value={show(summary.averageOverall)} hint="released marks only" />
        <StatCard label="Assignments avg" value={show(summary.averageAssignments)} />
        <StatCard label="Projects avg" value={show(summary.averageProjects)} />
        <StatCard label="Marks released" value={summary.releasedCount} tone="green" />
      </div>
      <section className="panel" aria-labelledby="roster-h">
        <div className="section-title">
          <h2 id="roster-h">{course?.name || "Course"} roster</h2>
          {pending > 0 && (
            <form action={releaseCourseGrades}>
              <input type="hidden" name="course_id" value={id} />
              <button className="btn ghost sm" type="submit">Release {pending} scored mark{pending === 1 ? "" : "s"}</button>
            </form>
          )}
        </div>
        {summary.roster.length === 0 ? (
          <Empty title="No students enrolled" text="Share your course code so students can join." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Student</th><th>Assignments</th><th>Projects</th><th>Released marks</th><th>Overall</th></tr>
              </thead>
              <tbody>
                {summary.roster.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/students/${s.id}`}><strong>{s.full_name}</strong></Link><div className="small muted">{s.class_name}</div></td>
                    <td>
                      {s.grade.assignments.count ? `${s.grade.assignments.score}/${s.grade.assignments.max}` : "—"}
                      {s.grade.assignments.percent !== null && <> <Pill tone={gradeTone(s.grade.assignments.percent)}>{s.grade.assignments.percent}%</Pill></>}
                    </td>
                    <td>
                      {s.grade.projects.count ? `${s.grade.projects.score}/${s.grade.projects.max}` : "—"}
                      {s.grade.projects.percent !== null && <> <Pill tone={gradeTone(s.grade.projects.percent)}>{s.grade.projects.percent}%</Pill></>}
                    </td>
                    <td className="small muted">{s.grade.assignments.count + s.grade.projects.count}</td>
                    <td><Pill tone={gradeTone(s.grade.overall)}>{show(s.grade.overall)}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">
          Overall % is weighted by this course's settings (assignments {weights.weight_assignments}%, projects {weights.weight_projects}%,
          quizzes {weights.weight_quizzes}%). Quizzes hold no marks yet, so their weight is set aside and the remaining weights are shared out
          over the categories that have released grades.
        </p>
      </section>
    </>
  );
}

/** Reused by /grades and /courses/[id]/grades. */
export default function GradesView({ user, courseId = null, course = null, basePath = "/grades" }) {
  return user.role === "student"
    ? <StudentGrades user={user} courseId={courseId} />
    : <TeacherGrades user={user} courseId={courseId} course={course} basePath={basePath} />;
}
