"use client";

import { useState } from "react";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliShell } from "@/components/cli/CliShell";
import { resetProgressProfile } from "@/lib/progress";

const RESET_CONFIRMATION_MESSAGE =
  "Reset all progress? This will clear your endings, unlocked levels, XP, and coins.";

type ActionState = "idle" | "working" | "done" | "error";

const RESET_STATUS_TEXT: Record<ActionState, string> = {
  idle: "Status: ready",
  working: "Status: resetting progress...",
  done: "Status: progress reset. Open Levels to start over.",
  error: "Status: reset failed. Try again.",
};

const EXPORT_STATUS_TEXT: Record<ActionState, string> = {
  idle: "Status: ready",
  working: "Status: exporting logs...",
  done: "Status: export downloaded.",
  error: "Status: export failed. Try again.",
};

export function StartSettingsPanel() {
  const [resetState, setResetState] = useState<ActionState>("idle");
  const [exportState, setExportState] = useState<ActionState>("idle");

  async function handleReset() {
    if (resetState === "working") return;
    if (!window.confirm(RESET_CONFIRMATION_MESSAGE)) return;

    setResetState("working");

    try {
      await resetProgressProfile();
      setResetState("done");
    } catch {
      setResetState("error");
    }
  }

  async function handleExport() {
    if (exportState === "working") return;

    setExportState("working");

    try {
      const response = await fetch("/api/export/logs", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to export logs.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = readDownloadFilename(response.headers);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 0);
      setExportState("done");
    } catch {
      setExportState("error");
    }
  }

  return (
    <CliShell>
      <span>{"// settings"}</span>
      <span>## Reset progress</span>
      <span>Reset your saved endings, unlocked levels, XP, and coins.</span>
      <span>This cannot be undone.</span>
      <CliButtonLink
        onClick={() => void handleReset()}
        disabled={resetState === "working"}
      >
        {resetState === "working" ? "> Resetting progress..." : "> Reset progress"}
      </CliButtonLink>
      <span>{RESET_STATUS_TEXT[resetState]}</span>
      <CliShell.Blank />
      <span>## Export logs as JSONL</span>
      <span>Download GPAF-style leaderboard and progress events.</span>
      <span>Each log line includes player name, student number, and pseudo ID.</span>
      <span>Only available while signed in with your IKU student account.</span>
      <CliButtonLink
        onClick={() => void handleExport()}
        disabled={exportState === "working"}
      >
        {exportState === "working"
          ? "> Exporting logs..."
          : "> Export logs as JSONL"}
      </CliButtonLink>
      <span>{EXPORT_STATUS_TEXT[exportState]}</span>
    </CliShell>
  );
}

function readDownloadFilename(headers: Headers): string {
  const match = headers.get("Content-Disposition")?.match(/filename="([^"]+)"/);
  if (match?.[1]) return match[1];

  return `logic-path-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
}
