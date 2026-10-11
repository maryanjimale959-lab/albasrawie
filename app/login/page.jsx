import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { login } from "@/app/actions";
import AuthFrame from "@/components/AuthFrame";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Log in · Albasrawie" };

export default function LoginPage({ searchParams }) {
  if (getUser()) redirect("/dashboard");

  return (
    <AuthFrame
      title="Welcome back"
      subtitle="Enter your credentials to access your academic dashboard."
      footer="Protected by server-side sessions. Your data never leaves this device."
    >
      <LoginForm action={login} next={searchParams?.next || ""} />
    </AuthFrame>
  );
}

