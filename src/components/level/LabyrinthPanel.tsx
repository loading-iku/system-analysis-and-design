"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isBarrierOpen } from "@/lib/level/barriers";
import type { RouteHintState } from "@/lib/level/engine";
import type { Coord, LevelJSON } from "@/lib/level/types";
import styles from "./LabyrinthPanel.module.css";

type Props = {
  level: LevelJSON;
  player: Coord;
  facing: "left" | "right";
  moving: boolean;
  revealedCells: Set<string>;
  unlockedEndingIds: Set<string>;
  resolvedGateIds: Set<string>;
  collectedCoinIds: Set<string>;
  activeGateId: string | null;
  routeHint: RouteHintState | null;
  focusActive: boolean;
};

type ViewportSize = {
  width: number;
  height: number;
};

export function LabyrinthPanel({
  level,
  player,
  facing,
  moving,
  revealedCells,
  unlockedEndingIds,
  resolvedGateIds,
  collectedCoinIds,
  activeGateId,
  routeHint,
  focusActive,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    width: 0,
    height: 0,
  });
  const [walkFrame, setWalkFrame] = useState(0);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Rapidly alternate standing/walking frames to animate the legs while moving.
  // When idle the pose falls back to standing regardless of walkFrame.
  useEffect(() => {
    if (!moving) return;
    const id = window.setInterval(() => {
      setWalkFrame((frame) => (frame === 0 ? 1 : 0));
    }, 120);
    return () => window.clearInterval(id);
  }, [moving]);

  // Preload the four sprites so the first frame swap doesn't flicker.
  useEffect(() => {
    ["leftstanding", "leftwalking", "rightstanding", "rightwalking"].forEach(
      (name) => {
        const img = new Image();
        img.src = `/${name}.png`;
      },
    );
  }, []);

  const tileSize = level.labyrinth.tileSize;
  const worldWidth = level.labyrinth.width * tileSize;
  const worldHeight = level.labyrinth.height * tileSize;
  const playerPx = {
    x: player.x * tileSize,
    y: player.y * tileSize,
  };
  const pose = moving && walkFrame === 1 ? "walking" : "standing";
  const playerSprite = `/${facing}${pose}.png`;
  const playerWidth = tileSize;
  const playerHeight = tileSize * 1.5;

  const camera = {
    x: clamp(
      viewportSize.width / 2 - playerPx.x,
      viewportSize.width - worldWidth,
      0,
    ),
    y: clamp(
      viewportSize.height / 2 - playerPx.y,
      viewportSize.height - worldHeight,
      0,
    ),
  };
  const targetPx = routeHint
    ? {
        x: (routeHint.target.x + 0.5) * tileSize,
        y: (routeHint.target.y + 0.5) * tileSize,
      }
    : null;
  const targetAngle = targetPx
    ? Math.atan2(targetPx.y - playerPx.y, targetPx.x - playerPx.x)
    : 0;
  const worldStyle = {
    width: worldWidth,
    height: worldHeight,
    transform: `translate(${camera.x}px, ${camera.y}px)`,
    ["--game-surface-width" as const]: `${worldWidth}px`,
    ["--game-surface-height" as const]: `${worldHeight}px`,
    ["--surface-tile-size" as const]: `${tileSize}px`,
  } as CSSProperties;
  const roomGateIds = new Set(
    level.labyrinth.rooms
      ?.map((room) => room.gateId)
      .filter((gateId): gateId is string => Boolean(gateId)) ?? [],
  );
  const roomEndingIds = new Set(
    level.labyrinth.rooms
      ?.map((room) => room.endingId)
      .filter((endingId): endingId is string => Boolean(endingId)) ?? [],
  );
  const endingsById = new Map(level.endings.map((ending) => [ending.id, ending]));

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < level.labyrinth.height; y += 1) {
    for (let x = 0; x < level.labyrinth.width; x += 1) {
      const tile = level.labyrinth.map[y]?.[x] ?? "#";
      const revealed = revealedCells.has(cellKey(x, y));
      cells.push(
        <div
          key={cellKey(x, y)}
          className={`${styles.cell} ${
            tile === "#" ? styles.wall : styles.floor
          } ${revealed ? styles.revealed : styles.hidden}`}
          style={
            {
              width: tileSize,
              height: tileSize,
              left: x * tileSize,
              top: y * tileSize,
              ["--surface-offset-x" as const]: `${x * tileSize}px`,
              ["--surface-offset-y" as const]: `${y * tileSize}px`,
            } as CSSProperties
          }
        />,
      );
    }
  }

  return (
    <div
      ref={viewportRef}
      className={`${styles.viewport} ${focusActive ? styles.focused : ""}`}
      tabIndex={0}
      aria-label="Maze viewport"
    >
      <div
        className={styles.world}
        style={worldStyle}
      >
        <div className={styles.cells}>{cells}</div>
        {level.labyrinth.rooms?.map((room) => {
          const revealed = isRoomRevealed(room, revealedCells);
          const targeted =
            (room.gateId && routeHint?.target.id === room.gateId) ||
            (room.endingId && routeHint?.target.id === room.endingId);
          return (
            <div
              key={room.id}
              className={`${styles.room} ${
                room.kind === "start" ? styles.roomStart : ""
              } ${room.gateId ? styles.roomGate : ""} ${
                room.endingId ? styles.roomEnding : ""
              } ${revealed ? styles.revealed : styles.hidden} ${
                targeted ? styles.targeted : ""
              }`}
              style={{
                left: room.x * tileSize,
                top: room.y * tileSize,
                width: room.width * tileSize,
                height: room.height * tileSize,
                ["--surface-offset-x" as const]: `${room.x * tileSize}px`,
                ["--surface-offset-y" as const]: `${room.y * tileSize}px`,
              } as CSSProperties}
            >
              <span className={styles.roomLabel}>
                {room.endingId
                  ? unlockedEndingIds.has(room.endingId)
                    ? endingsById.get(room.endingId)?.title ?? room.label
                    : "LOCKED EXIT"
                  : room.label}
              </span>
            </div>
          );
        })}
        {routeHint && targetPx ? (
          <div
            className={styles.compassNeedle}
            style={{
              left: playerPx.x,
              top: playerPx.y,
              transform: `rotate(${targetAngle}rad)`,
            }}
          />
        ) : null}
        {level.coinPickups.map((coin) => {
          const revealed = revealedCells.has(cellKey(coin.x, coin.y));
          if (!revealed || collectedCoinIds.has(coin.id)) return null;
          return (
            <div
              key={coin.id}
              className={styles.coin}
              style={{
                left: coin.x * tileSize + tileSize / 2,
                top: coin.y * tileSize + tileSize / 2,
              }}
              aria-label={`Coin shard worth ${coin.value}`}
            >
              $
            </div>
          );
        })}
        {level.labyrinth.barriers?.flatMap((barrier) => {
          const open = isBarrierOpen(barrier, unlockedEndingIds);
          return barrier.cells.map((cell, index) => {
            if (!revealedCells.has(cellKey(cell.x, cell.y))) return null;
            return (
              <div
                key={`${barrier.id}:${index}`}
                className={`${styles.barrier} ${
                  open ? styles.barrierOpen : styles.barrierClosed
                }`}
                style={{
                  width: tileSize,
                  height: tileSize,
                  left: cell.x * tileSize,
                  top: cell.y * tileSize,
                }}
                aria-hidden="true"
              />
            );
          });
        })}
        {level.gates.map((gate) => {
          const revealed = revealedCells.has(cellKey(gate.x, gate.y));
          if (!revealed) return null;
          const targeted = routeHint?.target.id === gate.id;
          return (
            <div key={gate.id}>
              <div
                className={`${styles.gateSymbol} ${
                  resolvedGateIds.has(gate.id) ? styles.gateResolved : ""
                } ${activeGateId === gate.id ? styles.gateActive : ""} ${
                  targeted ? styles.targeted : ""
                }`}
                style={{
                  left: gate.x * tileSize + tileSize / 2,
                  top: gate.y * tileSize + tileSize / 2,
                }}
              >
                {gate.symbol ?? gate.label.slice(0, 1)}
              </div>
              <div
                className={`${styles.gateLabel} ${
                  resolvedGateIds.has(gate.id) ? styles.gateResolved : ""
                } ${activeGateId === gate.id ? styles.gateActive : ""} ${
                  targeted ? styles.targeted : ""
                }`}
                style={{
                  left: gate.x * tileSize + tileSize / 2,
                  top: gate.y * tileSize - 8,
                  display: roomGateIds.has(gate.id) ? "none" : undefined,
                }}
              >
                {gate.label}
              </div>
            </div>
          );
        })}
        {level.endings.map((ending) => {
          const revealed = revealedCells.has(cellKey(ending.x, ending.y));
          if (!revealed) return null;
          const targeted = routeHint?.target.id === ending.id;
          const unlocked = unlockedEndingIds.has(ending.id);
          return (
            <div
              key={ending.id}
              className={`${styles.endingLabel} ${
                unlocked ? styles[`ending${ending.tier}`] : styles.endingLocked
              } ${targeted ? styles.targeted : ""}`}
              style={{
                left: ending.x * tileSize + tileSize / 2,
                top: ending.y * tileSize - 8,
                display: roomEndingIds.has(ending.id) ? "none" : undefined,
              }}
            >
              {unlocked ? ending.title : "LOCKED EXIT"}
            </div>
          );
        })}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.player}
          src={playerSprite}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            width: playerWidth,
            height: playerHeight,
            transform: `translate(${playerPx.x - playerWidth / 2}px, ${
              playerPx.y - playerHeight * 0.7
            }px)`,
          }}
        />
      </div>
    </div>
  );
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isRoomRevealed(
  room: NonNullable<LevelJSON["labyrinth"]["rooms"]>[number],
  revealedCells: Set<string>,
): boolean {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (revealedCells.has(cellKey(x, y))) return true;
    }
  }
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
