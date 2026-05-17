"use client";

import type { DecisionStep } from "@/lib/level/types";
import styles from "./DecisionPrompt.module.css";

type Props = {
  decision: DecisionStep;
  onPick: (guardLabel: string) => void;
};

export function DecisionPrompt({ decision, onPick }: Props) {
  return (
    <div className={styles.prompt} role="dialog" aria-label="Decision">
      <span className={styles.title}>? {decision.nodeLabel}</span>
      <div className={styles.options}>
        {decision.branches.map((branch, i) => (
          <button
            key={branch.guardLabel}
            type="button"
            className={styles.option}
            onClick={() => onPick(branch.guardLabel)}
          >
            [{i + 1}] {branch.guardLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
