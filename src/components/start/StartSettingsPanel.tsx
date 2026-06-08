"use client";

import { useState } from "react";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliShell } from "@/components/cli/CliShell";
import { resetProgressProfile } from "@/lib/progress";

const RESET_CONFIRMATION_MESSAGE =
  "Reset all progress? This will clear your endings, unlocked levels, XP, and coins.";

type ResetState = "idle" | "working" | "done" | "error";

const STATUS_TEXT: Record<ResetState, string> = {
  idle: "Status: ready",
  working: "Status: resetting progress...",
  done: "Status: progress reset. Open Levels to start over.",
  error: "Status: reset failed. Try again.",
};

export function StartSettingsPanel() {
  const [state, setState] = useState<ResetState>("idle");

  async function handleReset() {
    if (state === "working") return;
    if (!window.confirm(RESET_CONFIRMATION_MESSAGE)) return;

    setState("working");

    try {
      await resetProgressProfile();
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <CliShell>
      <span>{"// settings"}</span>
      <span>Reset your saved endings, unlocked levels, XP, and coins.</span>
      <span>This cannot be undone.</span>
      <CliButtonLink onClick={() => void handleReset()} disabled={state === "working"}>
        {state === "working" ? "> Resetting progress..." : "> Reset progress"}
      </CliButtonLink>
      <span>{STATUS_TEXT[state]}</span>
    </CliShell>
  );
}
