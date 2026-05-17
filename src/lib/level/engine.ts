import type {
  Branch,
  DecisionStep,
  GridDir,
  LevelJSON,
  PlaceStep,
  PlacedNode,
  Step,
  WalkedEdge,
} from "./types";
import { AUTO_END_ID, AUTO_START_ID } from "./types";

export type EngineState = {
  level: LevelJSON;
  currentStepId: string | null;
  placedNodes: PlacedNode[];
  characterCoord: [number, number];
  walkedCorridors: WalkedEdge[];
  pendingDecision: DecisionStep | null;
  feedback: { kind: "hint" | "success"; text: string } | null;
  completedBranches: string[];
  decisionStack: DecisionContext[];
  levelComplete: boolean;
  hintCount: number;
  successCount: number;
  startedAt: number;
  endedAt: number | null;
};

type DecisionContext = {
  decisionStepId: string;
  decisionCoord: [number, number];
  remainingBranches: Branch[];
  exploredBranches: Branch[];
};

export type EngineAction =
  | { type: "DROP_TOOLBOX"; toolboxId: string }
  | { type: "PICK_BRANCH"; guardLabel: string }
  | { type: "DISMISS_FEEDBACK" }
  | { type: "REPLAY_FROM_DECISION" };

export function createInitialState(level: LevelJSON): EngineState {
  const rootStep = findStep(level, level.rootStepId);
  const isPendingDecision = rootStep?.kind === "decision";
  return {
    level,
    currentStepId: level.rootStepId,
    placedNodes: [],
    characterCoord: [level.labyrinth.start[0], level.labyrinth.start[1]],
    walkedCorridors: [],
    pendingDecision: isPendingDecision ? (rootStep as DecisionStep) : null,
    feedback: null,
    completedBranches: [],
    decisionStack: [],
    levelComplete: false,
    hintCount: 0,
    successCount: 0,
    startedAt: Date.now(),
    endedAt: null,
  };
}

export function reducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "DROP_TOOLBOX":
      return handleDrop(state, action.toolboxId);
    case "PICK_BRANCH":
      return handlePickBranch(state, action.guardLabel);
    case "DISMISS_FEEDBACK":
      return { ...state, feedback: null };
    case "REPLAY_FROM_DECISION":
      return handleReplayFromDecision(state);
    default:
      return state;
  }
}

function findStep(level: LevelJSON, id: string | null): Step | undefined {
  if (!id) return undefined;
  return level.steps.find((s) => s.id === id);
}

function moveCoord(
  [x, y]: [number, number],
  dir: GridDir,
): [number, number] {
  switch (dir) {
    case "up":
      return [x, y - 1];
    case "down":
      return [x, y + 1];
    case "left":
      return [x - 1, y];
    case "right":
      return [x + 1, y];
  }
}

function handleDrop(state: EngineState, toolboxId: string): EngineState {
  if (state.levelComplete) return state;
  const step = findStep(state.level, state.currentStepId);
  if (!step) return state;
  if (step.kind !== "place") {
    return {
      ...state,
      feedback: {
        kind: "hint",
        text: "Resolve the decision first — pick a branch.",
      },
    };
  }

  if (toolboxId !== step.expectedToolboxId) {
    return {
      ...state,
      feedback: { kind: "hint", text: step.hint },
      hintCount: state.hintCount + 1,
    };
  }

  const nextCoord = moveCoord(state.characterCoord, step.labyrinthMove);
  const placed: PlacedNode = {
    stepId: step.id,
    shape: step.shape,
    label: step.nodeLabel,
  };
  const walked: WalkedEdge = {
    from: state.characterCoord,
    to: nextCoord,
  };

  const nextStepId = step.nextStepId ?? null;
  const reachedBranchTerminal = nextStepId === null;
  let decisionStack = state.decisionStack;
  let completedBranches = state.completedBranches;
  let levelComplete: boolean = state.levelComplete;
  let pendingDecision: DecisionStep | null = null;
  let resolvedNextStepId: string | null = nextStepId;

  if (nextStepId) {
    const nextStep = findStep(state.level, nextStepId);
    if (nextStep?.kind === "decision") {
      pendingDecision = nextStep;
    }
  }

  if (reachedBranchTerminal && decisionStack.length > 0) {
    const top = decisionStack[decisionStack.length - 1];
    const lastExplored = top.exploredBranches[top.exploredBranches.length - 1];
    if (lastExplored) {
      completedBranches = [...completedBranches, lastExplored.guardLabel];
    }
    if (top.remainingBranches.length === 0) {
      decisionStack = decisionStack.slice(0, -1);
      if (decisionStack.length === 0) {
        levelComplete = true;
      }
    } else {
      resolvedNextStepId = null;
    }
  } else if (reachedBranchTerminal) {
    levelComplete = true;
  }

  return {
    ...state,
    currentStepId: resolvedNextStepId,
    placedNodes: [...state.placedNodes, placed],
    characterCoord: nextCoord,
    walkedCorridors: [...state.walkedCorridors, walked],
    pendingDecision,
    feedback: { kind: "success", text: successMessage(step) },
    completedBranches,
    decisionStack,
    levelComplete,
    successCount: state.successCount + 1,
    endedAt: levelComplete && state.endedAt === null ? Date.now() : state.endedAt,
  };
}

