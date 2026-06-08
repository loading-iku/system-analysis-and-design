"use client";

import { CliLink } from "@/components/cli/CliLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliShell } from "@/components/cli/CliShell";
import { LevelCard } from "@/components/levels/LevelCard";
import { listLevels, loadLevel } from "@/lib/level/loadLevel";
import {
  getClearedLevelIds,
  isLevelUnlocked,
  useProgressProfile,
} from "@/lib/progress";
import styles from "@/app/levels/levels.module.css";

export function LevelsIndexClient() {
  const levels = listLevels();
  const ids = levels.map((level) => level.id);
  const profile = useProgressProfile();
  const completed = getClearedLevelIds(profile);

  const clearedCount = levels.filter((level) => completed.includes(level.id)).length;

  return (
    <CliPage>
      <header className={styles.header}>
        <h1 className={styles.heading}>{"//levels"}</h1>
      </header>
      <CliShell>
        <CliLink href="/start">&lt; cd ..</CliLink>
        <span className={styles.meta}>
          {`// ${clearedCount}/${levels.length} modules cleared | ${profile.totals.xp} XP | ${profile.totals.coins} coins`}
        </span>
        <CliShell.Blank />
      </CliShell>

      <ul className={styles.grid}>
        {levels.map((level, index) => (
          <li key={level.id} className={styles.gridItem}>
            <LevelCard
              index={index + 1}
              id={level.id}
              title={level.title}
              concept={level.concept}
              unlocked={isLevelUnlocked(ids, index, profile)}
              completed={completed.includes(level.id)}
              endingCount={loadLevel(level.id)?.endings.length ?? level.endingCount}
              progress={profile.levels[level.id]}
            />
          </li>
        ))}
      </ul>

      <CliShell startLine={4}>
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>
    </CliPage>
  );
}
