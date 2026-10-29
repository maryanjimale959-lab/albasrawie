import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import { pendingVerification, maskEmail } from "@/lib/otp";
import { verifyEmail, resendEmailCode } from "@/app/actions";
import AuthFrame from "@/components/AuthFrame";
import ActionForm from "@/components/ActionForm";

export const metadata = { title: "Confirm your email · Albasrawie", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/* Reached right after sign-up, or from the sign-in form when an account never
   entered its code. Which account is being confirmed comes from the short-lived
   cookie lib/otp.js sets, never from the address. */
export default async function VerifyPage({ searchParams }) {
  const signedIn = await getUser();
  if (signedIn) redirect(homeFor(signedIn.role));
  const pending = await pendingVerification();
  const failed = searchParams?.failed === "1";

  if (!pending) {
    return (
      <AuthFrame title="Nothing to confirm here" subtitle="This page opens right after you create an account.">
        <div className="alert info">
          Your sign-up code has expired or was already used. Sign in with your email and password and we will send a new code if your email still needs confirming.
        </div>
        <p className="small"><Link href="/login"><strong>Go to sign in</strong></Link></p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Confirm your email"
      subtitle={`We sent a 6-digit code to ${maskEmail(pending.email)}. Enter it below to finish creating your account.`}
    >
      {failed && (
        <div className="alert error" role="alert">
          Your account was created, but the email with your code could not be sent. Use “Send a new code” below in a minute.
        </div>
      )}
      <ActionForm action={verifyEmail} submitLabel="Confirm email">
        <label>Verification code <span className="hint">6 digits, valid for 10 minutes</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
        </label>
      </ActionForm>
      <ActionForm action={resendEmailCode} submitLabel="Send a new code">
        <p className="small muted">No email? Check your spam folder, or ask for a new code.</p>
      </ActionForm>
      <p className="small">Wrong address? <Link href="/login"><strong>Back to sign in</strong></Link></p>
    </AuthFrame>
  );
}
