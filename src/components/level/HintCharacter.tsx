"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  CompletionPayload,
  FeedbackState,
  RouteHintState,
} from "@/lib/level/engine";
import styles from "./HintCharacter.module.css";

type Expression =
  | "normal"
  | "happy"
  | "mad"
  | "sad"
  | "tired"
  | "suspicious";

type Tone = "neutral" | "positive" | "warning" | "danger" | "curious";

type Mood = {
  expression: Expression;
  marker: string;
  text: string;
  tone: Tone;
};

type BubbleSource =
  | "completion"
  | "mistake"
  | "seenEnding"
  | "successFeedback"
  | "hintFeedback"
  | "routeHint";

type BubbleState = {
  mood: Mood;
  source: BubbleSource;
};

type Props = {
  feedback: FeedbackState | null;
  routeHint: RouteHintState | null;
  isApproachingSeenEnding: boolean;
  mistakes: number;
  completion: CompletionPayload | null;
  onDismiss: () => void;
};

type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

type Position = {
  x: number;
  y: number;
};

type Bounds = {
  width: number;
  height: number;
};

type DragState = {
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
  bounds: Bounds;
  size: Bounds;
};

const CORNER_PADDING = 14;
const INITIAL_POSITION: Position = { x: CORNER_PADDING, y: CORNER_PADDING };

/**
 * The skull face that reacts to the player. Expression + bubble tone are
 * derived purely from engine state so the reducer stays untouched.
 */
