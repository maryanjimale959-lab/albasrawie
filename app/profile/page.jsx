import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import Shell from "@/components/Shell";
import StudentProfileView from "@/components/StudentProfileView";

export const dynamic = "force-dynamic";
export const metadata = { title: "My profile · Albasrawie" };

export default function MyProfile() {
  const user = requireUser();
  const student = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  return <Shell user={user}><StudentProfileView student={student} viewer={user} /></Shell>;
}
