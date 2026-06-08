import Link from "next/link";
import {
  type LevelProgress,
} from "@/lib/progress";
import { KEY_ART, LOCK_ART, PixelArt } from "./PixelArt";
import styles from "./LevelCard.module.css";

type Props = {
  index: number;
  id: string;
  title: string;
  concept?: string;
  unlocked: boolean;
  completed: boolean;
  endingCount?: number;
  progress?: LevelProgress;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function LevelCard({
  index,
  id,
  title,
  concept,
  unlocked,
  completed,
  endingCount,
  progress,
}: Props) {
  const label = `// ${pad(index)}`;

  if (!unlocked) {
    return (
      <div className={`${styles.card} ${styles.locked}`} aria-disabled="true">
        <div className={styles.head}>
          <span className={styles.index}>{label}</span>
          <span className={styles.status}>{"//locked"}</span>
        </div>
        <div className={styles.iconWrap}>
          <div className={styles.lockPanel}>
            <PixelArt rows={LOCK_ART} label="Locked" muted />
          </div>
        </div>
        <h2 className={styles.title}>{"//locked"}</h2>
        <p className={styles.concept}>Clear the previous module to unlock.</p>
        <span className={styles.lockedNote}>[ locked ]</span>
      </div>
    );
  }

  const bestEnding = progress?.bestRun?.endingLabel ?? "--";
  const endingsSeen = progress?.seenEndingIds.length ?? 0;
  const endingsSeenLabel = endingCount
    ? `${endingsSeen}/${endingCount}`
    : String(endingsSeen);
  const xp = progress?.rewards.xp ?? 0;
  const coins = progress?.rewards.coins ?? 0;

  return (
    <Link
      href={`/levels/${id}`}
      className={`${styles.card} ${styles.unlocked} ${
        completed ? styles.completed : ""
      }`}
    >
      <div className={styles.head}>
        <span className={styles.index}>{label}</span>
        <span className={styles.status}>
          {completed ? "cleared ✓" : "unlocked"}
        </span>
      </div>
      <div className={styles.iconWrap}>
        <PixelArt rows={KEY_ART} label={completed ? "Cleared" : "Unlocked"} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      {concept ? <p className={styles.concept}>{concept}</p> : null}
      <p className={styles.concept}>
        {`Best ending: ${bestEnding} | Endings seen: ${endingsSeenLabel}`}
      </p>
      <p className={styles.concept}>{`XP: ${xp} | Coins: ${coins}`}</p>
      <span className={styles.cta}>{completed ? "Replay >" : "Enter >"}</span>
    </Link>
  );
}
