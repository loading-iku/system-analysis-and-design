import type {
  CoinPickup,
  Coord,
  DiagramChallenge,
  DiagramPuzzleJSON,
  EndingTier,
  LabyrinthBarrier,
  LabyrinthLayout,
  LabyrinthLevelJSON,
  LabyrinthLink,
  LabyrinthRoom,
  LevelEnding,
  LevelGate,
  LevelRoute,
  LevelRouteKind,
  LevelScoring,
  ParkourChallenge,
  RewardBundle,
  ToolboxBlock,
} from "./types";
import { deriveEndingDoorBarriers } from "./barriers";

type RawGate = {
  id: string;
  label: string;
  symbol?: string;
  kind?: string;
  summary?: string;
  coord?: [number, number];
};

type RawEnding = {
  id: string;
  label: string;
  coord?: [number, number];
  kind?: string;
  outcome?: string;
  summary?: string;
  initiallyUnlocked?: boolean;
  unlocksEndingIds?: string[];
};

type RawDiagramChallenge = {
  id: string;
  title: string;
  summary: string;
  toolbox: ToolboxBlock[];
  rootStepId: string;
  steps: DiagramPuzzleJSON["steps"];
};

type RawRoute = {
  id: string;
  label?: string;
  choiceLabel?: string;
  routeType?: string;
  classification?: string;
  kind?: string;
  fromGateId?: string;
  toGateId?: string;
  toEndingId?: string;
  gateIds?: string[];
  endingId?: string;
  summary?: string;
  notes?: string;
};

type RawLevel = Record<string, unknown>;

