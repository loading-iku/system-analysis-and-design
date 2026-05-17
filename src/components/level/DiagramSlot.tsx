"use client";

import styles from "./DiagramSlot.module.css";

type Props = {
  active: boolean;
  hover?: boolean;
  onDrop: (toolboxId: string) => void;
  onDragOverChange?: (over: boolean) => void;
};

export function DiagramSlot({
  active,
  hover,
  onDrop,
  onDragOverChange,
}: Props) {
  if (!active) return null;
  return (
    <div
      className={`${styles.slot} ${hover ? styles.hover : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragOverChange?.(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={() => onDragOverChange?.(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverChange?.(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
      role="region"
      aria-label="Drop the correct UML node here"
    >
      <span className={styles.placeholder}>[ drop here ]</span>
    </div>
  );
}
