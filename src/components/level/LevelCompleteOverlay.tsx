"use client";

import { useEffect, useMemo, useState } from "react";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliLink } from "@/components/cli/CliLink";
import { CliShell } from "@/components/cli/CliShell";
import type { LevelEnding, LevelSummary } from "@/lib/level/types";
import {
  formatEndingTier,
  recordLevelRunSummary,
  useProgressProfile,
} from "@/lib/progress";
import styles from "./LevelCompleteOverlay.module.css";

type Props = {
  summary: LevelSummary;
  endings: LevelEnding[];
  onReplay: () => void;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${totalSeconds} sec${totalSeconds === 1 ? "" : "s"}`;
  }
  if (seconds === 0) {
    return `${minutes} min${minutes === 1 ? "" : "s"}`;
  }
  return `${minutes} min${minutes === 1 ? "" : "s"} ${seconds} sec${
    seconds === 1 ? "" : "s"
  }`;
}

export function LevelCompleteOverlay({ summary, endings, onReplay }: Props) {
  const runKey = `${summary.levelId}:${summary.endingId}:${summary.at}`;
  const [syncedSummary, setSyncedSummary] = useState(summary);
  const [syncedRunKey, setSyncedRunKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void recordLevelRunSummary(summary).then((result) => {
      if (cancelled) return;
      setSyncedSummary(result.summary);
      setSyncedRunKey(runKey);
    });

    return () => {
      cancelled = true;
    };
  }, [runKey, summary]);

  const displaySummary = syncedRunKey === runKey ? syncedSummary : summary;
  const syncState = syncedRunKey === runKey ? "saved" : "saving";

  const profile = useProgressProfile();
  const orderedEndings = useMemo(
    () => [...endings].sort((a, b) => a.rank - b.rank),
    [endings],
  );
  const endingTitlesById = useMemo(
    () => new Map(endings.map((ending) => [ending.id, ending.title])),
    [endings],
  );
  const seenEndingIds = useMemo(() => {
    const seen = new Set(profile.levels[summary.levelId]?.seenEndingIds ?? []);
    // The ending just reached always counts, even before the sync resolves.
    seen.add(summary.endingId);
    return seen;
  }, [profile, summary.levelId, summary.endingId]);
  const unlockedNextReplay = useMemo(
    () =>
      displaySummary.outcomesUnlocked
        .map((endingId) => ({
          id: endingId,
          title: endingTitlesById.get(endingId) ?? endingId,
        }))
        .filter((ending) => Boolean(ending.title)),
    [displaySummary.outcomesUnlocked, endingTitlesById],
  );

  const discoveredCount = orderedEndings.filter((ending) =>
    seenEndingIds.has(ending.id),
  ).length;
  const allDiscovered =
    orderedEndings.length > 0 && discoveredCount >= orderedEndings.length;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Level complete">
      <div className={styles.panel}>
        <CliShell>
          <span>{displaySummary.endingLabel}</span>
          <span>{`Ending tier: ${formatEndingTier(displaySummary.endingTier)}`}</span>
          <span>{formatElapsed(displaySummary.run.elapsedMs)}</span>
          <span>{`${displaySummary.run.successRate}% success rate`}</span>
          <span>{`Rewards: +${displaySummary.earned.xp} XP | +${displaySummary.earned.coins} coins`}</span>
          <span>{`Totals: ${displaySummary.totalsAfterRun.xp} XP | ${displaySummary.totalsAfterRun.coins} coins`}</span>
          <span>
            {displaySummary.progress.bestPathAchieved
              ? "// new best path recorded"
              : "// route recorded"}
          </span>
          <span>
            {syncState === "saving" ? "// syncing profile..." : "// profile ready"}
          </span>
          <CliShell.Blank />
          <span className={styles.endingsHeading}>
            {`// endings discovered: ${discoveredCount}/${orderedEndings.length}`}
          </span>
          {orderedEndings.map((ending) => {
            const discovered = seenEndingIds.has(ending.id);
            const isCurrent = ending.id === summary.endingId;
            return (
              <span
                key={ending.id}
                className={styles.endingRow}
                data-discovered={discovered}
                data-current={isCurrent}
              >
                <span className={styles.endingMark} aria-hidden="true">
                  {discovered ? "[x]" : "[ ]"}
                </span>
                <span className={styles.endingTier}>
                  {discovered ? formatEndingTier(ending.tier) : "???"}
                </span>
                <span className={styles.endingTitle}>
                  {discovered ? ending.title : "??? undiscovered ending"}
                </span>
              </span>
            );
          })}
          <span className={styles.endingsHint}>
            {allDiscovered
              ? "// every ending found - completionist run"
              : "// replay to uncover the remaining routes"}
          </span>
          <CliShell.Blank />
          <span className={styles.endingsHeading}>
            {"// unlocked for next replay"}
          </span>
          {unlockedNextReplay.length > 0 ? (
            unlockedNextReplay.map((ending) => (
              <span key={ending.id} className={styles.unlockRow}>
                <span className={styles.unlockMark} aria-hidden="true">
                  [+]
                </span>
                <span className={styles.unlockTitle}>{ending.title}</span>
              </span>
            ))
          ) : (
            <span className={styles.endingsHint}>
              {"// no new endings opened this run"}
            </span>
          )}
          <CliShell.Blank />
          <CliButtonLink onClick={onReplay}>&gt; Replay this level</CliButtonLink>
          {displaySummary.nextLevel ? (
            <CliLink href={`/levels/${displaySummary.nextLevel.id}`}>
              Next: {displaySummary.nextLevel.title} &gt;
            </CliLink>
          ) : (
            <span>{"// all modules cleared - nice work"}</span>
          )}
          <CliLink href="/levels">All levels &gt;</CliLink>
          <CliShell.Blank />
          <CliShell.Blank />
        </CliShell>
      </div>
    </div>
  );
}