type RawRoom = {
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

type RawLink = {
  id?: string;
  fromRoomId?: string;
  toRoomId?: string;
  from?: string;
  to?: string;
  kind?: string;
  label?: string;
  points?: Array<[number, number] | Coord>;
};

type RawBarrier = {
  id: string;
  cells: Array<[number, number] | Coord>;
  opensWhenEndingUnlocked?: string;
};

type CompiledLabyrinth = Pick<
  LabyrinthLayout,
  "width" | "height" | "start" | "map" | "rooms" | "links" | "barriers"
>;

const PLACE_ORDER_ENDING_IDS = new Set([
  "ending-empty-cart",
  "ending-session-expired",
  "ending-inventory-expired",
  "ending-address-abandoned",
  "ending-manual-review",
  "ending-payment-declined",
  "ending-gateway-timeout",
  "ending-3ds-abandoned",
  "ending-3ds-failed",
  "ending-order-standard",
  "ending-order-confirmed",
]);

const REGISTRATION_ROUTE_GATE_IDS: Record<string, string[]> = {
  "easy-route": ["gate-a"],
  "failure-route": ["gate-a", "gate-b", "gate-c", "gate-d"],
  "recovery-route": ["gate-a", "gate-b", "gate-c", "gate-g", "gate-h", "gate-k"],
  "bonus-route": ["gate-a", "gate-b", "gate-c", "gate-g", "gate-i", "gate-j"],
  "best-route": ["gate-a", "gate-b", "gate-c", "gate-g", "gate-i"],
};

export function normalizeLevel(raw: RawLevel): LabyrinthLevelJSON {
  switch (raw.id) {
    case "place-order":
      return normalizePlaceOrder(raw);
    case "user-login":
      return normalizeUserLogin(raw);
    case "user-registration":
      return normalizeUserRegistration(raw);
    default:
      throw new Error(`Unknown level "${String(raw.id)}".`);
  }
}

function normalizePlaceOrder(raw: RawLevel): LabyrinthLevelJSON {
  const labyrinth = raw.labyrinth as Record<string, unknown>;
  const compiledLabyrinth = compileLabyrinth(labyrinth);
  const gateLookup = mapRawGates(
    applyRoomCoordsToGates(
      (labyrinth.gates as RawGate[]) ?? [],
      compiledLabyrinth.rooms ?? [],
    ),
  );
  const endingLookup = mapRawEndings(
    applyRoomCoordsToEndings(
      (raw.endings as RawEnding[] | undefined) ?? [],
      compiledLabyrinth.rooms ?? [],
    ),
  );
  const rawChallenge = ((raw.diagramChallenges as RawDiagramChallenge[] | undefined) ??
    [])[0];

  return withCoinPickups({
    schemaVersion: 2,
    engine: "labyrinth",
    id: mustString(raw.id),
    title: mustString(raw.title),
    scenario: mustString(raw.scenario),
    objective: mustString(raw.objective),
    toolbox: raw.toolbox as ToolboxBlock[],
    labyrinth: {
      width: compiledLabyrinth.width,
      height: compiledLabyrinth.height,
      tileSize: 44,
      start: compiledLabyrinth.start,
      revealRadius: 2.4,
      map: compiledLabyrinth.map,
      rooms: compiledLabyrinth.rooms,
      links: compiledLabyrinth.links,
      barriers: compiledLabyrinth.barriers,
    },
    gates: [
      gateFromLookup(gateLookup, "gate-cart-snapshot", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Check cart" }],
        rewards: reward(18, 4),
        grantsFlags: ["cartSnapshot"],
      }),
      gateFromLookup(gateLookup, "gate-promo-cache", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Check discount" }],
        rewards: reward(12, 8),
        grantsFlags: ["promoChecked"],
        optional: true,
      }),
      gateFromLookup(gateLookup, "gate-inventory-reserve", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Check stock" }],
        rewards: reward(22, 5),
        grantsFlags: ["inventoryReserved"],
      }),
      gateFromLookup(gateLookup, "gate-address-verify", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Check address" }],
        rewards: reward(18, 4),
        grantsFlags: ["addressVerified"],
      }),
      gateFromLookup(gateLookup, "gate-address-repair", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Fix address" }],
        rewards: reward(12, 6),
        grantsFlags: ["addressRecovered"],
        optional: true,
      }),
      gateFromLookup(gateLookup, "gate-risk-scan", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Risk OK?" }],
        rewards: reward(22, 7),
        grantsFlags: ["riskScanned"],
      }),
      gateFromLookup(gateLookup, "gate-payment-auth", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Payment OK?" }],
        rewards: reward(22, 10),
        grantsFlags: ["paymentAuthReached"],
      }),
      gateFromLookup(gateLookup, "gate-retry-window", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Try payment again" }],
        rewards: reward(10, 4),
        grantsFlags: ["retryWindowUsed"],
        optional: true,
      }),
      gateFromLookup(gateLookup, "gate-three-d-secure", {
        appendOn: "challengeSuccess",
        appendNodes: [
          {
            shape: "action",
            label: "Pass bank check",
            branchGuard: "Passed",
          },
        ],
        challengeId: "challenge-3ds",
        rewards: reward(26, 18),
        grantsFlags: ["threeDSPassed"],
        optional: true,
        oneShot: false,
      }),
      gateFromLookup(gateLookup, "gate-fulfillment-write", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Save order" }],
        rewards: reward(26, 20),
        grantsFlags: ["orderWritten"],
      }),
    ],
    challenges: rawChallenge ? [normalizePlaceOrderDiagram(rawChallenge)] : [],
    endings: [
      endingFromLookup(endingLookup, "ending-empty-cart", "failure", reward(10, 0), false, 90, {
        requiresFlags: ["cartSnapshot"],
        forbidFlags: ["inventoryReserved"],
      }),
      endingFromLookup(endingLookup, "ending-session-expired", "failure", reward(10, 0), false, 86, {
        requiresFlags: ["promoChecked"],
        forbidFlags: ["inventoryReserved"],
      }),
      endingFromLookup(endingLookup, "ending-inventory-expired", "failure", reward(14, 2), false, 84, {
        requiresFlags: ["inventoryReserved"],
        forbidFlags: ["addressVerified"],
      }),
      endingFromLookup(endingLookup, "ending-address-abandoned", "failure", reward(16, 2), false, 82, {
        requiresFlags: ["addressRecovered"],
        forbidFlags: ["riskScanned"],
      }),
      endingFromLookup(endingLookup, "ending-manual-review", "failure", reward(28, 8), false, 70, {
        requiresFlags: ["riskScanned"],
        forbidFlags: ["paymentAuthReached"],
      }),
      endingFromLookup(endingLookup, "ending-payment-declined", "failure", reward(18, 4), false, 75, {
        requiresFlags: ["paymentAuthReached"],
        forbidFlags: ["retryWindowUsed", "threeDSPassed", "orderWritten"],
      }),
      endingFromLookup(endingLookup, "ending-gateway-timeout", "recovery", reward(24, 6), false, 65, {
        requiresFlags: ["retryWindowUsed"],
        forbidFlags: ["orderWritten", "threeDSPassed"],
      }),
      endingFromLookup(endingLookup, "ending-3ds-abandoned", "failure", reward(16, 2), false, 74, {
        requiresFlags: ["paymentAuthReached"],
        forbidFlags: ["threeDSPassed", "orderWritten"],
      }),
      endingFromLookup(endingLookup, "ending-3ds-failed", "failure", reward(16, 2), false, 72, {
        requiresFlags: ["paymentAuthReached"],
        forbidFlags: ["threeDSPassed", "orderWritten"],
      }),
      endingFromLookup(endingLookup, "ending-order-standard", "standard", reward(40, 18), true, 40, {
        requiresFlags: ["orderWritten"],
        forbidFlags: ["threeDSPassed"],
      }),
      endingFromLookup(endingLookup, "ending-order-confirmed", "mastery", reward(70, 35), true, 10, {
        requiresFlags: ["orderWritten", "threeDSPassed"],
      }),
    ],
    routes: normalizePlaceOrderRoutes(
      (raw.routes as RawRoute[] | undefined) ?? [],
      Object.keys(gateLookup),
      PLACE_ORDER_ENDING_IDS,
    ),
    scoring: scoring({
      optionalRouteBonus: 10,
      diagramSuccessXp: 26,
      parkourSuccessXp: 0,
    }),
  });
}

