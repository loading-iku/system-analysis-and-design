"use client";

import { useEffect, useMemo, useReducer } from "react";
import type { LevelJSON } from "@/lib/level/types";
import {
  createInitialState,
  currentStep,
  hasUnexploredBranches,
  reducer,
} from "@/lib/level/engine";
import { AUTO_START_ID } from "@/lib/level/types";
import { CliButtonLink } from "@/components/cli/CliButtonLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliShell } from "@/components/cli/CliShell";
import { ActivityDiagramPanel } from "./ActivityDiagramPanel";
import { FeedbackOverlay } from "./FeedbackOverlay";
import { HUD } from "./HUD";
import { LabyrinthPanel } from "./LabyrinthPanel";
import { LevelCompleteOverlay } from "./LevelCompleteOverlay";
import styles from "./LevelStage.module.css";

type Props = {
  level: LevelJSON;
};

export function LevelStage({ level }: Props) {
  const [state, dispatch] = useReducer(reducer, level, createInitialState);

  useEffect(() => {
    const step = currentStep(state);
    if (step?.kind === "place" && step.expectedToolboxId === AUTO_START_ID) {
      dispatch({ type: "DROP_TOOLBOX", toolboxId: AUTO_START_ID });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = currentStep(state);
  const expectedToolboxId =
    step?.kind === "place" ? step.expectedToolboxId : undefined;
  const expectedShape = step?.shape;
  const awaitingPlacement = !state.levelComplete && step?.kind === "place";

  const canReplay = useMemo(() => hasUnexploredBranches(state), [state]);

  const totalActions = state.successCount + state.hintCount;
  const elapsedMs =
    state.endedAt !== null ? state.endedAt - state.startedAt : 0;
  const successRate =
    totalActions === 0
      ? 100
      : Math.round((state.successCount / totalActions) * 100);

  return (
    <CliPage>
      <CliShell>
        <HUD title={level.title} />
        <span>{`// ${level.objective}`}</span>
        <CliShell.Blank />
        <div className={styles.stage}>
          <section
            className={styles.column}
            aria-label="Labyrinth panel"
          >
            <HUD title="Labyrinth" />
            <LabyrinthPanel
              level={level}
              characterCoord={state.characterCoord}
              walked={state.walkedCorridors}
            />
            <p className={styles.scenario}># {level.scenario}</p>
          </section>
          <section className={styles.column} aria-label="Activity diagram">
            <ActivityDiagramPanel
              toolbox={level.toolbox}
              placedNodes={state.placedNodes}
              pendingDecision={state.pendingDecision}
              expectedToolboxId={expectedToolboxId}
              expectedShape={expectedShape}
              awaitingPlacement={awaitingPlacement}
              onDrop={(id) =>
                dispatch({ type: "DROP_TOOLBOX", toolboxId: id })
              }
              onPickBranch={(guard) =>
                dispatch({ type: "PICK_BRANCH", guardLabel: guard })
              }
            />
          </section>
        </div>

        {canReplay ? (
          <span className={styles.replay}>
            {"// one branch is still unexplored  "}
            <CliButtonLink
              onClick={() => dispatch({ type: "REPLAY_FROM_DECISION" })}
            >
              Replay from decision &gt;
            </CliButtonLink>
          </span>
        ) : null}
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>

      {state.levelComplete && state.endedAt !== null ? (
        <LevelCompleteOverlay
          elapsedMs={elapsedMs}
          successRate={successRate}
        />
      ) : null}

      <FeedbackOverlay
        feedback={state.feedback}
        onDismiss={() => dispatch({ type: "DISMISS_FEEDBACK" })}
      />
    </CliPage>
  );
}
