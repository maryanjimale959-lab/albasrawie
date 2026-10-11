import { redirect } from "next/navigation";

// Personal projects appear in the main Projects list; this keeps the URL honest.
export default function PersonalProjectsPage() {
  redirect("/projects");
}
