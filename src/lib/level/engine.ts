import {
  createDiagramState,
  diagramReducer,
  type DiagramEngineState,
} from "./diagramEngine";
import { collectClosedBarrierCellKeys } from "./barriers";
import {
  computeNewlyUnlockedEndingIds,
  computeUnlockedEndingIds,
} from "./unlocks";
import { getChallengeById } from "./validation";
import type {
  Coord,
  DiagramChallenge,
  LabyrinthLevelJSON,
  LevelEnding,
  LevelGate,
  LevelRoute,
  LevelRouteKind,
  LevelSummary,
  ParkourChallenge,
  PlacedNode,
  RewardBundle,
} from "./types";

export type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type FeedbackState = {
  kind: "hint" | "success";
  text: string;
};

export type RouteTargetState = {
  kind: "gate" | "ending";
  id: string;
  label: string;
  x: number;
  y: number;
};

export type RouteHintState = {
  routeId: string;
  label: string;
  kind: LevelRouteKind;
  summary: string;
  recommended: boolean;
  target: RouteTargetState;
};

export type RouteDecisionState = {
  gateId: string;
  gateLabel: string;
  options: RouteHintState[];
};

export type ParkourSession = {
  gateId: string;
  challengeId: string;
  player: Coord;
  elapsedMs: number;
  obstacleHits: number;
};

export type CompletionPayload = {
  levelId: string;
  endingId: string;
  endingLabel: string;
  endingTier: LevelEnding["tier"];
  outcomesUnlocked: string[];
  earned: RewardBundle;
  run: {
    elapsedMs: number;
    successRate: number;
    gatesCleared: number;
    challengesCompleted: number;
    mistakes: number;
    optionalRoutesCompleted: number;
  };
  completesLevel: boolean;
  rank: number;
  at: string;
};

export type EngineState = {
  level: LabyrinthLevelJSON;
  seenEndingIds: Set<string>;
  unlockedEndingIds: Set<string>;
  closedBarrierCellKeys: Set<string>;
  player: Coord;
  facing: "left" | "right";
  moving: boolean;
  revealedCells: Set<string>;
  resolvedGateIds: Set<string>;
  completedChallengeIds: Set<string>;
  collectedCoinIds: Set<string>;
  routeAnchorGateId: string | null;
  deferredGateId: string | null;
  grantedFlags: Set<string>;
  placedNodes: PlacedNode[];
  feedback: FeedbackState | null;
  activeGateId: string | null;
  routeHint: RouteHintState | null;
  activeDiagram: {
    gateId: string;
    challenge: DiagramChallenge;
    state: DiagramEngineState;
  } | null;
  activeParkour: {
    gateId: string;
    challenge: ParkourChallenge;
    state: ParkourSession;
  } | null;
  rewards: RewardBundle;
  successfulInteractions: number;
  mistakes: number;
  gatesCleared: number;
  challengesCompleted: number;
  optionalRoutesCompleted: number;
  startedAt: number;
  completedAt: number | null;
  completion: CompletionPayload | null;
};

export type EngineAction =
  | { type: "TICK"; dtMs: number; input: InputState }
  | { type: "DISMISS_FEEDBACK" }
  | { type: "SYNC_SEEN_ENDINGS"; seenEndingIds: string[] }
  | { type: "DIAGRAM_DROP_TOOLBOX"; toolboxId: string }
  | { type: "DIAGRAM_PICK_BRANCH"; guardLabel: string }
  | { type: "DIAGRAM_DISMISS_FEEDBACK" }
  | { type: "CLOSE_CHALLENGE" }
  | { type: "RESET"; seenEndingIds?: string[] };

type InitialStateArg =
  | LabyrinthLevelJSON
  | {
      level: LabyrinthLevelJSON;
      seenEndingIds?: string[];
    };

const PLAYER_RADIUS = 0.22;
const PLAYER_SPEED = 3.6;

