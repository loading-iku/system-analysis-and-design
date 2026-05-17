"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliPrompt } from "@/components/cli/CliPrompt";
import { CliShell } from "@/components/cli/CliShell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = () => {
    router.push("/start");
  };

  return (
    <CliPage>
      <CliShell>
        <span>Log in</span>
        <CliPrompt
          label="Enter your mail"
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
        <CliShell.Blank />
        <CliButtonLink onClick={handleSubmit}>Continue &gt;</CliButtonLink>
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>
    </CliPage>
  );
}
