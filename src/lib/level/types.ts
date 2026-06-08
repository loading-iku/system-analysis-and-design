export type UmlShape =
  | "start"
  | "action"
  | "decision"
  | "alert"
  | "end"
  | "merge";

export type GridDir = "up" | "down" | "left" | "right";

export type Coord = {
  x: number;
  y: number;
};

export type ToolboxBlock = {
  id: string;
  shape: UmlShape;
  label: string;
};

export type RewardBundle = {
  xp: number;
  coins: number;
};

export type GateAppendNode = {
  shape: UmlShape;
  label: string;
  branchGuard?: string;
};

export type LevelRouteKind =
  | "best"
  | "recovery"
  | "optional"
  | "failure"
  | "standard"
  | "secret"
  | "easy"
  | "bonus"
  | "pending";

export type LevelRoute = {
  id: string;
  label: string;
  kind: LevelRouteKind;
  gateIds: string[];
  endingId: string;
  summary: string;
  recommended: boolean;
  mode?: "edge" | "path";
};

export type CoinPickup = {
  id: string;
  x: number;
  y: number;
  value: number;
  routeId?: string;
};

export type LabyrinthBarrier = {
  id: string;
  cells: Coord[];
  opensWhenEndingUnlocked?: string;
};

export type LabyrinthRoom = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: string;
  gateId?: string;
  endingId?: string;
};

export type LabyrinthLink = {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  kind?: string;
  label?: string;
  points?: Coord[];
};

export type DiagramBranch = {
  guardLabel: string;
  nextStepId: string;
};

export type DiagramPlaceStep = {
  id: string;
  kind: "place";
  shape: UmlShape;
  expectedToolboxId: string;
  nodeLabel: string;
  hint: string;
  nextStepId?: string;
};

export type DiagramDecisionStep = {
  id: string;
  kind: "decision";
  shape: "decision";
  nodeLabel: string;
  hint: string;
  branches: DiagramBranch[];
};

export type DiagramPuzzleStep = DiagramPlaceStep | DiagramDecisionStep;

export type DiagramPuzzleJSON = {
  id: string;
  title: string;
  prompt: string;
  toolbox: ToolboxBlock[];
  rootStepId: string;
  steps: DiagramPuzzleStep[];
};

export type DiagramChallenge = {
  id: string;
  kind: "diagram";
  title: string;
  prompt: string;
  optional: boolean;
  rewards: RewardBundle;
  successText?: string;
  failureText?: string;
  successBranchGuards?: string[];
  puzzle: DiagramPuzzleJSON;
};

export type ParkourWaypoint = Coord;

export type ParkourObstacle = {
  id: string;
  origin: Coord;
  size: {
    width: number;
    height: number;
  };
  speed: number;
  waypoints: ParkourWaypoint[];
  phase?: number;
};

export type ParkourChallenge = {
  id: string;
  kind: "parkour";
  title: string;
  prompt: string;
  optional: boolean;
  rewards: RewardBundle;
  width: number;
  height: number;
  map: string[];
  start: Coord;
  goal: Coord;
  obstacles: ParkourObstacle[];
  successText?: string;
  failureText?: string;
};

export type LevelChallenge = DiagramChallenge | ParkourChallenge;

export type GateAppendMode = "enter" | "challengeSuccess";

export type LevelGate = {
  id: string;
  x: number;
  y: number;
  label: string;
  symbol?: string;
  kind?: string;
  summary?: string;
  appendOn: GateAppendMode;
  appendNodes: GateAppendNode[];
  challengeId?: string;
  grantsFlags?: string[];
  rewards: RewardBundle;
  optional: boolean;
  oneShot: boolean;
};

export type EndingTier =
  | "failure"
  | "recovery"
  | "standard"
  | "mastery"
  | "secret";

export type LevelEnding = {
  id: string;
  x: number;
  y: number;
  title: string;
  tier: EndingTier;
  summary: string;
  initiallyUnlocked: boolean;
  unlocksEndingIds: string[];
  requiresFlags?: string[];
  forbidFlags?: string[];
  rewards: RewardBundle;
  completesLevel: boolean;
  rank: number;
};

export type SuccessRateWeights = {
  gate: number;
  challenge: number;
  ending: number;
  failure: number;
};

export type LevelScoring = {
  gateBaseXp: number;
  gateBaseCoins: number;
  diagramSuccessXp: number;
  parkourSuccessXp: number;
  wrongDiagramPenalty: number;
  obstacleHitPenalty: number;
  optionalRouteBonus: number;
  successRateWeights: SuccessRateWeights;
};

export type LabyrinthLayout = {
  width: number;
  height: number;
  tileSize: number;
  start: Coord;
  revealRadius: number;
  map: string[];
  rooms?: LabyrinthRoom[];
  links?: LabyrinthLink[];
  barriers?: LabyrinthBarrier[];
};

export type LabyrinthLevelJSON = {
  schemaVersion: 2;
  engine: "labyrinth";
  id: string;
  title: string;
  scenario: string;
  objective: string;
  toolbox: ToolboxBlock[];
  labyrinth: LabyrinthLayout;
  gates: LevelGate[];
  challenges: LevelChallenge[];
  endings: LevelEnding[];
  routes: LevelRoute[];
  coinPickups: CoinPickup[];
  scoring: LevelScoring;
};

export type LevelJSON = LabyrinthLevelJSON;

export type LevelManifestEntry = {
  id: string;
  title: string;
  concept?: string;
  summary?: string;
  rewardPreview?: string;
  endingCount?: number;
};

export type PlacedNode = {
  id: string;
  shape: UmlShape;
  label: string;
  branchGuard?: string;
  dimmed?: boolean;
  sourceGateId?: string;
  sourceGateLabel?: string;
  sourceChallengeId?: string;
};

export type LevelRunStatus = "unplayed" | "attempted" | "cleared";

export type LevelRunRecord = {
  endingId: string;
  endingLabel: string;
  endingTier: EndingTier;
  elapsedMs: number;
  successRate: number;
  gatesCleared: number;
  challengesCompleted: number;
  mistakes: number;
  optionalRoutesCompleted: number;
  rewards: RewardBundle;
  rank: number;
  completesLevel: boolean;
  at: string;
};

export type LevelProgress = {
  status: LevelRunStatus;
  attempts: number;
  firstClearedAt?: string;
  lastPlayedAt?: string;
  seenEndingIds: string[];
  bestEndingId?: string;
  bestRun?: LevelRunRecord;
  lastRun?: LevelRunRecord;
  rewards: RewardBundle;
};

export type ProgressProfile = {
  version: 2;
  updatedAt: string;
  totals: RewardBundle;
  levels: Record<string, LevelProgress>;
};

export type LevelSummary = {
  levelId: string;
  endingId: string;
  endingLabel: string;
  endingTier: EndingTier;
  earned: RewardBundle;
  totalsAfterRun: RewardBundle;
  run: {
    elapsedMs: number;
    successRate: number;
    gatesCleared: number;
    challengesCompleted: number;
    mistakes: number;
    optionalRoutesCompleted: number;
  };
  progress: {
    status: LevelRunStatus;
    endingsSeen: number;
    endingCount: number;
    bestEndingId?: string;
    bestPathAchieved: boolean;
  };
  outcomesUnlocked: string[];
  nextLevel?: { id: string; title: string } | null;
  completesLevel: boolean;
  rank: number;
  at: string;
};