function normalizeUserLogin(raw: RawLevel): LabyrinthLevelJSON {
  const labyrinth = raw.labyrinth as Record<string, unknown>;
  const compiledLabyrinth = compileLabyrinth(labyrinth);
  const gateLookup = mapRawGates(
    applyRoomCoordsToGates(
      (raw.gates as RawGate[]) ?? [],
      compiledLabyrinth.rooms ?? [],
    ),
  );
  const endingLookup = mapRawEndings(
    applyRoomCoordsToEndings(
      (raw.endings as RawEnding[]) ?? [],
      compiledLabyrinth.rooms ?? [],
    ),
  );

  return withCoinPickups({
    schemaVersion: 2,
    engine: "labyrinth",
    id: mustString(raw.id),
    title: mustString(raw.title),
    scenario: mustString(raw.scenario),
    objective: mustString(raw.objective),
    toolbox: raw.toolbox as ToolboxBlock[],
    labyrinth: {
      width: compiledLabyrinth.width,
      height: compiledLabyrinth.height,
      tileSize: 44,
      start: compiledLabyrinth.start,
      revealRadius: 2.5,
      map: compiledLabyrinth.map,
      rooms: compiledLabyrinth.rooms,
      links: compiledLabyrinth.links,
      barriers: compiledLabyrinth.barriers,
    },
    gates: [
      gateFromLookup(gateLookup, "entry-lobby", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Start login" }],
        rewards: reward(10, 2),
        grantsFlags: ["entryOpened"],
      }),
      gateFromLookup(gateLookup, "format-scanner", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Check format" }],
        rewards: reward(18, 4),
        grantsFlags: ["formatScanned"],
      }),
      gateFromLookup(gateLookup, "directory-turnstile", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Find account" }],
        rewards: reward(20, 5),
        grantsFlags: ["directoryLoaded"],
      }),
      gateFromLookup(gateLookup, "help-kiosk", {
        appendOn: "enter",
        appendNodes: [{ shape: "alert", label: "Show guest view" }],
        rewards: reward(10, 6),
        grantsFlags: ["guestPreviewGranted"],
        optional: true,
      }),
      gateFromLookup(gateLookup, "recovery-desk", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Reset password" }],
        rewards: reward(14, 4),
        grantsFlags: ["recoveryStarted"],
      }),
      gateFromLookup(gateLookup, "password-vault", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Password OK?" }],
        rewards: reward(20, 6),
        grantsFlags: ["passwordChecked"],
      }),
      gateFromLookup(gateLookup, "bot-defense-yard", {
        appendOn: "challengeSuccess",
        appendNodes: [{ shape: "action", label: "Pass bot check" }],
        challengeId: "rate-limit-parkour",
        rewards: reward(18, 10),
        grantsFlags: ["botDefensePassed"],
        optional: true,
        oneShot: false,
      }),
      gateFromLookup(gateLookup, "audit-balcony", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Check logs" }],
        rewards: reward(8, 3),
        grantsFlags: ["auditReviewed"],
        optional: true,
      }),
      gateFromLookup(gateLookup, "maintenance-duct", {
        appendOn: "enter",
        appendNodes: [{ shape: "alert", label: "Find hidden ops" }],
        rewards: reward(12, 8),
        grantsFlags: ["shadowOpsUnlocked"],
        optional: true,
      }),
      gateFromLookup(gateLookup, "trusted-device-bridge", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Trust device" }],
        rewards: reward(16, 5),
        grantsFlags: ["trustedDeviceCleared"],
      }),
      gateFromLookup(gateLookup, "otp-tower", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Check 2FA code" }],
        rewards: reward(20, 8),
        grantsFlags: ["otpCleared"],
      }),
      gateFromLookup(gateLookup, "yield-yard", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Return from reset" }],
        rewards: reward(12, 4),
        grantsFlags: ["recoveryMerged"],
      }),
      gateFromLookup(gateLookup, "session-foundry", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Create session" }],
        rewards: reward(24, 12),
        grantsFlags: ["sessionMinted"],
      }),
    ],
    challenges: [buildLoginParkourChallenge()],
    endings: [
      endingFromLookup(endingLookup, "guest-preview", "standard", reward(24, 10), true, 45, {
        requiresFlags: ["guestPreviewGranted"],
        forbidFlags: ["sessionMinted"],
      }),
      endingFromLookup(endingLookup, "secure-dashboard", "mastery", reward(72, 34), true, 10, {
        requiresFlags: ["sessionMinted", "otpCleared", "botDefensePassed"],
      }),
      endingFromLookup(endingLookup, "account-locked", "failure", reward(16, 0), false, 85, {
        requiresFlags: ["passwordChecked"],
        forbidFlags: ["botDefensePassed", "recoveryStarted"],
      }),
      endingFromLookup(endingLookup, "rate-limit-timeout", "failure", reward(18, 2), false, 80, {
        requiresFlags: ["passwordChecked"],
        forbidFlags: ["botDefensePassed", "sessionMinted"],
      }),
      endingFromLookup(endingLookup, "recovery-complete", "recovery", reward(36, 12), true, 35, {
        requiresFlags: ["recoveryStarted", "recoveryMerged"],
      }),
      endingFromLookup(endingLookup, "shadow-ops-room", "secret", reward(50, 22), true, 25, {
        requiresFlags: ["shadowOpsUnlocked"],
      }),
    ],
    routes: normalizeRouteList(
      (raw.routes as RawRoute[] | undefined) ?? [],
      mustString(raw.recommendedRouteId ?? "best-2fa-route"),
    ),
    scoring: scoring({
      optionalRouteBonus: 8,
      parkourSuccessXp: 28,
    }),
  });
}

