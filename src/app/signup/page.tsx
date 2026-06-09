"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSignUp } from "@clerk/react/legacy";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliPrompt } from "@/components/cli/CliPrompt";
import { CliShell } from "@/components/cli/CliShell";
import { clerkErrorMessage } from "@/lib/auth/clerkError";
import { currentAuthRedirect } from "@/lib/auth/redirect";
import { useRedirectIfSignedIn } from "@/lib/auth/useRedirectIfSignedIn";
import {
  STUDENT_EMAIL_ERROR,
  isAllowedStudentEmail,
  normalizeStudentEmail,
} from "@/lib/auth/student";

export default function SignUpPage() {
  const router = useRouter();
  const { isSignedIn } = useRedirectIfSignedIn();
  const { isLoaded, signUp } = useSignUp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!isLoaded || submitting) return;
    const trimmedName = name.trim().replace(/\s+/g, " ");
    const normalizedEmail = normalizeStudentEmail(email);

    if (!trimmedName) {
      setError("Full name is required.");
      return;
    }
    if (!isAllowedStudentEmail(normalizedEmail)) {
      setError(STUDENT_EMAIL_ERROR);
      return;
    }
    if (password !== passwordAgain) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signUp.create({
        emailAddress: normalizedEmail,
        password,
        unsafeMetadata: { name: trimmedName },
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      const params = new URLSearchParams();
      if (normalizedEmail) params.set("email", normalizedEmail);
      const redirectTarget = currentAuthRedirect();
      if (redirectTarget !== "/start") {
        params.set("redirect_url", redirectTarget);
      }
      const query = params.toString();
      router.push(query ? `/signup/verify?${query}` : "/signup/verify");
    } catch (err) {
      setError(clerkErrorMessage(err));
      setSubmitting(false);
    }
  };

  if (isSignedIn) {
    return (
      <CliPage>
        <CliShell>
          <span>Redirecting...</span>
        </CliShell>
      </CliPage>
    );
  }

  return (
    <CliPage>
      <CliShell>
        <span>Sign up</span>
        <CliPrompt
          label="Enter your full name"
          autoComplete="name"
          autoFocus
          value={name}
          onChange={setName}
        />
        <CliPrompt
          label="Enter your student mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
        />
        <CliPrompt
          label="Enter your password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />
        <CliPrompt
          label="Enter your password (again)"
          type="password"
          autoComplete="new-password"
          value={passwordAgain}
          onChange={setPasswordAgain}
        />
        {error ? <span>! {error}</span> : <CliShell.Blank />}
        <CliButtonLink onClick={handleSubmit} disabled={submitting || !isLoaded}>
          {submitting ? "Creating account..." : "Continue >"}
        </CliButtonLink>
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>
      {/* Clerk renders its bot-protection (CAPTCHA) widget into this element
          during the custom sign-up flow. Invisible unless a challenge is needed. */}
      <div id="clerk-captcha" />
    </CliPage>
  );
}
