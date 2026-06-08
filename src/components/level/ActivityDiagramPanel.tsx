"use client";

import { useEffect, useRef, useState } from "react";
import type { PlacedNode, RewardBundle } from "@/lib/level/types";
import { UmlEdge } from "./UmlEdge";
import { UmlNode } from "./UmlNode";
import styles from "./ActivityDiagramPanel.module.css";

type Props = {
  placedNodes: PlacedNode[];
  rewards: RewardBundle;
  gatesCleared: number;
  challengesCompleted: number;
  successRate: number;
  coinsCollected: number;
  coinsTotal: number;
};

type DragOrigin = {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
};

export function ActivityDiagramPanel({
  placedNodes,
  rewards,
  gatesCleared,
  challengesCompleted,
  successRate,
  coinsCollected,
  coinsTotal,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<DragOrigin | null>(null);
  const [dragging, setDragging] = useState(false);
  const nodeCount = placedNodes.length;

  // Keep the newest gate/node in view whenever progress advances. This only
  // runs on count changes, so it never fights manual panning between gates.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [nodeCount]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    dragOrigin.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const origin = dragOrigin.current;
    if (!el || !origin || origin.pointerId !== event.pointerId) return;
    el.scrollLeft = origin.scrollLeft - (event.clientX - origin.x);
    el.scrollTop = origin.scrollTop - (event.clientY - origin.y);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (el && el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
    dragOrigin.current = null;
    setDragging(false);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.stats}>
        <span>{`XP ${rewards.xp}`}</span>
        <span>{`COINS ${rewards.coins}`}</span>
        <span>{`GATES ${gatesCleared}`}</span>
        <span>{`CHALLENGES ${challengesCompleted}`}</span>
        <span>{`SUCCESS ${successRate}%`}</span>
        <span>{`SHARDS ${coinsCollected}/${coinsTotal}`}</span>
      </div>
      <div
        ref={scrollRef}
        className={`${styles.diagramArea} ${dragging ? styles.dragging : ""}`}
        aria-label="Activity diagram progress. Drag to pan."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={styles.diagramScroll}>
          {placedNodes.map((node, index) => {
            const previous = placedNodes[index - 1];
            const showGateLabel =
              node.sourceGateLabel &&
              node.sourceGateLabel !== previous?.sourceGateLabel;

            return (
              <div key={`${node.id}-${index}`} className={styles.nodeWrapper}>
                {showGateLabel ? (
                  <span className={styles.gateLabel}>{node.sourceGateLabel}</span>
                ) : null}
                <UmlNode
                  shape={node.shape}
                  label={node.label}
                  branchGuard={node.branchGuard}
                  dimmed={node.dimmed}
                />
                {index < placedNodes.length - 1 ? <UmlEdge /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
