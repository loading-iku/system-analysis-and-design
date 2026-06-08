"use client";

import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { LEADERBOARD_REFRESH_MS } from "@/lib/leaderboard";
import styles from "./LeaderboardPanel.module.css";

type Props = {
  initialEntries: LeaderboardEntry[];
  title?: string;
};

export function LeaderboardPanel({
  initialEntries,
  title = "// leaderboard",
}: Props) {
  const [entries, setEntries] = useState(initialEntries);

  const refresh = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!response.ok) return;

      const nextEntries = (await response.json()) as LeaderboardEntry[];
      startTransition(() => {
        setEntries(nextEntries);
      });
    } catch {
      // Keep the previous snapshot if polling fails.
    }
  });

  useEffect(() => {
    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, LEADERBOARD_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section className={styles.panel} aria-label="Leaderboard">
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.meta}>
          {`students ${entries.length} // refresh ${LEADERBOARD_REFRESH_MS / 1000}s`}
        </span>
      </div>

      <div className={styles.columns} aria-hidden="true">
        <span>full name</span>
        <span>student number</span>
        <span className={styles.xpHeading}>XP</span>
      </div>

      {entries.length === 0 ? (
        <p className={styles.empty}>No student progress yet.</p>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.studentNumber} className={styles.row}>
              <span className={styles.name}>{entry.fullName}</span>
              <span className={styles.studentNumber}>{entry.studentNumber}</span>
              <span className={styles.xp}>{entry.xp}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
