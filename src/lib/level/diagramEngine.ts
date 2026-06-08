import type {
  DiagramDecisionStep,
  DiagramPuzzleJSON,
  DiagramPuzzleStep,
  PlacedNode,
} from "./types";

const AUTO_TOOLBOX_IDS = new Set(["_auto_start", "_auto_end"]);

export type DiagramEngineState = {
  puzzle: DiagramPuzzleJSON;
  currentStepId: string | null;
  placedNodes: PlacedNode[];
  pendingDecision: DiagramDecisionStep | null;
  selectedBranchGuards: string[];
  hintCount: number;
  successCount: number;
  feedback: { kind: "hint" | "success"; text: string } | null;
  complete: boolean;
};

export type DiagramEngineAction =
  | { type: "DROP_TOOLBOX"; toolboxId: string }
  | { type: "PICK_BRANCH"; guardLabel: string }
  | { type: "DISMISS_FEEDBACK" };

export function createDiagramState(
  puzzle: DiagramPuzzleJSON,
): DiagramEngineState {
  const rootStep = findStep(puzzle, puzzle.rootStepId);
  return applyAutoSteps({
    puzzle,
    currentStepId: puzzle.rootStepId,
    placedNodes: [],
    pendingDecision: rootStep?.kind === "decision" ? rootStep : null,
    selectedBranchGuards: [],
    hintCount: 0,
    successCount: 0,
    feedback: null,
    complete: false,
  });
}

export function diagramReducer(
  state: DiagramEngineState,
  action: DiagramEngineAction,
): DiagramEngineState {
  switch (action.type) {
    case "DROP_TOOLBOX":
      return handleDrop(state, action.toolboxId);
    case "PICK_BRANCH":
      return handlePickBranch(state, action.guardLabel);
    case "DISMISS_FEEDBACK":
      return { ...state, feedback: null };
    default:
      return state;
  }
}

function findStep(
  puzzle: DiagramPuzzleJSON,
  id: string | null,
): DiagramPuzzleStep | undefined {
  if (!id) return undefined;
  return puzzle.steps.find((step) => step.id === id);
}

function handleDrop(
  state: DiagramEngineState,
  toolboxId: string,
): DiagramEngineState {
  if (state.complete) return state;
  const step = findStep(state.puzzle, state.currentStepId);
  if (!step || step.kind !== "place") return state;

  if (toolboxId !== step.expectedToolboxId) {
    return {
      ...state,
      feedback: { kind: "hint", text: step.hint },
      hintCount: state.hintCount + 1,
    };
  }

  const placedNode: PlacedNode = {
    id: step.id,
    shape: step.shape,
    label: step.nodeLabel,
  };

  return applyAutoSteps({
    ...state,
    currentStepId: step.nextStepId ?? null,
    placedNodes: [...state.placedNodes, placedNode],
    pendingDecision: null,
    feedback: { kind: "success", text: "Correct - diagram segment placed." },
    successCount: state.successCount + 1,
    complete: step.nextStepId === undefined,
  });
}

function handlePickBranch(
  state: DiagramEngineState,
  guardLabel: string,
): DiagramEngineState {
  const decision = state.pendingDecision;
  if (!decision) return state;
  const branch = decision.branches.find(
    (candidate) => candidate.guardLabel === guardLabel,
  );
  if (!branch) return state;

  const decisionNode: PlacedNode = {
    id: decision.id,
    shape: "decision",
    label: decision.nodeLabel,
    branchGuard: guardLabel,
  };

  return applyAutoSteps({
    ...state,
    currentStepId: branch.nextStepId,
    placedNodes: [...state.placedNodes, decisionNode],
    pendingDecision: null,
    selectedBranchGuards: [...state.selectedBranchGuards, guardLabel],
    feedback: {
      kind: "success",
      text: `Branch "${guardLabel}" selected.`,
    },
    successCount: state.successCount + 1,
  });
}

function applyAutoSteps(state: DiagramEngineState): DiagramEngineState {
  let nextState = state;

  for (;;) {
    const step = findStep(nextState.puzzle, nextState.currentStepId);
    if (!step) {
      return { ...nextState, complete: true, pendingDecision: null };
    }

    if (step.kind === "decision") {
      return { ...nextState, pendingDecision: step };
    }

    if (!AUTO_TOOLBOX_IDS.has(step.expectedToolboxId)) {
      return nextState;
    }

    const placedNode: PlacedNode = {
      id: step.id,
      shape: step.shape,
      label: step.nodeLabel,
    };

    nextState = {
      ...nextState,
      currentStepId: step.nextStepId ?? null,
      placedNodes: [...nextState.placedNodes, placedNode],
      pendingDecision: null,
      complete: step.nextStepId === undefined,
    };

    if (step.nextStepId === undefined) {
      return nextState;
    }
  }
}