function normalizeUserRegistration(raw: RawLevel): LabyrinthLevelJSON {
  const labyrinth = raw.labyrinth as Record<string, unknown>;
  const compiledLabyrinth = compileLabyrinth(labyrinth);
  const gateLookup = mapRawGates(
    applyRoomCoordsToGates(
      (labyrinth.gates as RawGate[]) ?? [],
      compiledLabyrinth.rooms ?? [],
    ),
  );
  const endingLookup = mapRawEndings(
    applyRoomCoordsToEndings(
      (labyrinth.endings as RawEnding[]) ?? [],
      compiledLabyrinth.rooms ?? [],
    ),
  );

  return withCoinPickups({
    schemaVersion: 2,
    engine: "labyrinth",
    id: mustString(raw.id),
    title: mustString(raw.title),
    scenario: mustString(raw.scenario),
    objective: mustString(raw.objective),
    toolbox: raw.toolbox as ToolboxBlock[],
    labyrinth: {
      width: compiledLabyrinth.width,
      height: compiledLabyrinth.height,
      tileSize: 44,
      start: compiledLabyrinth.start,
      revealRadius: 2.4,
      map: compiledLabyrinth.map,
      rooms: compiledLabyrinth.rooms,
      links: compiledLabyrinth.links,
      barriers: compiledLabyrinth.barriers,
    },
    gates: [
      gateFromLookup(gateLookup, "gate-a", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Form complete?" }],
        rewards: reward(16, 2),
        grantsFlags: ["intakeReviewed"],
      }),
      gateFromLookup(gateLookup, "gate-b", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Email OK?" }],
        rewards: reward(16, 3),
        grantsFlags: ["syntaxChecked"],
      }),
      gateFromLookup(gateLookup, "gate-c", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Already signed up?" }],
        rewards: reward(20, 4),
        grantsFlags: ["directoryChecked"],
      }),
      gateFromLookup(gateLookup, "gate-d", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Use login?" }],
        rewards: reward(14, 3),
        grantsFlags: ["duplicateStateChecked"],
      }),
      gateFromLookup(gateLookup, "gate-e", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Offer email help" }],
        rewards: reward(12, 3),
        grantsFlags: ["recoveryOffered"],
      }),
      gateFromLookup(gateLookup, "gate-f", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Email sent?" }],
        rewards: reward(14, 4),
        grantsFlags: ["recoveryEmailQueued"],
      }),
      gateFromLookup(gateLookup, "gate-g", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Password strong?" }],
        rewards: reward(18, 4),
        grantsFlags: ["passwordScored"],
      }),
      gateFromLookup(gateLookup, "gate-h", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Try password again" }],
        rewards: reward(12, 3),
        grantsFlags: ["passwordRetryStarted"],
      }),
      gateFromLookup(gateLookup, "gate-i", {
        appendOn: "challengeSuccess",
        appendNodes: [{ shape: "action", label: "Verify account" }],
        challengeId: "challenge-registration-verify",
        rewards: reward(24, 14),
        grantsFlags: ["accountVerified"],
        optional: true,
        oneShot: false,
      }),
      gateFromLookup(gateLookup, "gate-j", {
        appendOn: "enter",
        appendNodes: [{ shape: "action", label: "Welcome steps" }],
        rewards: reward(14, 8),
        grantsFlags: ["bonusProfile"],
        optional: true,
      }),
      gateFromLookup(gateLookup, "gate-k", {
        appendOn: "enter",
        appendNodes: [{ shape: "decision", label: "Retry email opened?" }],
        rewards: reward(18, 5),
        grantsFlags: ["retryVerificationStarted"],
      }),
    ],
    challenges: [buildRegistrationDiagramChallenge(raw.toolbox as ToolboxBlock[])],
    endings: [
      endingFromLookup(endingLookup, "missing-fields", "failure", reward(8, 0), false, 90, {
        requiresFlags: ["intakeReviewed"],
        forbidFlags: ["syntaxChecked"],
      }),
      endingFromLookup(endingLookup, "invalid-email", "failure", reward(10, 0), false, 88, {
        requiresFlags: ["syntaxChecked"],
        forbidFlags: ["directoryChecked"],
      }),
      endingFromLookup(endingLookup, "use-login", "failure", reward(14, 0), false, 82, {
        requiresFlags: ["duplicateStateChecked"],
        forbidFlags: ["recoveryOffered"],
      }),
      endingFromLookup(endingLookup, "exit-unverified", "recovery", reward(18, 4), false, 70, {
        requiresFlags: ["recoveryOffered"],
        forbidFlags: ["recoveryEmailQueued"],
      }),
      endingFromLookup(endingLookup, "bounce-recovery-email", "failure", reward(12, 1), false, 76, {
        requiresFlags: ["recoveryEmailQueued"],
      }),
      endingFromLookup(endingLookup, "pending-after-resend", "recovery", reward(26, 6), true, 48, {
        requiresFlags: ["recoveryEmailQueued"],
        forbidFlags: ["accountVerified"],
      }),
      endingFromLookup(endingLookup, "weak-password-quit", "failure", reward(14, 1), false, 78, {
        requiresFlags: ["passwordRetryStarted"],
        forbidFlags: ["retryVerificationStarted"],
      }),
      endingFromLookup(endingLookup, "pending-first-verification", "standard", reward(30, 8), true, 42, {
        requiresFlags: ["passwordScored"],
        forbidFlags: ["accountVerified"],
      }),
      endingFromLookup(endingLookup, "verified-account", "mastery", reward(64, 28), true, 10, {
        requiresFlags: ["accountVerified"],
        forbidFlags: ["bonusProfile"],
      }),
      endingFromLookup(endingLookup, "verified-bonus", "secret", reward(80, 38), true, 6, {
        requiresFlags: ["accountVerified", "bonusProfile"],
      }),
      endingFromLookup(endingLookup, "pending-after-password-retry", "recovery", reward(34, 10), true, 30, {
        requiresFlags: ["retryVerificationStarted"],
        forbidFlags: ["accountVerified"],
      }),
      endingFromLookup(endingLookup, "verified-after-password-retry", "recovery", reward(54, 22), true, 18, {
        requiresFlags: ["retryVerificationStarted"],
      }),
    ],
    routes: normalizeRegistrationRoutes(
      (raw.routes as RawRoute[] | undefined) ?? [],
      mustString(raw.bestEndingId ?? "verified-account"),
    ),
    scoring: scoring({
      optionalRouteBonus: 9,
      diagramSuccessXp: 24,
    }),
  });
}

