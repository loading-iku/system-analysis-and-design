"use client";

import { useState } from "react";
import type {
  DecisionStep,
  PlacedNode,
  ToolboxBlock,
  UmlShape,
} from "@/lib/level/types";
import { AUTO_END_ID, AUTO_START_ID } from "@/lib/level/types";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { DecisionPrompt } from "./DecisionPrompt";
import { DiagramSlot } from "./DiagramSlot";
import { ToolboxRow } from "./ToolboxRow";
import { UmlEdge } from "./UmlEdge";
import { UmlNode } from "./UmlNode";
import styles from "./ActivityDiagramPanel.module.css";

type Props = {
  toolbox: ToolboxBlock[];
  placedNodes: PlacedNode[];
  pendingDecision: DecisionStep | null;
  expectedToolboxId?: string;
  expectedShape?: UmlShape;
  awaitingPlacement: boolean;
  onDrop: (toolboxId: string) => void;
  onPickBranch: (guardLabel: string) => void;
};

export function ActivityDiagramPanel({
  toolbox,
  placedNodes,
  pendingDecision,
  expectedToolboxId,
  awaitingPlacement,
  onDrop,
  onPickBranch,
}: Props) {
  const [dragOver, setDragOver] = useState(false);

  const showSlot =
    awaitingPlacement &&
    expectedToolboxId !== AUTO_START_ID &&
    expectedToolboxId !== AUTO_END_ID;

  const showAutoButton =
    awaitingPlacement &&
    (expectedToolboxId === AUTO_START_ID ||
      expectedToolboxId === AUTO_END_ID);

  return (
    <div className={styles.panel}>
      <ToolboxRow
        toolbox={toolbox}
        onDrop={onDrop}
        onDragStart={() => setDragOver(false)}
        disabled={!showSlot}
      />
      <div className={styles.diagramArea} aria-label="Activity Diagram">
        <div className={styles.diagramScroll}>
          {placedNodes.length === 0 ? (
            <p className={styles.empty}>Activity Diagram</p>
          ) : null}
          {placedNodes.map((node, idx) => (
            <div key={`${node.stepId}-${idx}`} className={styles.nodeWrapper}>
              <UmlNode
                shape={node.shape}
                label={node.label}
                branchGuard={node.branchGuard}
                dimmed={node.dimmed}
              />
              {idx < placedNodes.length - 1 ? (
                <UmlEdge dimmed={node.dimmed} />
              ) : null}
            </div>
          ))}
          {pendingDecision ? (
            <DecisionPrompt
              decision={pendingDecision}
              onPick={onPickBranch}
            />
          ) : null}
          {showSlot ? (
            <DiagramSlot
              active={true}
              hover={dragOver}
              onDragOverChange={setDragOver}
              onDrop={onDrop}
            />
          ) : null}
          {showAutoButton ? (
            <div className={styles.autoButton}>
              <CliButtonLink
                onClick={() =>
                  expectedToolboxId && onDrop(expectedToolboxId)
                }
              >
                {expectedToolboxId === AUTO_START_ID
                  ? "Place Start node >"
                  : "Place End node >"}
              </CliButtonLink>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
