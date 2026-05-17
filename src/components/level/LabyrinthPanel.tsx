"use client";

import type { LevelJSON, WalkedEdge } from "@/lib/level/types";
import styles from "./LabyrinthPanel.module.css";

type Props = {
  level: LevelJSON;
  characterCoord: [number, number];
  walked: WalkedEdge[];
};

function cellKey(x: number, y: number) {
  return `${x}-${y}`;
}

export function LabyrinthPanel({ level, characterCoord, walked }: Props) {
  const { width, height, start } = level.labyrinth;

  const revealed = new Map<string, { dimmed: boolean }>();
  revealed.set(cellKey(start[0], start[1]), { dimmed: false });
  walked.forEach((edge) => {
    const fromKey = cellKey(edge.from[0], edge.from[1]);
    const toKey = cellKey(edge.to[0], edge.to[1]);
    if (!revealed.has(fromKey) || !edge.dimmed) {
      revealed.set(fromKey, { dimmed: edge.dimmed ?? false });
    }
    if (!revealed.has(toKey) || !edge.dimmed) {
      revealed.set(toKey, { dimmed: edge.dimmed ?? false });
    }
  });

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = cellKey(x, y);
      const entry = revealed.get(key);
      const isCorridor = entry !== undefined;
      cells.push(
        <div
          key={key}
          className={`${styles.cell} ${
            isCorridor ? styles.corridor : styles.wall
          } ${entry?.dimmed ? styles.dimmed : ""}`}
          style={{ gridColumn: x + 1, gridRow: y + 1 }}
        />,
      );
    }
  }

  return (
    <div className={styles.panel} aria-label="Labyrinth">
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${width}, var(--cell-size))`,
          gridTemplateRows: `repeat(${height}, var(--cell-size))`,
        }}
      >
        {cells}
        <div
          className={styles.character}
          aria-label="Player position"
          style={{
            transform: `translate(calc(var(--cell-size) * ${characterCoord[0]}), calc(var(--cell-size) * ${characterCoord[1]}))`,
          }}
        />
      </div>
    </div>
  );
}