export function createInitialState(input: InitialStateArg): EngineState {
  const { level, seenEndingIds } = normalizeInitialStateArg(input);
  const seenEndingIdSet = new Set(seenEndingIds);
  const unlockedEndingIds = computeUnlockedEndingIds(level, seenEndingIdSet);
  const closedBarrierCellKeys = collectClosedBarrierCellKeys(
    level.labyrinth.barriers,
    unlockedEndingIds,
  );
  const player = {
    x: level.labyrinth.start.x + 0.5,
    y: level.labyrinth.start.y + 0.5,
  };
  const revealed = revealAround(new Set<string>(), level, player);
  const startGate = level.gates.find(
    (gate) =>
      gate.x === level.labyrinth.start.x && gate.y === level.labyrinth.start.y,
  );

  return {
    level,
    seenEndingIds: seenEndingIdSet,
    unlockedEndingIds,
    closedBarrierCellKeys,
    player,
    facing: "right",
    moving: false,
    revealedCells: revealed,
    resolvedGateIds: new Set<string>(),
    completedChallengeIds: new Set<string>(),
    collectedCoinIds: new Set<string>(),
    routeAnchorGateId: startGate?.id ?? null,
    deferredGateId: null,
    grantedFlags: new Set<string>(),
    placedNodes: [
      {
        id: "__start__",
        shape: "start",
        label: "Start",
        sourceGateLabel: "Session start",
      },
    ],
    feedback: {
      kind: "success",
      text: "Use WASD or arrow keys. Walk through a doorway to choose it.",
    },
    activeGateId: null,
    routeHint: initialRouteHint(level, unlockedEndingIds),
    activeDiagram: null,
    activeParkour: null,
    rewards: { xp: 0, coins: 0 },
    successfulInteractions: 0,
    mistakes: 0,
    gatesCleared: 0,
    challengesCompleted: 0,
    optionalRoutesCompleted: 0,
    startedAt: Date.now(),
    completedAt: null,
    completion: null,
  };
}

function normalizeInitialStateArg(input: InitialStateArg) {
  if ("labyrinth" in input) {
    return { level: input, seenEndingIds: [] as string[] };
  }

  return {
    level: input.level,
    seenEndingIds: input.seenEndingIds ?? [],
  };
}

export function reducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "TICK":
      return tick(state, action.dtMs, action.input);
    case "DISMISS_FEEDBACK":
      return { ...state, feedback: null };
    case "SYNC_SEEN_ENDINGS":
      return syncSeenEndings(state, action.seenEndingIds);
    case "DIAGRAM_DROP_TOOLBOX":
      return reduceDiagram(state, { type: "DROP_TOOLBOX", toolboxId: action.toolboxId });
    case "DIAGRAM_PICK_BRANCH":
      return reduceDiagram(state, { type: "PICK_BRANCH", guardLabel: action.guardLabel });
    case "DIAGRAM_DISMISS_FEEDBACK":
      return reduceDiagram(state, { type: "DISMISS_FEEDBACK" });
    case "CLOSE_CHALLENGE":
      return closeChallenge(state);
    case "RESET":
      return createInitialState({
        level: state.level,
        seenEndingIds: action.seenEndingIds ?? [...state.seenEndingIds],
      });
    default:
      return state;
  }
}

function syncSeenEndings(
  state: EngineState,
  nextSeenEndingIds: string[],
): EngineState {
  const nextSeenSet = new Set(nextSeenEndingIds);
  if (setsEqual(state.seenEndingIds, nextSeenSet)) {
    return state;
  }

  const unlockedEndingIds = computeUnlockedEndingIds(state.level, nextSeenSet);
  const routeOptions = state.routeAnchorGateId
    ? routeHintsForGate(state.level, state.routeAnchorGateId, unlockedEndingIds)
    : [];
  return {
    ...state,
    seenEndingIds: nextSeenSet,
    unlockedEndingIds,
    closedBarrierCellKeys: collectClosedBarrierCellKeys(
      state.level.labyrinth.barriers,
      unlockedEndingIds,
    ),
    routeHint:
      routeOptions.find((option) => option.recommended) ??
      routeOptions[0] ??
      initialRouteHint(state.level, unlockedEndingIds),
  };
}

