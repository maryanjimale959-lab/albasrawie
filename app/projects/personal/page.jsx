import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Personal projects appear in the main Projects list; this keeps the URL honest.
export default function PersonalProjectsPage() {
  redirect("/projects");
}