function normalizePlaceOrderDiagram(raw: RawDiagramChallenge): DiagramChallenge {
  return {
    id: raw.id,
    kind: "diagram",
    title: raw.title,
    prompt: raw.summary,
    optional: true,
    rewards: reward(32, 20),
    successText: "Bank check passed. The best checkout path is open.",
    failureText: "Pick the passed bank-check branch for the best path.",
    successBranchGuards: ["Passed"],
    puzzle: {
      id: raw.id,
      title: raw.title,
      prompt: raw.summary,
      toolbox: raw.toolbox,
      rootStepId: raw.rootStepId,
      steps: raw.steps,
    },
  };
}

function buildLoginParkourChallenge(): ParkourChallenge {
  return {
    id: "rate-limit-parkour",
    kind: "parkour",
    title: "Bot Check Run",
    prompt: "Move past the blocks and reach the safe tile.",
    optional: true,
    rewards: reward(28, 16),
    width: 11,
    height: 7,
    map: [
      "###########",
      "#.........#",
      "#.###.###.#",
      "#.....#...#",
      "#.###.#.#.#",
      "#.....#...#",
      "###########",
    ],
    start: { x: 1, y: 1 },
    goal: { x: 9, y: 5 },
    obstacles: [
      {
        id: "captcha-crate",
        origin: { x: 3, y: 1 },
        size: { width: 0.8, height: 0.8 },
        speed: 1.4,
        waypoints: [
          { x: 3, y: 1 },
          { x: 3, y: 4 },
        ],
      },
      {
        id: "cooldown-laser",
        origin: { x: 6, y: 3 },
        size: { width: 0.8, height: 0.8 },
        speed: 1.8,
        phase: 1.2,
        waypoints: [
          { x: 6, y: 3 },
          { x: 8, y: 3 },
        ],
      },
      {
        id: "trust-drift",
        origin: { x: 8, y: 5 },
        size: { width: 0.8, height: 0.8 },
        speed: 1.1,
        phase: 0.8,
        waypoints: [
          { x: 8, y: 1 },
          { x: 8, y: 5 },
        ],
      },
    ],
    successText: "Bot check passed. The secure route is open.",
    failureText: "Hit detected. Try the run again.",
  };
}