function tick(state: EngineState, dtMs: number, input: InputState): EngineState {
  if (state.completion) return state;

  if (state.activeDiagram) {
    return state;
  }

  if (state.activeParkour) {
    return tickParkour(state, dtMs, input);
  }

  const nextPlayer = moveWithinMap(
    state.level,
    state.player,
    input,
    dtMs,
    state.closedBarrierCellKeys,
  );
  const dx = nextPlayer.x - state.player.x;
  const dy = nextPlayer.y - state.player.y;
  const moving = Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4;
  const facing =
    Math.abs(dx) > 1e-4 && Math.abs(dx) >= Math.abs(dy)
      ? dx < 0
        ? "left"
        : "right"
      : state.facing;
  let nextState: EngineState = {
    ...state,
    player: nextPlayer,
    facing,
    moving,
    revealedCells: revealAround(new Set(state.revealedCells), state.level, nextPlayer),
  };

  nextState = collectCoinAt(nextState, nextPlayer);

  const standingGate = findGateAt(state.level, nextPlayer);
  if (!standingGate && state.deferredGateId) {
    nextState.deferredGateId = null;
  }

  if (standingGate) {
    nextState = maybeAdvanceRouteHint(
      { ...nextState, routeAnchorGateId: standingGate.id },
      standingGate,
    );
    nextState = maybeTriggerGate(nextState, standingGate);
  } else {
    nextState = maybeFollowPhysicalDoor(nextState, nextPlayer);
  }

  if (nextState.activeDiagram || nextState.activeParkour || nextState.completion) {
    return nextState;
  }

  const ending = findEndingAt(
    nextState.level,
    nextPlayer,
    nextState.grantedFlags,
    nextState.unlockedEndingIds,
  );
  if (ending) {
    return completeLevel(nextState, ending);
  }

  return nextState;
}

function tickParkour(
  state: EngineState,
  dtMs: number,
  input: InputState,
): EngineState {
  const activeParkour = state.activeParkour;
  if (!activeParkour) return state;

  const nextSession: ParkourSession = {
    ...activeParkour.state,
    elapsedMs: activeParkour.state.elapsedMs + dtMs,
    player: moveWithinChallenge(
      activeParkour.challenge,
      activeParkour.state.player,
      input,
      dtMs,
    ),
  };

  const obstacleRects = activeParkour.challenge.obstacles.map((obstacle) =>
    getObstacleRect(obstacle, nextSession.elapsedMs),
  );

  const playerRect = {
    left: nextSession.player.x - PLAYER_RADIUS,
    right: nextSession.player.x + PLAYER_RADIUS,
    top: nextSession.player.y - PLAYER_RADIUS,
    bottom: nextSession.player.y + PLAYER_RADIUS,
  };

  const collided = obstacleRects.some((rect) => intersects(playerRect, rect));
  if (collided) {
    const rewards = applyPenalty(
      state.rewards,
      state.level.scoring.obstacleHitPenalty,
    );

    return {
      ...state,
      rewards,
      mistakes: state.mistakes + 1,
      feedback: {
        kind: "hint",
        text:
          activeParkour.challenge.failureText ??
          "Obstacle hit - resetting the parkour route.",
      },
      activeParkour: {
        ...activeParkour,
        state: {
          ...nextSession,
          player: {
            x: activeParkour.challenge.start.x + 0.5,
            y: activeParkour.challenge.start.y + 0.5,
          },
          obstacleHits: activeParkour.state.obstacleHits + 1,
        },
      },
    };
  }

  const goalReached =
    Math.floor(nextSession.player.x) === activeParkour.challenge.goal.x &&
    Math.floor(nextSession.player.y) === activeParkour.challenge.goal.y;

  if (goalReached) {
    return resolveParkourSuccess(state, activeParkour.gateId, activeParkour.challenge);
  }

  return {
    ...state,
    activeParkour: {
      ...activeParkour,
      state: nextSession,
    },
  };
}

function reduceDiagram(
  state: EngineState,
  action: Parameters<typeof diagramReducer>[1],
): EngineState {
  if (!state.activeDiagram) return state;

  const nextDiagramState = diagramReducer(state.activeDiagram.state, action);
  let nextState: EngineState = {
    ...state,
    activeDiagram: {
      ...state.activeDiagram,
      state: nextDiagramState,
    },
  };

  if (nextDiagramState.feedback?.kind === "hint") {
    nextState = {
      ...nextState,
      rewards: applyPenalty(
        nextState.rewards,
        nextState.level.scoring.wrongDiagramPenalty,
      ),
      mistakes: nextState.mistakes + 1,
    };
  }

  if (!nextDiagramState.complete) {
    return nextState;
  }

  const expectedBranches = state.activeDiagram.challenge.successBranchGuards;
  if (
    expectedBranches &&
    expectedBranches.length > 0 &&
    !expectedBranches.every((guard) =>
      nextDiagramState.selectedBranchGuards.includes(guard),
    )
  ) {
    const gate = state.level.gates.find(
      (candidate) => candidate.id === state.activeDiagram?.gateId,
    );
    return {
      ...nextState,
      rewards: applyPenalty(
        nextState.rewards,
        nextState.level.scoring.wrongDiagramPenalty,
      ),
      mistakes: nextState.mistakes + 1,
      activeGateId: null,
      activeDiagram: null,
      deferredGateId: gate?.optional ? gate.id : null,
      feedback: {
        kind: "hint",
        text:
          state.activeDiagram.challenge.failureText ??
          "That branch preserves the easier route. Try again or keep exploring.",
      },
    };
  }

  return resolveDiagramSuccess(
    nextState,
    state.activeDiagram.gateId,
    state.activeDiagram.challenge,
  );
}

