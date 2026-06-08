"use client";

import { useEffect, useRef, useState } from "react";
import type { DiagramEngineState } from "@/lib/level/diagramEngine";
import type { DiagramChallenge, DiagramPuzzleStep } from "@/lib/level/types";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { DecisionPrompt } from "./DecisionPrompt";
import { DiagramSlot } from "./DiagramSlot";
import { ToolboxRow } from "./ToolboxRow";
import { UmlEdge } from "./UmlEdge";
import { UmlNode } from "./UmlNode";
import styles from "./DiagramWizardModal.module.css";

type Props = {
  challenge: DiagramChallenge;
  state: DiagramEngineState;
  onDrop: (toolboxId: string) => void;
  onPickBranch: (guardLabel: string) => void;
  onDismissFeedback: () => void;
  onClose: () => void;
};

export function DiagramWizardModal({
  challenge,
  state,
  onDrop,
  onPickBranch,
  onDismissFeedback,
  onClose,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentStep = findStep(state, state.currentStepId);
  const awaitingPlacement = currentStep?.kind === "place";

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div className={styles.overlay}>
      <div
        ref={containerRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagram-wizard-title"
        tabIndex={-1}
      >
        <div className={styles.head}>
          <div>
            <h2 id="diagram-wizard-title" className={styles.title}>
              Diagram Wizard
            </h2>
            <p className={styles.prompt}>{challenge.prompt}</p>
          </div>
          {challenge.optional ? (
            <CliButtonLink onClick={onClose}>Leave optional route &gt;</CliButtonLink>
          ) : null}
        </div>

        <ToolboxRow
          toolbox={challenge.puzzle.toolbox}
          onDrop={onDrop}
          onDragStart={() => setDragOver(false)}
          disabled={!awaitingPlacement}
        />

        <div className={styles.canvas}>
          {state.placedNodes.map((node, index) => (
            <div key={`${node.id}-${index}`} className={styles.nodeWrapper}>
              <UmlNode
                shape={node.shape}
                label={node.label}
                branchGuard={node.branchGuard}
              />
              {index < state.placedNodes.length - 1 ? <UmlEdge /> : null}
            </div>
          ))}

          {state.pendingDecision ? (
            <DecisionPrompt decision={state.pendingDecision} onPick={onPickBranch} />
          ) : null}

          {awaitingPlacement ? (
            <DiagramSlot
              active={true}
              hover={dragOver}
              onDragOverChange={setDragOver}
              onDrop={onDrop}
            />
          ) : null}
        </div>

        {state.feedback ? (
          <div
            className={`${styles.feedback} ${
              state.feedback.kind === "hint" ? styles.feedbackHint : styles.feedbackSuccess
            }`}
          >
            <span>{state.feedback.text}</span>
            {state.feedback.kind === "hint" ? (
              <button type="button" onClick={onDismissFeedback} className={styles.dismiss}>
                [x]
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function findStep(
  state: DiagramEngineState,
  id: string | null,
): DiagramPuzzleStep | undefined {
  if (!id) return undefined;
  return state.puzzle.steps.find((step) => step.id === id);
}