function buildRegistrationDiagramChallenge(
  toolbox: ToolboxBlock[],
): DiagramChallenge {
  return {
    id: "challenge-registration-verify",
    kind: "diagram",
    title: "Email Check",
    prompt:
      "Build the simple path: send email, check if it opens, then activate the account.",
    optional: true,
    rewards: reward(24, 14),
    successText: "Email verified. The account-ready path is open.",
    failureText: "Use the opened email branch to activate the account.",
    successBranchGuards: ["Opened"],
    puzzle: {
      id: "challenge-registration-verify",
      title: "Email Check",
      prompt:
        "Build the simple path: send email, check if it opens, then activate the account.",
      toolbox,
      rootStepId: "rv-1",
      steps: [
        {
          id: "rv-1",
          kind: "place",
          shape: "start",
          expectedToolboxId: "_auto_start",
          nodeLabel: "Start email check",
          hint: "Start with the first node.",
          nextStepId: "rv-2",
        },
        {
          id: "rv-2",
          kind: "place",
          shape: "action",
          expectedToolboxId: "A",
          nodeLabel: "Send email",
          hint: "Sending the email is an action.",
          nextStepId: "rv-3",
        },
        {
          id: "rv-3",
          kind: "decision",
          shape: "decision",
          nodeLabel: "Email opened?",
          hint: "This splits the path.",
          branches: [
            {
              guardLabel: "Not opened",
              nextStepId: "rv-4a",
            },
            {
              guardLabel: "Opened",
              nextStepId: "rv-4b",
            },
          ],
        },
        {
          id: "rv-4a",
          kind: "place",
          shape: "alert",
          expectedToolboxId: "C",
          nodeLabel: "Keep pending",
          hint: "No email click means the account waits.",
          nextStepId: "rv-4a-end",
        },
        {
          id: "rv-4a-end",
          kind: "place",
          shape: "end",
          expectedToolboxId: "_auto_end",
          nodeLabel: "Pending account",
          hint: "This branch ends pending.",
        },
        {
          id: "rv-4b",
          kind: "place",
          shape: "action",
          expectedToolboxId: "A",
          nodeLabel: "Activate account",
          hint: "A verified email activates the account.",
          nextStepId: "rv-4b-end",
        },
        {
          id: "rv-4b-end",
          kind: "place",
          shape: "end",
          expectedToolboxId: "_auto_end",
          nodeLabel: "Account ready",
          hint: "The good branch also has an end.",
        },
      ],
    },
  };
}

function normalizePlaceOrderRoutes(
  routes: RawRoute[],
  gateIds: string[],
  endingIds: Set<string>,
): LevelRoute[] {
  const knownGates = new Set(gateIds);
  return routes
    .map((route) => {
      const fromGateId = route.fromGateId;
      if (!fromGateId || !knownGates.has(fromGateId)) return null;

      const nextGateId =
        route.toGateId && knownGates.has(route.toGateId) ? route.toGateId : null;
      const endingId =
        route.toEndingId && endingIds.has(route.toEndingId)
          ? route.toEndingId
          : null;

      if (!nextGateId && !endingId) return null;

      return routeFromParts(route, {
        label: route.choiceLabel ?? route.label ?? route.id,
        kind: normalizeRouteKind(route.routeType),
        gateIds: nextGateId ? [fromGateId, nextGateId] : [fromGateId],
        endingId: endingId ?? "ending-order-confirmed",
        recommended: route.routeType === "best",
        mode: "edge",
      });
    })
    .filter((route): route is LevelRoute => Boolean(route));
}

function normalizeRouteList(
  routes: RawRoute[],
  recommendedRouteId: string,
): LevelRoute[] {
  return routes.map((route) =>
    routeFromParts(route, {
      label: route.label ?? route.choiceLabel ?? route.id,
      kind: normalizeRouteKind(route.classification ?? route.kind ?? route.routeType),
      gateIds: route.gateIds ?? [],
      endingId: route.endingId ?? route.toEndingId ?? "",
      recommended: route.id === recommendedRouteId,
      mode: "path",
    }),
  );
}

function normalizeRegistrationRoutes(
  routes: RawRoute[],
  bestEndingId: string,
): LevelRoute[] {
  return routes.map((route) =>
    routeFromParts(route, {
      label: route.label ?? route.choiceLabel ?? route.id,
      kind: normalizeRouteKind(route.kind ?? route.classification ?? route.routeType),
      gateIds: route.gateIds ?? REGISTRATION_ROUTE_GATE_IDS[route.id] ?? [],
      endingId: route.endingId ?? route.toEndingId ?? "",
      recommended: route.endingId === bestEndingId || route.id === "best-route",
      mode: "path",
    }),
  );
}

function routeFromParts(
  route: RawRoute,
  config: {
    label: string;
    kind: LevelRouteKind;
    gateIds: string[];
    endingId: string;
    recommended: boolean;
    mode?: LevelRoute["mode"];
  },
): LevelRoute {
  return {
    id: route.id,
    label: config.label,
    kind: config.kind,
    gateIds: config.gateIds,
    endingId: config.endingId,
    summary: route.summary ?? route.notes ?? config.label,
    recommended: config.recommended,
    mode: config.mode,
  };
}

function normalizeRouteKind(value: unknown): LevelRouteKind {
  switch (value) {
    case "best":
    case "recovery":
    case "optional":
    case "failure":
    case "standard":
    case "secret":
    case "easy":
    case "bonus":
    case "pending":
      return value;
    case "success":
      return "standard";
    default:
      return "standard";
  }
}

function withCoinPickups(
  level: Omit<LabyrinthLevelJSON, "coinPickups">,
): LabyrinthLevelJSON {
  return {
    ...level,
    coinPickups: buildCoinPickups(level),
  };
}