function maybeAdvanceRouteHint(
  state: EngineState,
  gate: LevelGate,
): EngineState {
  const selectedRoute = state.routeHint
    ? state.level.routes.find((route) => route.id === state.routeHint?.routeId)
    : null;
  const selectedHint = selectedRoute
    ? routeHintForGate(
        state.level,
        selectedRoute,
        gate.id,
        state.unlockedEndingIds,
      )
    : null;

  if (selectedHint) {
    return { ...state, routeHint: selectedHint };
  }

  const options = routeHintsForGate(
    state.level,
    gate.id,
    state.unlockedEndingIds,
  );
  if (options.length > 0) {
    return {
      ...state,
      routeHint: options.find((option) => option.recommended) ?? options[0],
    };
  }

  return state;
}

function maybeFollowPhysicalDoor(
  state: EngineState,
  player: Coord,
): EngineState {
  if (!state.routeAnchorGateId) return state;

  const anchor = state.level.gates.find(
    (gate) => gate.id === state.routeAnchorGateId,
  );
  if (!anchor) return state;

  const options = routeHintsForGate(
    state.level,
    anchor.id,
    state.unlockedEndingIds,
  );
  if (options.length <= 1) return state;

  const from = { x: anchor.x + 0.5, y: anchor.y + 0.5 };
  const travel = { x: player.x - from.x, y: player.y - from.y };
  const travelLength = Math.hypot(travel.x, travel.y);
  if (travelLength < 0.65) return state;

  const selected = [...options].sort((left, right) => {
    const leftScore = routeDirectionScore(from, player, left.target);
    const rightScore = routeDirectionScore(from, player, right.target);
    return leftScore - rightScore;
  })[0];

  if (!selected || selected.routeId === state.routeHint?.routeId) return state;

  return {
    ...state,
    routeHint: selected,
    feedback: {
      kind: "hint",
      text: `This doorway heads to ${selected.target.label}: ${selected.summary}`,
    },
  };
}

function collectCoinAt(state: EngineState, player: Coord): EngineState {
  const cellX = Math.floor(player.x);
  const cellY = Math.floor(player.y);
  const coin = state.level.coinPickups.find(
    (candidate) =>
      candidate.x === cellX &&
      candidate.y === cellY &&
      !state.collectedCoinIds.has(candidate.id),
  );

  if (!coin) return state;

  const collectedCoinIds = new Set(state.collectedCoinIds);
  collectedCoinIds.add(coin.id);

  return {
    ...state,
    collectedCoinIds,
    rewards: addRewards(state.rewards, { xp: 0, coins: coin.value }),
    feedback: {
      kind: "success",
      text: `Coin picked up: +${coin.value}.`,
    },
  };
}

function maybeTriggerGate(state: EngineState, gate: LevelGate): EngineState {
  if (state.deferredGateId === gate.id || state.activeGateId === gate.id) {
    return state;
  }

  if (gate.oneShot && state.resolvedGateIds.has(gate.id)) {
    const alreadyCompletedChallenge = gate.challengeId
      ? state.completedChallengeIds.has(gate.challengeId)
      : false;
    if (!gate.challengeId || alreadyCompletedChallenge) {
      return state;
    }
  }

  const challenge = gate.challengeId
    ? getChallengeById(state.level, gate.challengeId)
    : null;

  let nextState = state;

  if (gate.appendOn === "enter" && !state.resolvedGateIds.has(gate.id)) {
    nextState = resolveGate(nextState, gate);
  }

  if (!challenge || nextState.completedChallengeIds.has(challenge.id)) {
    return nextState;
  }

  if (challenge.kind === "diagram") {
    return {
      ...nextState,
      moving: false,
      activeGateId: gate.id,
      activeDiagram: {
        gateId: gate.id,
        challenge,
        state: createDiagramState(challenge.puzzle),
      },
      feedback: null,
    };
  }

  return {
    ...nextState,
    moving: false,
    activeGateId: gate.id,
    activeParkour: {
      gateId: gate.id,
      challenge,
      state: {
        gateId: gate.id,
        challengeId: challenge.id,
        player: {
          x: challenge.start.x + 0.5,
          y: challenge.start.y + 0.5,
        },
        elapsedMs: 0,
        obstacleHits: 0,
      },
    },
    feedback: null,
  };
}

