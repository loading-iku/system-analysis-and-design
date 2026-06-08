"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import type { ReactNode } from "react";
import { useSignUp } from "@clerk/react/legacy";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliLink } from "@/components/cli/CliLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliPrompt } from "@/components/cli/CliPrompt";
import { CliShell } from "@/components/cli/CliShell";
import { clerkErrorMessage } from "@/lib/auth/clerkError";
import { resolveAuthRedirect } from "@/lib/auth/redirect";

function maskEmail(raw: string | null | undefined): string {
  if (!raw) return "s****@gmail.com";
  const at = raw.indexOf("@");
  if (at <= 0) return raw;
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}${domain}`;
}

function VerifyContent() {
  const router = useRouter();
  const search = useSearchParams();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const masked = maskEmail(signUp?.emailAddress ?? search.get("email"));
  // While Clerk loads, assume an attempt may exist to avoid flashing the
  // "no verification" screen; once loaded, the attempt must carry an email.
  const hasPendingAttempt = !isLoaded || Boolean(signUp?.emailAddress);

  const handleSubmit = async () => {
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(resolveAuthRedirect(search.get("redirect_url")));
      } else {
        setError("Invalid or incomplete verification. Check the code.");
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || submitting) return;
    setError(null);
    setNotice(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setNotice("A new code has been sent.");
    } catch (err) {
      setError(clerkErrorMessage(err));
    }
  };

  if (!hasPendingAttempt) {
    return (
      <CliShell>
        <span>No verification in progress.</span>
        <CliLink href="/signup">Back to sign up &gt;</CliLink>
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>
    );
  }

  let messageLine: ReactNode = <CliShell.Blank />;
  if (error) {
    messageLine = <span>! {error}</span>;
  } else if (notice) {
    messageLine = <span>{notice}</span>;
  }

  return (
    <CliShell>
      <span>Enter the verification code</span>
      <span>sent to {masked}</span>
      <CliPrompt
        label="Verification Code"
        autoFocus
        value={code}
        onChange={setCode}
      />
      {messageLine}
      <CliButtonLink onClick={handleSubmit} disabled={submitting || !isLoaded}>
        {submitting ? "Verifying..." : "Continue >"}
      </CliButtonLink>
      <CliButtonLink onClick={handleResend} disabled={submitting || !isLoaded}>
        Resend code &gt;
      </CliButtonLink>
      <span>Loading Inc. © 2026</span>
    </CliShell>
  );
}

export default function VerifyPage() {
  return (
    <CliPage>
      <Suspense fallback={null}>
        <VerifyContent />
      </Suspense>
    </CliPage>
  );
}