function buildCoinPickups(
  level: Omit<LabyrinthLevelJSON, "coinPickups">,
): CoinPickup[] {
  const reserved = new Set<string>();
  reserved.add(cellKey(level.labyrinth.start.x, level.labyrinth.start.y));
  level.gates.forEach((gate) => reserved.add(cellKey(gate.x, gate.y)));
  level.endings.forEach((ending) => reserved.add(cellKey(ending.x, ending.y)));
  level.labyrinth.rooms?.forEach((room) => {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        reserved.add(cellKey(x, y));
      }
    }
  });

  const candidates: Coord[] = [];
  level.labyrinth.map.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "#") continue;
      if (reserved.has(cellKey(x, y))) continue;
      candidates.push({ x, y });
    }
  });

  const maxCoins = Math.min(18, Math.max(10, Math.floor(candidates.length / 8)));
  const stride = Math.max(1, Math.floor(candidates.length / maxCoins));
  const offset = level.id.length % stride;

  return candidates
    .filter((_, index) => index % stride === offset)
    .slice(0, maxCoins)
    .map((coord, index) => ({
      id: `${level.id}-coin-${index + 1}`,
      x: coord.x,
      y: coord.y,
      value: 1,
    }));
}

function gateFromLookup(
  lookup: Record<string, RawGate>,
  id: string,
  config: Omit<
    LevelGate,
    "id" | "x" | "y" | "label" | "optional" | "oneShot"
  > & {
    optional?: boolean;
    oneShot?: boolean;
  },
): LevelGate {
  const gate = lookup[id];
  if (!gate?.coord) {
    throw new Error(`Missing gate "${id}" coordinates in authored level data.`);
  }
  return {
    id,
    x: gate.coord[0],
    y: gate.coord[1],
    label: gate.label,
    symbol: gate.symbol,
    kind: gate.kind,
    summary: gate.summary,
    appendOn: config.appendOn,
    appendNodes: config.appendNodes,
    challengeId: config.challengeId,
    grantsFlags: config.grantsFlags,
    rewards: config.rewards,
    optional: config.optional ?? false,
    oneShot: config.oneShot ?? true,
  };
}

function endingFromLookup(
  lookup: Record<string, RawEnding>,
  id: string,
  tier: EndingTier,
  rewards: RewardBundle,
  completesLevel: boolean,
  rank: number,
  extra: Pick<LevelEnding, "requiresFlags" | "forbidFlags">,
): LevelEnding {
  const ending = lookup[id];
  if (!ending?.coord) {
    throw new Error(`Missing ending "${id}" coordinates in authored level data.`);
  }

  return {
    id,
    x: ending.coord[0],
    y: ending.coord[1],
    title: ending.label,
    tier,
    summary: ending.summary ?? ending.outcome ?? ending.label,
    initiallyUnlocked: ending.initiallyUnlocked === true,
    unlocksEndingIds: ending.unlocksEndingIds ?? [],
    requiresFlags: extra.requiresFlags,
    forbidFlags: extra.forbidFlags,
    rewards,
    completesLevel,
    rank,
  };
}

function reward(xp: number, coins: number): RewardBundle {
  return { xp, coins };
}

function scoring(
  overrides: Partial<LevelScoring>,
): LevelScoring {
  return {
    gateBaseXp: 4,
    gateBaseCoins: 1,
    diagramSuccessXp: 18,
    parkourSuccessXp: 18,
    wrongDiagramPenalty: 6,
    obstacleHitPenalty: 4,
    optionalRouteBonus: 6,
    successRateWeights: {
      gate: 1,
      challenge: 2,
      ending: 2,
      failure: 1,
    },
    ...overrides,
  };
}

function compileLabyrinth(labyrinth: Record<string, unknown>): CompiledLabyrinth {
  const rooms = normalizeRooms(labyrinth.rooms);
  const authoredBarriers = normalizeBarriers(labyrinth.barriers);
  if (rooms.length === 0) {
    return {
      width: mustNumber(labyrinth.width),
      height: mustNumber(labyrinth.height),
      start: tupleCoord(labyrinth.start),
      map: rowsFromLabyrinth(labyrinth),
      barriers: authoredBarriers,
    };
  }

  const width = mustNumber(labyrinth.width);
  const height = mustNumber(labyrinth.height);
  const links = normalizeLinks(labyrinth.links, rooms);
  const map = compileRoomMap(width, height, rooms, links);
  const derivedBarriers = deriveEndingDoorBarriers(rooms, links);
  if (derivedBarriers.errors.length > 0) {
    throw new Error(derivedBarriers.errors.join("\n"));
  }
  const start = tupleCoord(
    labyrinth.start ?? roomCenter(rooms.find((room) => room.kind === "start") ?? rooms[0]),
  );

  return {
    width,
    height,
      start,
      map,
      rooms,
      links,
      barriers: [...authoredBarriers, ...derivedBarriers.barriers],
  };
}

function normalizeRooms(value: unknown): LabyrinthRoom[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const room = entry as RawRoom;
    return {
      id: mustString(room.id),
      label: mustString(room.label),
      x: mustNumber(room.x),
      y: mustNumber(room.y),
      width: mustNumber(room.width),
      height: mustNumber(room.height),
      kind: room.kind,
      gateId: room.gateId,
      endingId: room.endingId,
    };
  });
}

