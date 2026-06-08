import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCurrentStudentAccess } from "@/lib/auth/studentServer";
import { listLevels } from "@/lib/level/loadLevel";
import type { LevelSummary } from "@/lib/level/types";
import {
  emptyProfile,
  mergeLevelSummary,
  normalizeProfile,
  PROGRESS_METADATA_KEY,
} from "@/lib/progressModel";

const DUPLICATE_WINDOW_MS = 10_000;
export const runtime = "edge";

type StoredProgressMetadata = {
  profile: ReturnType<typeof emptyProfile>;
  lastRunAt: string | null;
  lastRunKey: string | null;
  lastRunResult: { profile: ReturnType<typeof emptyProfile>; summary: LevelSummary } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLevelSummary(value: unknown): LevelSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.levelId !== "string" ||
    typeof value.endingId !== "string" ||
    typeof value.endingLabel !== "string" ||
    typeof value.endingTier !== "string" ||
    !isRecord(value.earned) ||
    !isRecord(value.totalsAfterRun) ||
    !isRecord(value.run) ||
    !isRecord(value.progress) ||
    typeof value.at !== "string"
  ) {
    return null;
  }

  const nextLevel = isRecord(value.nextLevel)
    ? value.nextLevel
    : null;

  return {
    levelId: value.levelId,
    endingId: value.endingId,
    endingLabel: value.endingLabel,
    endingTier: value.endingTier as LevelSummary["endingTier"],
    earned: {
      xp: Number(value.earned.xp) || 0,
      coins: Number(value.earned.coins) || 0,
    },
    totalsAfterRun: {
      xp: Number(value.totalsAfterRun.xp) || 0,
      coins: Number(value.totalsAfterRun.coins) || 0,
    },
    run: {
      elapsedMs: Number(value.run.elapsedMs) || 0,
      successRate: Number(value.run.successRate) || 0,
      gatesCleared: Number(value.run.gatesCleared) || 0,
      challengesCompleted: Number(value.run.challengesCompleted) || 0,
      mistakes: Number(value.run.mistakes) || 0,
      optionalRoutesCompleted: Number(value.run.optionalRoutesCompleted) || 0,
    },
    progress: {
      status:
        value.progress.status === "cleared" || value.progress.status === "attempted"
          ? value.progress.status
          : "unplayed",
      endingsSeen: Number(value.progress.endingsSeen) || 0,
      endingCount: Number(value.progress.endingCount) || 0,
      bestEndingId:
        typeof value.progress.bestEndingId === "string"
          ? value.progress.bestEndingId
          : undefined,
      bestPathAchieved: Boolean(value.progress.bestPathAchieved),
    },
    outcomesUnlocked: Array.isArray(value.outcomesUnlocked)
      ? value.outcomesUnlocked.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    nextLevel:
      nextLevel &&
      typeof nextLevel.id === "string" &&
      typeof nextLevel.title === "string"
        ? { id: nextLevel.id, title: nextLevel.title }
        : null,
    completesLevel: Boolean(value.completesLevel),
    rank: Number(value.rank) || 0,
    at: value.at,
  };
}

function createRunKey(summary: LevelSummary): string {
  return `${summary.levelId}:${summary.endingId}:${summary.at}`;
}

function readStoredProgress(privateMetadata: unknown): StoredProgressMetadata {
  if (!isRecord(privateMetadata)) {
    return {
      profile: emptyProfile(),
      lastRunAt: null,
      lastRunKey: null,
      lastRunResult: null,
    };
  }

  const raw = privateMetadata[PROGRESS_METADATA_KEY];
  if (!isRecord(raw)) {
    return {
      profile: emptyProfile(),
      lastRunAt: null,
      lastRunKey: null,
      lastRunResult: null,
    };
  }

  const lastRunResult =
    isRecord(raw.lastRunResult) && parseLevelSummary(raw.lastRunResult.summary)
      ? {
          profile: normalizeProfile(raw.lastRunResult.profile),
          summary: parseLevelSummary(raw.lastRunResult.summary) as LevelSummary,
        }
      : null;

  return {
    profile: normalizeProfile(raw.profile ?? raw),
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    lastRunKey: typeof raw.lastRunKey === "string" ? raw.lastRunKey : null,
    lastRunResult,
  };
}

function isDuplicateRun(
  stored: StoredProgressMetadata,
  runKey: string,
  now: Date,
): boolean {
  if (!stored.lastRunKey || !stored.lastRunAt || !stored.lastRunResult) {
    return false;
  }

  const lastRecordedAt = Date.parse(stored.lastRunAt);
  if (Number.isNaN(lastRecordedAt)) return false;

  return (
    stored.lastRunKey === runKey &&
    now.getTime() - lastRecordedAt <= DUPLICATE_WINDOW_MS
  );
}

function writeStoredProgress(
  existingMetadata: unknown,
  stored: StoredProgressMetadata,
) {
  const metadata = isRecord(existingMetadata) ? existingMetadata : {};
  return {
    ...metadata,
    [PROGRESS_METADATA_KEY]: stored,
  };
}

export async function POST(request: Request) {
  const access = await getCurrentStudentAccess();
  if (access.kind === "signed-out") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.kind === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const summary = parseLevelSummary(isRecord(body) ? body.summary : null);

  if (!summary) {
    return NextResponse.json({ error: "Invalid run payload" }, { status: 400 });
  }

  const validLevelIds = new Set(listLevels().map((level) => level.id));
  if (!validLevelIds.has(summary.levelId)) {
    return NextResponse.json({ error: "Unknown level" }, { status: 400 });
  }

  const now = new Date();
  const runKey = createRunKey(summary);
  const client = await clerkClient();
  const userId = access.identity.userId;
  const stored = readStoredProgress(access.user.privateMetadata);

  if (isDuplicateRun(stored, runKey, now) && stored.lastRunResult) {
    return NextResponse.json(stored.lastRunResult);
  }

  const nextResult = mergeLevelSummary(stored.profile, summary);
  const nextStored: StoredProgressMetadata = {
    profile: nextResult.profile,
    lastRunAt: now.toISOString(),
    lastRunKey: runKey,
    lastRunResult: nextResult,
  };

  await client.users.updateUserMetadata(userId, {
    privateMetadata: writeStoredProgress(access.user.privateMetadata, nextStored),
  });

  return NextResponse.json(nextResult);
}
