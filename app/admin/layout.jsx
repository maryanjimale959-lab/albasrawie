import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Shell from "@/components/Shell";
import AuthFrame from "@/components/AuthFrame";
import WrongRole from "@/components/WrongRole";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administrator · Albasrawie",
  /* Never indexed: this is the control room, not a page to be found. */
  robots: { index: false, follow: false },
};

/* Each page draws its own tab bar so it can mark itself active, and the whole
   console still sits inside the same shell as the rest of the app.
   A signed-out visitor is sent to the sign-in page and back here afterwards.
   A signed-in visitor with the wrong role is NOT bounced to their own dashboard
   — they stay on this address and the page tells them, in words, that the console
   is the administrator's and whose account is currently in use. */
export default async function AdminLayout({ children }) {
  const user = await getUser();
  if (!user) redirect("/login?next=%2Fadmin");

  if (user.role !== "admin") {
    return (
      <AuthFrame
        title="Administrator console"
        subtitle="This area belongs to the administrator account."
        tagline="Albasrawie — administrator console"
      >
        <WrongRole user={user} wanted="admin" />
      </AuthFrame>
    );
  }

  return <Shell user={user}>{children}</Shell>;
}