function resolveGate(
  state: EngineState,
  gate: LevelGate,
  sourceChallengeId?: string,
): EngineState {
  if (state.resolvedGateIds.has(gate.id)) return state;

  const resolvedGateIds = new Set(state.resolvedGateIds);
  resolvedGateIds.add(gate.id);

  const grantedFlags = new Set(state.grantedFlags);
  gate.grantsFlags?.forEach((flag) => grantedFlags.add(flag));

  const placedNodes = [
    ...state.placedNodes,
    ...gate.appendNodes.map((node, index) => ({
      id: `${gate.id}-${index}`,
      shape: node.shape,
      label: node.label,
      branchGuard: node.branchGuard,
      sourceGateId: gate.id,
      sourceGateLabel: gate.label,
      sourceChallengeId,
    })),
  ];

  const reward = rewardForGate(state.level, gate);

  return {
    ...state,
    resolvedGateIds,
    grantedFlags,
    placedNodes,
    rewards: addRewards(state.rewards, reward),
    successfulInteractions: state.successfulInteractions + 1,
    gatesCleared: state.gatesCleared + 1,
    optionalRoutesCompleted:
      state.optionalRoutesCompleted + (gate.optional ? 1 : 0),
    feedback: { kind: "success", text: `${gate.label} added to progress.` },
  };
}

function resolveDiagramSuccess(
  state: EngineState,
  gateId: string,
  challenge: DiagramChallenge,
): EngineState {
  const gate = state.level.gates.find((candidate) => candidate.id === gateId);
  if (!gate) return state;

  let nextState = state;
  if (gate.appendOn === "challengeSuccess") {
    nextState = resolveGate(nextState, gate, challenge.id);
  }

  const bonus = {
    xp: state.level.scoring.diagramSuccessXp + challenge.rewards.xp,
    coins: challenge.rewards.coins,
  };

  return {
    ...nextState,
    rewards: addRewards(nextState.rewards, bonus),
    completedChallengeIds: new Set(nextState.completedChallengeIds).add(
      challenge.id,
    ),
    activeGateId: null,
    activeDiagram: null,
    challengesCompleted: nextState.challengesCompleted + 1,
    successfulInteractions: nextState.successfulInteractions + 1,
    feedback: {
      kind: "success",
      text: challenge.successText ?? "Diagram Wizard complete - route unlocked.",
    },
  };
}

function resolveParkourSuccess(
  state: EngineState,
  gateId: string,
  challenge: ParkourChallenge,
): EngineState {
  const gate = state.level.gates.find((candidate) => candidate.id === gateId);
  if (!gate) return state;

  let nextState = state;
  if (gate.appendOn === "challengeSuccess") {
    nextState = resolveGate(nextState, gate, challenge.id);
  }

  const bonus = {
    xp: state.level.scoring.parkourSuccessXp + challenge.rewards.xp,
    coins: challenge.rewards.coins,
  };

  return {
    ...nextState,
    rewards: addRewards(nextState.rewards, bonus),
    completedChallengeIds: new Set(nextState.completedChallengeIds).add(
      challenge.id,
    ),
    activeGateId: null,
    activeParkour: null,
    challengesCompleted: nextState.challengesCompleted + 1,
    successfulInteractions: nextState.successfulInteractions + 1,
    feedback: {
      kind: "success",
      text: challenge.successText ?? "Parkour cleared - route unlocked.",
    },
  };
}

function closeChallenge(state: EngineState): EngineState {
  if (state.activeDiagram) {
    const gate = state.level.gates.find(
      (candidate) => candidate.id === state.activeDiagram?.gateId,
    );
    if (!gate?.optional) return state;

    return {
      ...state,
      activeGateId: null,
      activeDiagram: null,
      deferredGateId: gate.id,
      feedback: {
        kind: "hint",
        text: "Optional challenge skipped. The easier route is still open.",
      },
    };
  }

  if (state.activeParkour) {
    const gate = state.level.gates.find(
      (candidate) => candidate.id === state.activeParkour?.gateId,
    );
    if (!gate?.optional) return state;

    return {
      ...state,
      activeGateId: null,
      activeParkour: null,
      deferredGateId: gate.id,
      feedback: {
        kind: "hint",
        text: "Optional challenge skipped. The easier route is still open.",
      },
    };
  }

  return state;
}