function successMessage(step: PlaceStep): string {
  if (step.expectedToolboxId === AUTO_START_ID) {
    return "Flow begins — the initial node is in place.";
  }
  if (step.expectedToolboxId === AUTO_END_ID) {
    return "Branch reached its final node.";
  }
  return "Correct — node added to the diagram.";
}

function handlePickBranch(
  state: EngineState,
  guardLabel: string,
): EngineState {
  const decision = state.pendingDecision;
  if (!decision) return state;
  const branch = decision.branches.find((b) => b.guardLabel === guardLabel);
  if (!branch) return state;

  const remaining = decision.branches.filter(
    (b) => b.guardLabel !== guardLabel,
  );
  const ctx: DecisionContext = {
    decisionStepId: decision.id,
    decisionCoord: state.characterCoord,
    remainingBranches: remaining,
    exploredBranches: [branch],
  };

  const decisionPlaced: PlacedNode = {
    stepId: decision.id,
    shape: "decision",
    label: decision.nodeLabel,
    branchGuard: branch.guardLabel,
  };

  const branchCoord = moveCoord(state.characterCoord, branch.labyrinthDir);
  const walked: WalkedEdge = {
    from: state.characterCoord,
    to: branchCoord,
  };

  const alreadyPlaced = state.placedNodes.some(
    (n) => n.stepId === decision.id,
  );
  const placedNodes = alreadyPlaced
    ? state.placedNodes
    : [...state.placedNodes, decisionPlaced];

  return {
    ...state,
    currentStepId: branch.nextStepId,
    placedNodes,
    characterCoord: branchCoord,
    walkedCorridors: [...state.walkedCorridors, walked],
    pendingDecision: null,
    decisionStack: [...state.decisionStack, ctx],
    feedback: {
      kind: "success",
      text: `Branch "${guardLabel}" — let's see where it leads.`,
    },
    successCount: state.successCount + 1,
  };
}

function handleReplayFromDecision(state: EngineState): EngineState {
  if (state.decisionStack.length === 0) return state;
  const stack = [...state.decisionStack];
  const top = stack[stack.length - 1];
  if (top.remainingBranches.length === 0) return state;
  const nextBranch = top.remainingBranches[0];
  const updatedTop: DecisionContext = {
    ...top,
    remainingBranches: top.remainingBranches.slice(1),
    exploredBranches: [...top.exploredBranches, nextBranch],
  };
  stack[stack.length - 1] = updatedTop;

  const decision = findStep(state.level, top.decisionStepId);
  if (!decision || decision.kind !== "decision") return state;

  const dimmedPlaced = state.placedNodes.map((n) => ({ ...n, dimmed: true }));
  const dimmedWalked = state.walkedCorridors.map((w) => ({ ...w, dimmed: true }));

  const branchCoord = moveCoord(top.decisionCoord, nextBranch.labyrinthDir);
  const walked: WalkedEdge = {
    from: top.decisionCoord,
    to: branchCoord,
  };

  const newDecisionNode: PlacedNode = {
    stepId: decision.id,
    shape: "decision",
    label: decision.nodeLabel,
    branchGuard: nextBranch.guardLabel,
  };

  return {
    ...state,
    currentStepId: nextBranch.nextStepId,
    placedNodes: [...dimmedPlaced, newDecisionNode],
    characterCoord: branchCoord,
    walkedCorridors: [...dimmedWalked, walked],
    pendingDecision: null,
    feedback: {
      kind: "success",
      text: `Now exploring branch "${nextBranch.guardLabel}".`,
    },
    decisionStack: stack,
  };
}

export function hasUnexploredBranches(state: EngineState): boolean {
  if (state.decisionStack.length === 0) return false;
  const top = state.decisionStack[state.decisionStack.length - 1];
  return (
    top.remainingBranches.length > 0 && state.currentStepId === null
  );
}

export function currentStep(state: EngineState): Step | null {
  const s = findStep(state.level, state.currentStepId);
  return s ?? null;
}