function normalizeLinks(value: unknown, rooms: LabyrinthRoom[]): LabyrinthLink[] {
  if (!Array.isArray(value)) return [];

  const roomIds = new Set(rooms.map((room) => room.id));
  return value.map((entry, index) => {
    const link = entry as RawLink;
    const fromRoomId = link.fromRoomId ?? link.from;
    const toRoomId = link.toRoomId ?? link.to;
    if (!fromRoomId || !roomIds.has(fromRoomId)) {
      throw new Error(`Room link ${index} references a missing fromRoomId.`);
    }
    if (!toRoomId || !roomIds.has(toRoomId)) {
      throw new Error(`Room link ${index} references a missing toRoomId.`);
    }

    return {
      id: link.id ?? `${fromRoomId}-${toRoomId}`,
      fromRoomId,
      toRoomId,
      kind: link.kind,
      label: link.label,
      points: link.points?.map(pointCoord),
    };
  });
}

function normalizeBarriers(value: unknown): LabyrinthBarrier[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry, index) => {
    const barrier = entry as RawBarrier;
    if (
      !barrier ||
      typeof barrier !== "object" ||
      typeof barrier.id !== "string" ||
      barrier.id.length === 0
    ) {
      throw new Error(`Barrier ${index} must declare a non-empty string id.`);
    }

    if (!Array.isArray(barrier.cells) || barrier.cells.length === 0) {
      throw new Error(`Barrier "${barrier.id}" must declare at least one cell.`);
    }

    return {
      id: barrier.id,
      cells: barrier.cells.map(pointCoord),
      opensWhenEndingUnlocked: barrier.opensWhenEndingUnlocked,
    };
  });
}

function compileRoomMap(
  width: number,
  height: number,
  rooms: LabyrinthRoom[],
  links: LabyrinthLink[],
): string[] {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("#"));
  const roomsById = new Map(rooms.map((room) => [room.id, room]));

  const carve = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[y][x] = ".";
    }
  };

  rooms.forEach((room) => {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        carve(x, y);
      }
    }
  });

  links.forEach((link) => {
    const from = roomsById.get(link.fromRoomId);
    const to = roomsById.get(link.toRoomId);
    if (!from || !to) return;

    const points = [
      roomCenter(from),
      ...(link.points ?? []),
      roomCenter(to),
    ];

    for (let index = 0; index < points.length - 1; index += 1) {
      carveSegment(points[index], points[index + 1], carve);
    }
  });

  return grid.map((row) => row.join(""));
}

function carveSegment(
  from: Coord,
  to: Coord,
  carve: (x: number, y: number) => void,
) {
  let x = from.x;
  let y = from.y;
  carve(x, y);

  while (x !== to.x) {
    x += Math.sign(to.x - x);
    carve(x, y);
  }

  while (y !== to.y) {
    y += Math.sign(to.y - y);
    carve(x, y);
  }
}

function applyRoomCoordsToGates(
  gates: RawGate[],
  rooms: LabyrinthRoom[],
): RawGate[] {
  const gateRooms = new Map(
    rooms
      .filter((room) => room.gateId)
      .map((room) => [room.gateId!, room]),
  );

  return gates.map((gate) => {
    const room = gateRooms.get(gate.id);
    if (!room) return gate;
    const center = roomCenter(room);
    return {
      ...gate,
      coord: [center.x, center.y],
    };
  });
}

function applyRoomCoordsToEndings(
  endings: RawEnding[],
  rooms: LabyrinthRoom[],
): RawEnding[] {
  const endingRooms = new Map(
    rooms
      .filter((room) => room.endingId)
      .map((room) => [room.endingId!, room]),
  );

  return endings.map((ending) => {
    const room = endingRooms.get(ending.id);
    if (!room) return ending;
    const center = roomCenter(room);
    return {
      ...ending,
      coord: [center.x, center.y],
    };
  });
}

function roomCenter(room: LabyrinthRoom): Coord {
  return {
    x: room.x + Math.floor(room.width / 2),
    y: room.y + Math.floor(room.height / 2),
  };
}

function pointCoord(value: [number, number] | Coord): Coord {
  if (Array.isArray(value)) return { x: value[0], y: value[1] };
  return value;
}

function mapRawGates(gates: RawGate[]): Record<string, RawGate> {
  return Object.fromEntries(gates.map((gate) => [gate.id, gate]));
}

function mapRawEndings(endings: RawEnding[]): Record<string, RawEnding> {
  return Object.fromEntries(endings.map((ending) => [ending.id, ending]));
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function rowsFromLabyrinth(labyrinth: Record<string, unknown>): string[] {
  const rows =
    (labyrinth.map as string[] | undefined) ??
    (labyrinth.rows as string[] | undefined) ??
    (labyrinth.grid as string[] | undefined) ??
    (labyrinth.layout as string[] | undefined);
  if (!rows) {
    throw new Error("Authored level labyrinth is missing a map/rows/grid/layout array.");
  }
  return rows;
}

function tupleCoord(value: unknown): Coord {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return { x: value[0], y: value[1] };
  }
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Coord).x === "number" &&
    typeof (value as Coord).y === "number"
  ) {
    return { x: (value as Coord).x, y: (value as Coord).y };
  }
  throw new Error("Expected a numeric [x, y] coordinate.");
}

function mustString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected a string field in level data.");
  }
  return value;
}

function mustNumber(value: unknown): number {
  if (typeof value !== "number") {
    throw new Error("Expected a numeric field in level data.");
  }
  return value;
}
