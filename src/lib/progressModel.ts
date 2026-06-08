import type {
  LevelProgress,
  LevelRunRecord,
  LevelSummary,
  ProgressProfile,
  RewardBundle,
} from "@/lib/level/types";

export const PROGRESS_METADATA_KEY = "logicPathProgressV2";
export const PROFILE_VERSION = 2;

export function emptyProfile(): ProgressProfile {
  return {
    version: PROFILE_VERSION,
    updatedAt: new Date(0).toISOString(),
    totals: { xp: 0, coins: 0 },
    levels: {},
  };
}

export function normalizeProfile(raw: unknown): ProgressProfile {
  if (!isRecord(raw)) return emptyProfile();

  const levelsRaw = isRecord(raw.levels) ? raw.levels : {};
  const levels: ProgressProfile["levels"] = {};
  Object.entries(levelsRaw).forEach(([id, value]) => {
    levels[id] = normalizeLevelProgress(value);
  });

  return {
    version: PROFILE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    totals: normalizeRewards(raw.totals),
    levels,
  };
}

export function readProgressProfile(privateMetadata: unknown): ProgressProfile {
  if (!isRecord(privateMetadata)) return emptyProfile();

  const raw = privateMetadata[PROGRESS_METADATA_KEY];
  return normalizeProfile(isRecord(raw) && "profile" in raw ? raw.profile : raw);
}

export function mergeLevelSummary(
  profile: ProgressProfile,
  summary: LevelSummary,
): { profile: ProgressProfile; summary: LevelSummary } {
  const nextLevels = { ...profile.levels };
  const existing = nextLevels[summary.levelId] ?? defaultLevelProgress();
  const runRecord: LevelRunRecord = {
    endingId: summary.endingId,
    endingLabel: summary.endingLabel,
    endingTier: summary.endingTier,
    elapsedMs: summary.run.elapsedMs,
    successRate: summary.run.successRate,
    gatesCleared: summary.run.gatesCleared,
    challengesCompleted: summary.run.challengesCompleted,
    mistakes: summary.run.mistakes,
    optionalRoutesCompleted: summary.run.optionalRoutesCompleted,
    rewards: summary.earned,
    rank: summary.rank,
    completesLevel: summary.completesLevel,
    at: summary.at,
  };

  const bestRun = chooseBetterRun(existing.bestRun, runRecord);
  const seenEndingIds = unique([...existing.seenEndingIds, summary.endingId]);
  const nextLevel: LevelProgress = {
    status:
      summary.completesLevel || existing.status === "cleared"
        ? "cleared"
        : "attempted",
    attempts: existing.attempts + 1,
    firstClearedAt:
      existing.firstClearedAt ??
      (summary.completesLevel ? summary.at : undefined),
    lastPlayedAt: summary.at,
    seenEndingIds,
    bestEndingId: bestRun.endingId,
    bestRun,
    lastRun: runRecord,
    rewards: {
      xp: existing.rewards.xp + summary.earned.xp,
      coins: existing.rewards.coins + summary.earned.coins,
    },
  };

  nextLevels[summary.levelId] = nextLevel;

  const nextProfile: ProgressProfile = {
    version: PROFILE_VERSION,
    updatedAt: summary.at,
    totals: {
      xp: profile.totals.xp + summary.earned.xp,
      coins: profile.totals.coins + summary.earned.coins,
    },
    levels: nextLevels,
  };

  const mergedSummary: LevelSummary = {
    ...summary,
    totalsAfterRun: nextProfile.totals,
    progress: {
      ...summary.progress,
      status: nextLevel.status,
      endingsSeen: seenEndingIds.length,
      bestEndingId: nextLevel.bestEndingId,
      bestPathAchieved:
        existing.bestRun === undefined ||
        nextLevel.bestRun?.at === runRecord.at,
    },
  };

  return { profile: nextProfile, summary: mergedSummary };
}

export function completedLevelIds(profile: ProgressProfile): string[] {
  return Object.entries(profile.levels)
    .filter(([, progress]) => progress.status === "cleared")
    .map(([id]) => id);
}

export function isLevelUnlocked(
  orderedIds: string[],
  index: number,
  profile: ProgressProfile,
): boolean {
  if (index <= 0) return true;
  const previousId = orderedIds[index - 1];
  if (!previousId) return false;
  return profile.levels[previousId]?.status === "cleared";
}

export function formatEndingId(id?: string): string {
  if (!id) return "none";
  return id
    .replace(/^ending-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function chooseBetterRun(
  current: LevelRunRecord | undefined,
  candidate: LevelRunRecord,
): LevelRunRecord {
  if (!current) return candidate;
  if (candidate.rank !== current.rank) {
    return candidate.rank < current.rank ? candidate : current;
  }
  if (candidate.challengesCompleted !== current.challengesCompleted) {
    return candidate.challengesCompleted > current.challengesCompleted
      ? candidate
      : current;
  }
  if (candidate.mistakes !== current.mistakes) {
    return candidate.mistakes < current.mistakes ? candidate : current;
  }
  if (candidate.elapsedMs !== current.elapsedMs) {
    return candidate.elapsedMs < current.elapsedMs ? candidate : current;
  }
  return current;
}

function normalizeLevelProgress(raw: unknown): LevelProgress {
  if (!isRecord(raw)) return defaultLevelProgress();
  return {
    status:
      raw.status === "attempted" || raw.status === "cleared"
        ? raw.status
        : "unplayed",
    attempts: safeInteger(raw.attempts),
    firstClearedAt:
      typeof raw.firstClearedAt === "string" ? raw.firstClearedAt : undefined,
    lastPlayedAt:
      typeof raw.lastPlayedAt === "string" ? raw.lastPlayedAt : undefined,
    seenEndingIds: Array.isArray(raw.seenEndingIds)
      ? raw.seenEndingIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    bestEndingId:
      typeof raw.bestEndingId === "string" ? raw.bestEndingId : undefined,
    bestRun: normalizeRun(raw.bestRun),
    lastRun: normalizeRun(raw.lastRun),
    rewards: normalizeRewards(raw.rewards),
  };
}

function normalizeRun(raw: unknown): LevelRunRecord | undefined {
  if (!isRecord(raw)) return undefined;
  if (
    typeof raw.endingId !== "string" ||
    typeof raw.endingLabel !== "string" ||
    typeof raw.endingTier !== "string"
  ) {
    return undefined;
  }

  return {
    endingId: raw.endingId,
    endingLabel: raw.endingLabel,
    endingTier: raw.endingTier as LevelRunRecord["endingTier"],
    elapsedMs: safeInteger(raw.elapsedMs),
    successRate: safeInteger(raw.successRate),
    gatesCleared: safeInteger(raw.gatesCleared),
    challengesCompleted: safeInteger(raw.challengesCompleted),
    mistakes: safeInteger(raw.mistakes),
    optionalRoutesCompleted: safeInteger(raw.optionalRoutesCompleted),
    rewards: normalizeRewards(raw.rewards),
    rank: safeInteger(raw.rank),
    completesLevel: Boolean(raw.completesLevel),
    at: typeof raw.at === "string" ? raw.at : new Date(0).toISOString(),
  };
}

function normalizeRewards(raw: unknown): RewardBundle {
  if (!isRecord(raw)) return { xp: 0, coins: 0 };
  return {
    xp: safeInteger(raw.xp),
    coins: safeInteger(raw.coins),
  };
}

function defaultLevelProgress(): LevelProgress {
  return {
    status: "unplayed",
    attempts: 0,
    seenEndingIds: [],
    rewards: { xp: 0, coins: 0 },
  };
}

function safeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
