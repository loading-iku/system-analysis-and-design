"use client";

import type { ParkourSession } from "@/lib/level/engine";
import { getObstacleRects, getPlayerRadius } from "@/lib/level/engine";
import type { ParkourChallenge } from "@/lib/level/types";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import styles from "./ParkourChallengeModal.module.css";

type Props = {
  challenge: ParkourChallenge;
  session: ParkourSession;
  onClose: () => void;
};

const TILE_SIZE = 36;

export function ParkourChallengeModal({
  challenge,
  session,
  onClose,
}: Props) {
  const obstacleRects = getObstacleRects(challenge, session.elapsedMs);
  const radius = getPlayerRadius();

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} role="dialog" aria-modal="true">
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>{challenge.title}</h2>
            <p className={styles.prompt}>{challenge.prompt}</p>
          </div>
          {challenge.optional ? (
            <CliButtonLink onClick={onClose}>Take the easy route &gt;</CliButtonLink>
          ) : null}
        </div>

        <div
          className={styles.viewport}
          style={{
            width: challenge.width * TILE_SIZE,
            height: challenge.height * TILE_SIZE,
          }}
        >
          {challenge.map.flatMap((row, y) =>
            row.split("").map((tile, x) => (
              <div
                key={`${x}-${y}`}
                className={`${styles.cell} ${
                  tile === "#" ? styles.wall : styles.floor
                }`}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  left: x * TILE_SIZE,
                  top: y * TILE_SIZE,
                }}
              />
            )),
          )}

          <div
            className={styles.goal}
            style={{
              width: TILE_SIZE,
              height: TILE_SIZE,
              left: challenge.goal.x * TILE_SIZE,
              top: challenge.goal.y * TILE_SIZE,
            }}
          />

          {obstacleRects.map((rect, index) => (
            <div
              key={challenge.obstacles[index]?.id ?? index}
              className={styles.obstacle}
              style={{
                width: (rect.right - rect.left) * TILE_SIZE,
                height: (rect.bottom - rect.top) * TILE_SIZE,
                left: rect.left * TILE_SIZE,
                top: rect.top * TILE_SIZE,
              }}
            />
          ))}

          <div
            className={styles.player}
            style={{
              width: TILE_SIZE * radius * 2,
              height: TILE_SIZE * radius * 2,
              left: (session.player.x - radius) * TILE_SIZE,
              top: (session.player.y - radius) * TILE_SIZE,
            }}
          />
        </div>

        <div className={styles.meta}>
          <span>{`hits ${session.obstacleHits}`}</span>
          <span>{`reward ${challenge.rewards.xp} xp / ${challenge.rewards.coins} coins`}</span>
          <span>{"keep moving with WASD or arrow keys"}</span>
        </div>
      </div>
    </div>
  );
}
