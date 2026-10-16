import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { teacherSeesStudent } from "@/lib/guards";
import Shell from "@/components/Shell";
import StudentProfileView from "@/components/StudentProfileView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Student profile · Albasrawie" };

export default async function StudentProfile({ params, searchParams }) {
  const user = await requireUser("teacher");
  const student = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(Number(params.id));
  if (!student) notFound();
  if (user.role !== "admin" && !(await teacherSeesStudent(user.id, student.id))) notFound();
  const selectedDay = searchParams?.day ? String(searchParams.day) : null;
  return <Shell user={user}><StudentProfileView student={student} viewer={user} selectedDay={selectedDay} /></Shell>;
}