function completeLevel(state: EngineState, ending: LevelEnding): EngineState {
  const now = Date.now();
  const successRate = calculateSuccessRate(
    state.successfulInteractions + 1,
    state.mistakes,
  );
  const earned = addRewards(state.rewards, ending.rewards);
  const outcomesUnlocked = computeNewlyUnlockedEndingIds(
    state.level,
    state.seenEndingIds,
    ending.id,
  );

  return {
    ...state,
    moving: false,
    rewards: earned,
    successfulInteractions: state.successfulInteractions + 1,
    completedAt: now,
    completion: {
      levelId: state.level.id,
      endingId: ending.id,
      endingLabel: ending.title,
      endingTier: ending.tier,
      outcomesUnlocked,
      earned,
      run: {
        elapsedMs: now - state.startedAt,
        successRate,
        gatesCleared: state.gatesCleared,
        challengesCompleted: state.challengesCompleted,
        mistakes: state.mistakes,
        optionalRoutesCompleted: state.optionalRoutesCompleted,
      },
      completesLevel: ending.completesLevel,
      rank: ending.rank,
      at: new Date(now).toISOString(),
    },
    placedNodes: [
      ...state.placedNodes,
      {
        id: `ending-${ending.id}`,
        shape: "end",
        label: ending.title,
        sourceGateLabel: ending.title,
      },
    ],
    feedback: { kind: "success", text: ending.summary },
  };
}

function rewardForGate(level: LabyrinthLevelJSON, gate: LevelGate): RewardBundle {
  const base = {
    xp: level.scoring.gateBaseXp + gate.rewards.xp,
    coins: level.scoring.gateBaseCoins + gate.rewards.coins,
  };
  if (!gate.optional) return base;
  return {
    xp: base.xp + level.scoring.optionalRouteBonus,
    coins: base.coins + level.scoring.optionalRouteBonus,
  };
}

function initialRouteHint(
  level: LabyrinthLevelJSON,
  unlockedEndingIds: Set<string>,
): RouteHintState | null {
  const availableRoutes = level.routes.filter((route) =>
    isRouteAvailable(route, unlockedEndingIds),
  );
  const route =
    availableRoutes.find((candidate) => candidate.recommended) ??
    availableRoutes[0];
  if (!route) return null;

  const startGate = level.gates.find(
    (gate) =>
      gate.x === level.labyrinth.start.x && gate.y === level.labyrinth.start.y,
  );

  return createRouteHint(level, route, startGate?.id ?? null);
}

function routeHintsForGate(
  level: LabyrinthLevelJSON,
  gateId: string,
  unlockedEndingIds: Set<string>,
): RouteHintState[] {
  return level.routes
    .filter((route) => isRouteAvailable(route, unlockedEndingIds))
    .map((route) => routeHintForGate(level, route, gateId, unlockedEndingIds))
    .filter((hint): hint is RouteHintState => Boolean(hint));
}

function routeHintForGate(
  level: LabyrinthLevelJSON,
  route: LevelRoute,
  gateId: string,
  unlockedEndingIds: Set<string>,
): RouteHintState | null {
  if (!isRouteAvailable(route, unlockedEndingIds)) return null;
  const gateIndex = route.gateIds.indexOf(gateId);
  if (gateIndex < 0) return null;
  if (route.mode === "edge" && gateIndex > 0) return null;
  return createRouteHint(level, route, gateId);
}

function isRouteAvailable(
  route: LevelRoute,
  unlockedEndingIds: Set<string>,
): boolean {
  return unlockedEndingIds.has(route.endingId);
}

function createRouteHint(
  level: LabyrinthLevelJSON,
  route: LevelRoute,
  currentGateId: string | null,
): RouteHintState | null {
  const target = routeTargetFor(level, route, currentGateId);
  if (!target) return null;

  return {
    routeId: route.id,
    label: route.label,
    kind: route.kind,
    summary: route.summary,
    recommended: route.recommended,
    target,
  };
}

function routeTargetFor(
  level: LabyrinthLevelJSON,
  route: LevelRoute,
  currentGateId: string | null,
): RouteTargetState | null {
  const currentIndex = currentGateId ? route.gateIds.indexOf(currentGateId) : -1;
  const nextGateId =
    currentIndex >= 0 ? route.gateIds[currentIndex + 1] : route.gateIds[0];
  const nextGate = nextGateId
    ? level.gates.find((gate) => gate.id === nextGateId)
    : null;

  if (nextGate) {
    return {
      kind: "gate",
      id: nextGate.id,
      label: nextGate.label,
      x: nextGate.x,
      y: nextGate.y,
    };
  }

  const ending = level.endings.find((candidate) => candidate.id === route.endingId);
  if (!ending) return null;

  return {
    kind: "ending",
    id: ending.id,
    label: ending.title,
    x: ending.x,
    y: ending.y,
  };
}

