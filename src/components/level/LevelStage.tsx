"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { LevelJSON } from "@/lib/level/types";
import {
  createInitialState,
  reducer,
  toSummaryForSync,
  type InputState,
} from "@/lib/level/engine";
import { listLevels } from "@/lib/level/loadLevel";
import { useProgressProfile } from "@/lib/progress";
import { CliLink } from "@/components/cli/CliLink";
import { CliPage } from "@/components/cli/CliPage";
import { ActivityDiagramPanel } from "./ActivityDiagramPanel";
import { DiagramWizardModal } from "./DiagramWizardModal";
import { HintCharacter } from "./HintCharacter";
import { HUD } from "./HUD";
import { LabyrinthPanel } from "./LabyrinthPanel";
import { LevelCompleteOverlay } from "./LevelCompleteOverlay";
import { ParkourChallengeModal } from "./ParkourChallengeModal";
import styles from "./LevelStage.module.css";

type Props = {
  level: LevelJSON;
};

type Direction = keyof InputState;

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  a: "left",
  A: "left",
  s: "down",
  S: "down",
  d: "right",
  D: "right",
};

export function LevelStage({ level }: Props) {
  const profile = useProgressProfile();
  const persistedSeenEndingIds = useMemo(
    () => profile.levels[level.id]?.seenEndingIds ?? [],
    [profile, level.id],
  );
  const [state, dispatch] = useReducer(
    reducer,
    { level, seenEndingIds: persistedSeenEndingIds },
    createInitialState,
  );
  const [inputState, setInputState] = useState<InputState>({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[event.key];
      if (!direction) return;
      event.preventDefault();
      setInputState((current) => {
        if (current[direction]) return current;
        return { ...current, [direction]: true };
      });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[event.key];
      if (!direction) return;
      event.preventDefault();
      setInputState((current) => {
        if (!current[direction]) return current;
        return { ...current, [direction]: false };
      });
    };

    const onBlur = () => {
      setInputState({ up: false, down: false, left: false, right: false });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    dispatch({
      type: "SYNC_SEEN_ENDINGS",
      seenEndingIds: persistedSeenEndingIds,
    });
  }, [persistedSeenEndingIds]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dtMs = Math.min(40, now - last);
      last = now;
      dispatch({ type: "TICK", dtMs, input: inputState });
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [inputState]);

  const allLevels = listLevels();
  const currentIndex = allLevels.findIndex((entry) => entry.id === level.id);
  const nextLevel =
    currentIndex >= 0 && currentIndex < allLevels.length - 1
      ? allLevels[currentIndex + 1]
      : null;

  const successRate = calculateSuccessRate(
    state.successfulInteractions,
    state.mistakes,
  );
  const existingBestEndingId = profile.levels[level.id]?.bestEndingId;
  const provisionalSummary = state.completion
      ? toSummaryForSync(
          state.completion,
          level.endings.length,
          existingBestEndingId,
          nextLevel,
        )
      : null;
  const coinTotal = level.coinPickups.reduce((sum, coin) => sum + coin.value, 0);
  const coinsCollected = level.coinPickups.reduce(
    (sum, coin) => sum + (state.collectedCoinIds.has(coin.id) ? coin.value : 0),
    0,
  );
  const seenEndingIds = useMemo(
    () => new Set(profile.levels[level.id]?.seenEndingIds ?? []),
    [profile, level.id],
  );
  const isApproachingSeenEnding =
    state.routeHint?.target.kind === "ending" &&
    seenEndingIds.has(state.routeHint.target.id);

  return (
    <CliPage wide>
      <div className={styles.shell}>
        <div className={styles.topline}>
          <CliLink href="/levels">&lt; modules</CliLink>
          <span className={styles.titleRail}>{level.title}</span>
          <span className={styles.liveStats}>
            {`xp ${state.rewards.xp} // coins ${state.rewards.coins}`}
          </span>
        </div>

        <div className={styles.stage}>
          <section className={styles.playColumn}>
            <HUD title="Logic Maze" />
            <div className={styles.mazeWrap}>
              <LabyrinthPanel
                level={level}
                player={state.player}
                facing={state.facing}
                moving={state.moving}
                revealedCells={state.revealedCells}
                unlockedEndingIds={state.unlockedEndingIds}
                resolvedGateIds={state.resolvedGateIds}
                collectedCoinIds={state.collectedCoinIds}
                activeGateId={state.activeGateId}
                routeHint={state.routeHint}
                focusActive={true}
              />
              <HintCharacter
                feedback={state.feedback}
                routeHint={state.routeHint}
                isApproachingSeenEnding={isApproachingSeenEnding}
                mistakes={state.mistakes}
                completion={state.completion}
                onDismiss={() => dispatch({ type: "DISMISS_FEEDBACK" })}
              />
            </div>
            <div className={styles.instructions}>
              <span>{level.scenario}</span>
              <span>
                Walk through a doorway to choose it. The skull guide explains where it leads.
              </span>
            </div>
            <div className={styles.controls}>
              <DirectionButton
                label="W"
                text="up"
                direction="up"
                dispatch={setInputState}
              />
              <DirectionButton
                label="A"
                text="left"
                direction="left"
                dispatch={setInputState}
              />
              <DirectionButton
                label="S"
                text="down"
                direction="down"
                dispatch={setInputState}
              />
              <DirectionButton
                label="D"
                text="right"
                direction="right"
                dispatch={setInputState}
              />
            </div>
          </section>

          <aside className={styles.progressColumn}>
            <HUD title="Activity Progress" />
            <p className={styles.objective}>{`// ${level.objective}`}</p>
            <ActivityDiagramPanel
              placedNodes={state.placedNodes}
              rewards={state.rewards}
              gatesCleared={state.gatesCleared}
              challengesCompleted={state.challengesCompleted}
              successRate={successRate}
              coinsCollected={coinsCollected}
              coinsTotal={coinTotal}
            />
          </aside>
        </div>
      </div>

      {state.activeDiagram ? (
        <DiagramWizardModal
          challenge={state.activeDiagram.challenge}
          state={state.activeDiagram.state}
          onDrop={(toolboxId) =>
            dispatch({ type: "DIAGRAM_DROP_TOOLBOX", toolboxId })
          }
          onPickBranch={(guardLabel) =>
            dispatch({ type: "DIAGRAM_PICK_BRANCH", guardLabel })
          }
          onDismissFeedback={() =>
            dispatch({ type: "DIAGRAM_DISMISS_FEEDBACK" })
          }
          onClose={() => dispatch({ type: "CLOSE_CHALLENGE" })}
        />
      ) : null}

      {state.activeParkour ? (
        <ParkourChallengeModal
          challenge={state.activeParkour.challenge}
          session={state.activeParkour.state}
          onClose={() => dispatch({ type: "CLOSE_CHALLENGE" })}
        />
      ) : null}

      {state.completion && provisionalSummary ? (
        <LevelCompleteOverlay
          summary={provisionalSummary}
          endings={level.endings}
          onReplay={() => {
            const nextSeenEndingIds = new Set(persistedSeenEndingIds);
            nextSeenEndingIds.add(state.completion!.endingId);
            dispatch({
              type: "RESET",
              seenEndingIds: [...nextSeenEndingIds],
            });
          }}
        />
      ) : null}
    </CliPage>
  );
}

function calculateSuccessRate(successfulInteractions: number, mistakes: number) {
  const total = successfulInteractions + mistakes;
  if (total <= 0) return 100;
  return Math.round((successfulInteractions / total) * 100);
}

function DirectionButton({
  label,
  text,
  direction,
  dispatch,
}: {
  label: string;
  text: string;
  direction: Direction;
  dispatch: Dispatch<SetStateAction<InputState>>;
}) {
  const press = (active: boolean) => {
    dispatch((current) => ({ ...current, [direction]: active }));
  };

  return (
    <button
      type="button"
      className={styles.directionButton}
      onPointerDown={() => press(true)}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onPointerLeave={() => press(false)}
      aria-label={`Move ${text}`}
    >
      <span>{label}</span>
      <small>{text}</small>
    </button>
  );
}
