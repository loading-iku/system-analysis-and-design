"use client";

import type { DiagramDecisionStep } from "@/lib/level/types";
import styles from "./DecisionPrompt.module.css";

type Props = {
  decision: DiagramDecisionStep;
  onPick: (guardLabel: string) => void;
};

export function DecisionPrompt({ decision, onPick }: Props) {
  return (
    <div className={styles.prompt} role="group" aria-label="Decision">
      <span className={styles.title}>? {decision.nodeLabel}</span>
      <div className={styles.options}>
        {decision.branches.map((branch, index) => (
          <button
            key={branch.guardLabel}
            type="button"
            className={styles.option}
            onClick={() => onPick(branch.guardLabel)}
          >
            [{index + 1}] {branch.guardLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