function routeDirectionScore(
  from: Coord,
  player: Coord,
  target: RouteTargetState,
): number {
  const travel = {
    x: player.x - from.x,
    y: player.y - from.y,
  };
  const targetVector = {
    x: target.x + 0.5 - from.x,
    y: target.y + 0.5 - from.y,
  };
  const travelLength = Math.hypot(travel.x, travel.y);
  const targetLength = Math.hypot(targetVector.x, targetVector.y);
  const directionPenalty =
    travelLength === 0 || targetLength === 0
      ? 0
      : 1 -
        (travel.x * targetVector.x + travel.y * targetVector.y) /
          (travelLength * targetLength);
  const targetDistance = Math.hypot(
    target.x + 0.5 - player.x,
    target.y + 0.5 - player.y,
  );

  return directionPenalty * 6 + targetDistance * 0.12;
}

function addRewards(current: RewardBundle, earned: RewardBundle): RewardBundle {
  return {
    xp: Math.max(0, current.xp + earned.xp),
    coins: Math.max(0, current.coins + earned.coins),
  };
}

function applyPenalty(current: RewardBundle, amount: number): RewardBundle {
  return {
    xp: Math.max(0, current.xp - amount),
    coins: current.coins,
  };
}

function moveWithinMap(
  level: LabyrinthLevelJSON,
  player: Coord,
  input: InputState,
  dtMs: number,
  blockedCells: Set<string>,
): Coord {
  const dt = dtMs / 1000;
  const velocity = normalizeInput(input);
  const nextX = resolveAxisCollision(
    level.labyrinth.map,
    player.x,
    player.y,
    velocity.x * PLAYER_SPEED * dt,
    "x",
    blockedCells,
  );
  const nextY = resolveAxisCollision(
    level.labyrinth.map,
    nextX,
    player.y,
    velocity.y * PLAYER_SPEED * dt,
    "y",
    blockedCells,
  );

  return { x: nextX, y: nextY };
}

function moveWithinChallenge(
  challenge: ParkourChallenge,
  player: Coord,
  input: InputState,
  dtMs: number,
): Coord {
  const dt = dtMs / 1000;
  const velocity = normalizeInput(input);
  const nextX = resolveAxisCollision(
    challenge.map,
    player.x,
    player.y,
    velocity.x * PLAYER_SPEED * dt,
    "x",
  );
  const nextY = resolveAxisCollision(
    challenge.map,
    nextX,
    player.y,
    velocity.y * PLAYER_SPEED * dt,
    "y",
  );

  return { x: nextX, y: nextY };
}

function normalizeInput(input: InputState): Coord {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

function resolveAxisCollision(
  map: string[],
  currentX: number,
  currentY: number,
  delta: number,
  axis: "x" | "y",
  blockedCells?: Set<string>,
): number {
  const candidate = (axis === "x" ? currentX : currentY) + delta;
  const other = axis === "x" ? currentY : currentX;

  const samples =
    axis === "x"
      ? [
          { x: candidate - PLAYER_RADIUS, y: other - PLAYER_RADIUS },
          { x: candidate + PLAYER_RADIUS, y: other - PLAYER_RADIUS },
          { x: candidate - PLAYER_RADIUS, y: other + PLAYER_RADIUS },
          { x: candidate + PLAYER_RADIUS, y: other + PLAYER_RADIUS },
        ]
      : [
          { x: other - PLAYER_RADIUS, y: candidate - PLAYER_RADIUS },
          { x: other + PLAYER_RADIUS, y: candidate - PLAYER_RADIUS },
          { x: other - PLAYER_RADIUS, y: candidate + PLAYER_RADIUS },
          { x: other + PLAYER_RADIUS, y: candidate + PLAYER_RADIUS },
        ];

  const blocked = samples.some((sample) =>
    isWall(map, sample.x, sample.y, blockedCells),
  );
  return blocked ? (axis === "x" ? currentX : currentY) : candidate;
}

function isWall(
  map: string[],
  x: number,
  y: number,
  blockedCells?: Set<string>,
): boolean {
  const row = map[Math.floor(y)];
  if (!row) return true;
  const tile = row[Math.floor(x)];
  return (
    tile === undefined ||
    tile === "#" ||
    Boolean(blockedCells?.has(cellKey(Math.floor(x), Math.floor(y))))
  );
}

function revealAround(
  revealed: Set<string>,
  level: LabyrinthLevelJSON,
  player: Coord,
): Set<string> {
  const radius = level.labyrinth.revealRadius;
  const minX = Math.floor(player.x - radius);
  const maxX = Math.floor(player.x + radius);
  const minY = Math.floor(player.y - radius);
  const maxY = Math.floor(player.y + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (
        x < 0 ||
        y < 0 ||
        x >= level.labyrinth.width ||
        y >= level.labyrinth.height
      ) {
        continue;
      }
      if (Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y) <= radius + 0.25) {
        revealed.add(cellKey(x, y));
      }
    }
  }

  return revealed;
}