export function HintCharacter({
  feedback,
  routeHint,
  isApproachingSeenEnding,
  mistakes,
  completion,
  onDismiss,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const positionRef = useRef<Position>(INITIAL_POSITION);
  const [recentMistake, setRecentMistake] = useState(false);
  const [seenMistakes, setSeenMistakes] = useState(mistakes);
  const [corner, setCorner] = useState<Corner>("topLeft");
  const [position, setPosition] = useState<Position>(INITIAL_POSITION);
  const [dragging, setDragging] = useState(false);
  const lastSteadyBubbleRef = useRef<BubbleState | null>(null);
  const [restoredHintBubble, setRestoredHintBubble] =
    useState<BubbleState | null>(null);

  // Detect a fresh mistake during render (React's "adjust state on prop
  // change" pattern) and flash an angry face for it.
  if (mistakes !== seenMistakes) {
    setSeenMistakes(mistakes);
    if (mistakes > seenMistakes) {
      setRecentMistake(true);
    }
  }

  // Clear the angry flash a moment later.
  useEffect(() => {
    if (!recentMistake) return;
    const timer = window.setTimeout(() => setRecentMistake(false), 1400);
    return () => window.clearTimeout(timer);
  }, [recentMistake]);

  const steadyBubble = deriveHintBubble({
    feedback: feedback?.kind === "success" ? null : feedback,
    routeHint,
    isApproachingSeenEnding,
    completion,
    mistakes,
    recentMistake,
  });
  const successBubble =
    feedback?.kind === "success"
      ? deriveHintBubble({
          feedback,
          routeHint,
          isApproachingSeenEnding,
          completion,
          mistakes,
          recentMistake,
        })
      : null;
  const bubble =
    successBubble ?? pickBubbleAfterSuccess(steadyBubble, restoredHintBubble);
  const showingRestoredHint = bubble === restoredHintBubble;

  useEffect(() => {
    if (feedback?.kind === "success") return;

    lastSteadyBubbleRef.current = steadyBubble;

    if (steadyBubble && steadyBubble.source !== "routeHint") {
      setRestoredHintBubble(null);
    }
  }, [feedback, steadyBubble]);

  // Let a success "// ok" linger for 2s, then dismiss it. If it briefly
  // covered a hint bubble, restore that hint until the player closes it or a
  // higher-priority live message replaces it.
  useEffect(() => {
    if (!feedback || feedback.kind !== "success") return;
    const previousBubble = lastSteadyBubbleRef.current;
    setRestoredHintBubble(
      previousBubble?.source === "hintFeedback" ? previousBubble : null,
    );
    const timer = window.setTimeout(onDismiss, 2000);
    return () => window.clearTimeout(timer);
  }, [feedback, onDismiss]);

  useEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent || typeof ResizeObserver === "undefined") return;

    const syncToCorner = () => {
      if (dragStateRef.current) return;
      const nextPosition = getCornerPosition(
        corner,
        getBounds(parent.getBoundingClientRect()),
        getBounds(root.getBoundingClientRect()),
      );
      positionRef.current = nextPosition;
      setPosition(nextPosition);
    };

    syncToCorner();

    const observer = new ResizeObserver(syncToCorner);
    observer.observe(parent);
    observer.observe(root);
    return () => observer.disconnect();
  }, [corner]);

  const mood = bubble?.mood ?? null;
  const expression = dragging ? "suspicious" : mood?.expression ?? "normal";
  const showBubble = Boolean(bubble) && !dragging;
  const canDismiss =
    showBubble &&
    (showingRestoredHint || bubble?.source === "hintFeedback");

  const updatePosition = (nextPosition: Position) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  };

  const finishDrag = useEffectEvent((droppedPosition = positionRef.current) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const nearestCorner = findNearestCorner(
      dragState.bounds,
      dragState.size,
      droppedPosition,
    );

    dragStateRef.current = null;
    setCorner(nearestCorner);
    updatePosition(
      getCornerPosition(nearestCorner, dragState.bounds, dragState.size),
    );
    setDragging(false);
  });

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      updatePosition(positionFromMouse(event.clientX, event.clientY, dragState));
    };

    const handleMouseUp = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      finishDrag(positionFromMouse(event.clientX, event.clientY, dragState));
    };

    const handleBlur = () => {
      finishDrag(positionRef.current);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [dragging]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;

    const rootBounds = getBounds(root.getBoundingClientRect());
    const parentRect = parent.getBoundingClientRect();
    const parentBounds = getBounds(parentRect);
    const rootRect = root.getBoundingClientRect();

    dragStateRef.current = {
      offsetX: event.clientX - rootRect.left,
      offsetY: event.clientY - rootRect.top,
      originX: parentRect.left,
      originY: parentRect.top,
      bounds: parentBounds,
      size: rootBounds,
    };
    updatePosition(
      clampPosition(
        {
          x: rootRect.left - parentRect.left,
          y: rootRect.top - parentRect.top,
        },
        parentBounds,
        rootBounds,
      ),
    );
    setDragging(true);
    event.preventDefault();
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.character} ${styles[corner]} ${dragging ? styles.dragging : ""}`}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <div
        className={styles.faceShell}
        onMouseDown={handleMouseDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.face} ${dragging ? styles.faceDragging : ""}`}
          src={`/skulls/skull_${expression}.png`}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      </div>
      {showBubble && mood ? (
        <div className={`${styles.bubble} ${styles[mood.tone]}`} role="status">
          <span className={styles.marker}>{mood.marker}</span>
          <span className={styles.text}>{mood.text}</span>
          {canDismiss ? (
            <button
              type="button"
              className={styles.close}
              onClick={showingRestoredHint ? () => setRestoredHintBubble(null) : onDismiss}
              aria-label="Dismiss hint"
            >
              [x]
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function deriveHintBubble({
  feedback,
  routeHint,
  isApproachingSeenEnding,
  completion,
  mistakes,
  recentMistake,
}: {
  feedback: FeedbackState | null;
  routeHint: RouteHintState | null;
  isApproachingSeenEnding: boolean;
  completion: CompletionPayload | null;
  mistakes: number;
  recentMistake: boolean;
}): BubbleState | null {
  if (completion) {
    if (
      completion.endingTier === "mastery" ||
      completion.endingTier === "secret"
    ) {
      return {
        source: "completion",
        mood: {
          expression: "happy",
          marker: "// solved",
          text: completion.endingLabel,
          tone: "positive",
        },
      };
    }
    if (completion.endingTier === "failure") {
      return {
        source: "completion",
        mood: {
          expression: "sad",
          marker: "// dead end",
          text: completion.endingLabel,
          tone: "danger",
        },
      };
    }
    return {
      source: "completion",
      mood: {
        expression: "normal",
        marker: "// solved",
        text: completion.endingLabel,
        tone: "positive",
      },
    };
  }

  if (recentMistake) {
    return {
      source: "mistake",
      mood: {
        expression: "mad",
        marker: "// oops",
        text: feedback?.text ?? "That route backfired. Try another door.",
        tone: "danger",
      },
    };
  }

  if (isApproachingSeenEnding && routeHint?.target.kind === "ending") {
    return {
      source: "seenEnding",
      mood: {
        expression: "suspicious",
        marker: "// repeat ending",
        text: `You've already seen that ending. Will you still go? → ${routeHint.target.label}.`,
        tone: "warning",
      },
    };
  }

  if (feedback) {
    if (feedback.kind === "success") {
      return {
        source: "successFeedback",
        mood: {
          expression: "happy",
          marker: "// ok",
          text: feedback.text,
          tone: "positive",
        },
      };
    }
    return {
      source: "hintFeedback",
      mood: {
        expression: "suspicious",
        marker: "// hint",
        text: feedback.text,
        tone: "warning",
      },
    };
  }

  if (routeHint) {
    const text = `→ ${routeHint.target.label}. ${routeHint.summary}`;
    switch (routeHint.kind) {
      case "best":
        return {
          source: "routeHint",
          mood: {
            expression: "happy",
            marker: "// good path",
            text,
            tone: "positive",
          },
        };
      case "failure":
        return {
          source: "routeHint",
          mood: {
            expression: "mad",
            marker: "// warning",
            text,
            tone: "danger",
          },
        };
      case "recovery":
        return {
          source: "routeHint",
          mood: {
            expression: "suspicious",
            marker: "// fix path",
            text,
            tone: "warning",
          },
        };
      case "optional":
      case "secret":
      case "bonus":
      case "easy":
        return {
          source: "routeHint",
          mood: {
            expression: "suspicious",
            marker: "// side path",
            text,
            tone: "curious",
          },
        };
      default:
        return {
          source: "routeHint",
          mood: withTiredness(
            { expression: "normal", marker: "// hint", text, tone: "neutral" },
            mistakes,
          ),
        };
    }
  }

  // No message and no hint: stay quiet and hide the bubble until the next
  // "// hint" or "// ok".
  return null;
}

function pickBubbleAfterSuccess(
  steadyBubble: BubbleState | null,
  restoredHintBubble: BubbleState | null,
): BubbleState | null {
  if (!restoredHintBubble) return steadyBubble;
  if (!steadyBubble || steadyBubble.source === "routeHint") {
    return restoredHintBubble;
  }
  return steadyBubble;
}

// After enough stumbles the otherwise-neutral skull looks worn out.
function withTiredness(mood: Mood, mistakes: number): Mood {
  if (mistakes >= 3 && mood.expression === "normal" && mood.tone === "neutral") {
    return { ...mood, expression: "tired" };
  }
  return mood;
}

function getBounds(rect: DOMRect): Bounds {
  return { width: rect.width, height: rect.height };
}

function clampPosition(position: Position, bounds: Bounds, size: Bounds): Position {
  return {
    x: clamp(position.x, 0, Math.max(0, bounds.width - size.width)),
    y: clamp(position.y, 0, Math.max(0, bounds.height - size.height)),
  };
}

function positionFromMouse(
  clientX: number,
  clientY: number,
  dragState: DragState,
): Position {
  return clampPosition(
    {
      x: clientX - dragState.originX - dragState.offsetX,
      y: clientY - dragState.originY - dragState.offsetY,
    },
    dragState.bounds,
    dragState.size,
  );
}

function getCornerPosition(corner: Corner, bounds: Bounds, size: Bounds): Position {
  const maxX = Math.max(CORNER_PADDING, bounds.width - size.width - CORNER_PADDING);
  const maxY = Math.max(CORNER_PADDING, bounds.height - size.height - CORNER_PADDING);

  switch (corner) {
    case "topRight":
      return { x: maxX, y: CORNER_PADDING };
    case "bottomLeft":
      return { x: CORNER_PADDING, y: maxY };
    case "bottomRight":
      return { x: maxX, y: maxY };
    default:
      return { x: CORNER_PADDING, y: CORNER_PADDING };
  }
}

function findNearestCorner(
  bounds: Bounds,
  size: Bounds,
  position: Position,
): Corner {
  const corners: Corner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
  let nearestCorner = corners[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const corner of corners) {
    const cornerPosition = getCornerPosition(corner, bounds, size);
    const distance =
      (cornerPosition.x - position.x) ** 2 + (cornerPosition.y - position.y) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCorner = corner;
    }
  }

  return nearestCorner;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
