"use client";

import { CliLink } from "@/components/cli/CliLink";
import { CliShell } from "@/components/cli/CliShell";
import styles from "./LevelCompleteOverlay.module.css";

type Props = {
  elapsedMs: number;
  successRate: number;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} sec${seconds === 1 ? "" : "s"}`;
  }
  if (seconds === 0) {
    return `${minutes} min${minutes === 1 ? "" : "s"}`;
  }
  return `${minutes} min${minutes === 1 ? "" : "s"} ${seconds} sec${
    seconds === 1 ? "" : "s"
  }`;
}

export function LevelCompleteOverlay({ elapsedMs, successRate }: Props) {
  const elapsed = formatElapsed(elapsedMs);
  return (
    <div className={styles.overlay} role="dialog" aria-label="Level complete">
      <div className={styles.panel}>
        <CliShell>
          <span>You completed the level!</span>
          <span>{elapsed}</span>
          <span>{successRate}% succession rate</span>
          <CliShell.Blank />
          <CliLink href="/start">Continue &gt;</CliLink>
          <CliShell.Blank />
          <CliShell.Blank />
          <CliShell.Blank />
          <CliShell.Blank />
          <CliShell.Blank />
        </CliShell>
      </div>
    </div>
  );
}
