"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSignIn } from "@clerk/react/legacy";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliPrompt } from "@/components/cli/CliPrompt";
import { CliShell } from "@/components/cli/CliShell";
import { clerkErrorMessage } from "@/lib/auth/clerkError";
import { currentAuthRedirect } from "@/lib/auth/redirect";
import {
  STUDENT_EMAIL_ERROR,
  isAllowedStudentEmail,
  normalizeStudentEmail,
} from "@/lib/auth/student";

export default function LoginPage() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!isLoaded || submitting) return;
    const normalizedEmail = normalizeStudentEmail(email);
    if (!isAllowedStudentEmail(normalizedEmail)) {
      setError(STUDENT_EMAIL_ERROR);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn.create({
        strategy: "password",
        identifier: normalizedEmail,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(currentAuthRedirect("/start"));
      } else {
        setError("Password sign-in could not be completed.");
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CliPage>
      <CliShell>
        <span>Log in</span>
        <CliPrompt
          label="Enter your student mail"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={setEmail}
        />
        <CliPrompt
          label="Enter your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        {error ? <span>! {error}</span> : <CliShell.Blank />}
        <CliButtonLink onClick={handleSubmit} disabled={submitting || !isLoaded}>
          {submitting ? "Signing in..." : "Continue >"}
        </CliButtonLink>
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>
    </CliPage>
  );
}