function findGateAt(
  level: LabyrinthLevelJSON,
  player: Coord,
): LevelGate | null {
  const cellX = Math.floor(player.x);
  const cellY = Math.floor(player.y);
  return (
    level.gates.find((gate) => gate.x === cellX && gate.y === cellY) ?? null
  );
}

function findEndingAt(
  level: LabyrinthLevelJSON,
  player: Coord,
  flags: Set<string>,
  unlockedEndingIds: Set<string>,
): LevelEnding | null {
  const cellX = Math.floor(player.x);
  const cellY = Math.floor(player.y);
  return (
    level.endings.find((ending) => {
      if (ending.x !== cellX || ending.y !== cellY) return false;
      if (!unlockedEndingIds.has(ending.id)) return false;
      const allowedByRequires =
        ending.requiresFlags?.every((flag) => flags.has(flag)) ?? true;
      const allowedByForbid =
        ending.forbidFlags?.every((flag) => !flags.has(flag)) ?? true;
      return allowedByRequires && allowedByForbid;
    }) ?? null
  );
}

function calculateSuccessRate(successes: number, mistakes: number): number {
  const total = successes + mistakes;
  if (total <= 0) return 100;
  return Math.round((successes / total) * 100);
}

function getObstacleRect(
  obstacle: ParkourChallenge["obstacles"][number],
  elapsedMs: number,
) {
  const path = obstacle.waypoints.length > 0 ? obstacle.waypoints : [obstacle.origin];
  if (path.length === 1) {
    return rectFromObstacle(obstacle, path[0]);
  }

  const totalDistance = path.reduce((sum, point, index) => {
    const next = path[(index + 1) % path.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
  const traveled =
    (((elapsedMs / 1000) * obstacle.speed + (obstacle.phase ?? 0)) %
      totalDistance) +
    totalDistance;
  let remainder = traveled % totalDistance;

  for (let index = 0; index < path.length; index += 1) {
    const from = path[index];
    const to = path[(index + 1) % path.length];
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (remainder <= segment) {
      const ratio = segment === 0 ? 0 : remainder / segment;
      return rectFromObstacle(obstacle, {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      });
    }
    remainder -= segment;
  }

  return rectFromObstacle(obstacle, path[0]);
}

function rectFromObstacle(
  obstacle: ParkourChallenge["obstacles"][number],
  position: Coord,
) {
  return {
    left: position.x,
    right: position.x + obstacle.size.width,
    top: position.y,
    bottom: position.y + obstacle.size.height,
  };
}

function intersects(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export function getObstacleRects(
  challenge: ParkourChallenge,
  elapsedMs: number,
) {
  return challenge.obstacles.map((obstacle) => getObstacleRect(obstacle, elapsedMs));
}

export function getPlayerRadius(): number {
  return PLAYER_RADIUS;
}

export function toSummaryForSync(
  completion: CompletionPayload,
  endingCount: number,
  existingBestEndingId?: string,
  nextLevel?: { id: string; title: string } | null,
): LevelSummary {
  return {
    levelId: completion.levelId,
    endingId: completion.endingId,
    endingLabel: completion.endingLabel,
    endingTier: completion.endingTier,
    outcomesUnlocked: completion.outcomesUnlocked,
    earned: completion.earned,
    totalsAfterRun: completion.earned,
    run: completion.run,
    progress: {
      status: completion.completesLevel ? "cleared" : "attempted",
      endingsSeen: 1,
      endingCount,
      bestEndingId: existingBestEndingId ?? completion.endingId,
      bestPathAchieved: existingBestEndingId === undefined,
    },
    nextLevel: nextLevel ?? null,
    completesLevel: completion.completesLevel,
    rank: completion.rank,
    at: completion.at,
  };
}
