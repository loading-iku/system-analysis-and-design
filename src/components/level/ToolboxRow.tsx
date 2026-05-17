"use client";

import type { ToolboxBlock, UmlShape } from "@/lib/level/types";
import styles from "./ToolboxRow.module.css";

type Props = {
  toolbox: ToolboxBlock[];
  onDrop: (id: string) => void;
  onDragStart: (id: string) => void;
  disabled?: boolean;
};

export function ToolboxRow({
  toolbox,
  onDrop,
  onDragStart,
  disabled,
}: Props) {
  return (
    <div className={styles.row} aria-label="UML toolbox">
      {toolbox.map((block) => {
        const handleActivate = () => {
          if (disabled) return;
          onDrop(block.id);
        };
        return (
          <div key={block.id} className={styles.cell}>
            <span className={styles.letter}>{block.id}</span>
            <div
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${block.id}: ${block.label}`}
              aria-disabled={disabled || undefined}
              draggable={!disabled}
              className={`${styles.tile} ${disabled ? styles.disabled : ""}`}
              onClick={handleActivate}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleActivate();
                }
              }}
              onDragStart={(e) => {
                if (disabled) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData("text/plain", block.id);
                e.dataTransfer.effectAllowed = "move";
                onDragStart(block.id);
              }}
            >
              <ShapePreview shape={block.shape} />
            </div>
            <span className={styles.caption}>{block.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShapePreview({ shape }: { shape: UmlShape }) {
  switch (shape) {
    case "action":
      return <span className={`${styles.preview} ${styles.previewAction}`} />;
    case "decision":
      return <span className={`${styles.preview} ${styles.previewDecision}`} />;
    case "alert":
      return <span className={`${styles.preview} ${styles.previewAlert}`} />;
    case "merge":
      return <span className={`${styles.preview} ${styles.previewMerge}`} />;
    case "start":
      return <span className={`${styles.preview} ${styles.previewStart}`} />;
    case "end":
      return <span className={`${styles.preview} ${styles.previewEnd}`} />;
  }
}
