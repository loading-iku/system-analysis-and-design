"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliPrompt } from "@/components/cli/CliPrompt";
import { CliShell } from "@/components/cli/CliShell";

function maskEmail(raw: string | null): string {
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
  const masked = maskEmail(search.get("email"));
  const [code, setCode] = useState("");

  const handleSubmit = () => {
    router.push("/start");
  };

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
      <CliShell.Blank />
      <CliButtonLink onClick={handleSubmit}>Continue &gt;</CliButtonLink>
      <CliShell.Blank />
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
