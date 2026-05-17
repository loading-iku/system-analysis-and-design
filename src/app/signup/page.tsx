"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliPrompt } from "@/components/cli/CliPrompt";
import { CliShell } from "@/components/cli/CliShell";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");

  const handleSubmit = () => {
    const encoded = email ? encodeURIComponent(email) : "";
    router.push(encoded ? `/signup/verify?email=${encoded}` : "/signup/verify");
  };

  return (
    <CliPage>
      <CliShell>
        <span>Sign up</span>
        <CliPrompt
          label="Enter your name"
          autoComplete="name"
          autoFocus
          value={name}
          onChange={setName}
        />
        <CliPrompt
          label="Enter your mail"
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
        <CliShell.Blank />
        <CliButtonLink onClick={handleSubmit}>Continue &gt;</CliButtonLink>
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>
    </CliPage>
  );
}
