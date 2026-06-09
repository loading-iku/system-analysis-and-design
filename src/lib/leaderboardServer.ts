import "server-only";

import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { listLevels } from "@/lib/level/loadLevel";
import type {
  LevelProgress,
  LevelRunRecord,
  ProgressProfile,
} from "@/lib/level/types";
import type { LeaderboardEntry } from "./leaderboard";
import { getStudentIdentityFromUser } from "./auth/studentServer";
import {
  DEFAULT_GPAF_GAME_ID,
  GPAF_LOG_FORMAT,
  serializeGpafLogEvents,
  type GpafLogEvent,
  type GpafLogExportFile,
} from "./logExport";
import { readProgressProfile } from "./progressModel";

type LeaderboardUser = Parameters<typeof getStudentIdentityFromUser>[0] & {
  privateMetadata?: unknown;
};

type StudentSnapshot = {
  userId: string;
  fullName: string;
  studentNumber: string;
  progress: ProgressProfile;
};

type RankedStudentSnapshot = StudentSnapshot & {
  rank: number;
  playerPseudoId: string;
};

const USER_PAGE_SIZE = 100;
const EMPTY_PROFILE_UPDATED_AT = new Date(0).toISOString();

export async function getLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  try {
    return buildLeaderboardEntries(rankStudents(await listStudentSnapshots()));
  } catch {
    return [];
  }
}

export async function buildGpafLogExportFile(): Promise<GpafLogExportFile> {
  const generatedAt = new Date().toISOString();
  const rankedStudents = rankStudents(await listStudentSnapshots());
  const levelOrder = new Map(listLevels().map((level, index) => [level.id, index + 1]));
  const totalLevelCount = levelOrder.size;
  const gameId = readGpafGameId();
  // We store aggregate progress snapshots, so this export reconstructs a GPAF-style
  // JSONL event stream from the latest persisted leaderboard and level state.
  const events = rankedStudents
    .flatMap((student) =>
      buildStudentGpafEvents(student, levelOrder, totalLevelCount, gameId, generatedAt),
    )
    .sort(compareGpafEvents);
  const content = serializeGpafLogEvents(events);

  return {
    format: GPAF_LOG_FORMAT,
    generatedAt,
    eventCount: events.length,
    content: content ? `${content}\n` : "",
  };
}

async function listStudentSnapshots(): Promise<StudentSnapshot[]> {
  const client = await clerkClient();
  const users: LeaderboardUser[] = [];
  let offset = 0;

  while (true) {
    const page = await client.users.getUserList({
      limit: USER_PAGE_SIZE,
      offset,
    });

    users.push(...page.data);
    offset += page.data.length;

    if (page.data.length === 0 || offset >= page.totalCount) break;
  }

  return users.map(toStudentSnapshot).filter(isDefined);
}

function toStudentSnapshot(user: LeaderboardUser): StudentSnapshot | null {
  const identity = getStudentIdentityFromUser(user);
  if (!identity) return null;

  return {
    userId: identity.userId,
    fullName: identity.fullName,
    studentNumber: identity.studentNumber,
    progress: readProgressProfile(user.privateMetadata),
  };
}

function rankStudents(students: StudentSnapshot[]): RankedStudentSnapshot[] {
  return [...students].sort(compareStudents).map((student, index) => ({
    ...student,
    rank: index + 1,
    playerPseudoId: createPlayerPseudoId(student.userId),
  }));
}

function buildLeaderboardEntries(students: RankedStudentSnapshot[]): LeaderboardEntry[] {
  return students.map((student) => ({
    rank: student.rank,
    fullName: student.fullName,
    studentNumber: student.studentNumber,
    xp: student.progress.totals.xp,
  }));
}

function buildStudentGpafEvents(
  student: RankedStudentSnapshot,
  levelOrder: Map<string, number>,
  totalLevelCount: number,
  gameId: string,
  generatedAt: string,
): GpafLogEvent[] {
  const sessionStartTs = getSessionStartTimestamp(student.progress, generatedAt);
  const sessionEndTs = getSessionEndTimestamp(student.progress, sessionStartTs, generatedAt);
  const sessionId = createSessionId(student.playerPseudoId, student.progress, generatedAt);
  const levelEvents = Object.entries(student.progress.levels)
    .filter(([, level]) => level.status !== "unplayed")
    .map(([levelId, level]) =>
      buildLevelEvent(student, levelId, level, levelOrder, sessionId, gameId, sessionEndTs),
    )
    .sort(compareGpafEvents);
  const clearedLevelCount = levelEvents.filter(
    (event) => event.eventType === "level_complete",
  ).length;

  return [
    {
      ts: sessionStartTs,
      playerPseudoId: student.playerPseudoId,
      sessionId,
      gameId,
      eventType: "session_start",
      payload: {},
    },
    ...levelEvents,
    {
      ts: sessionEndTs,
      playerPseudoId: student.playerPseudoId,
      sessionId,
      gameId,
      eventType: "score_update",
      payload: {
        score: student.progress.totals.xp,
        rank: student.rank,
        xp: student.progress.totals.xp,
        coins: student.progress.totals.coins,
        levelsPlayed: levelEvents.length,
      },
    },
    {
      ts: sessionEndTs,
      playerPseudoId: student.playerPseudoId,
      sessionId,
      gameId,
      eventType: "session_end",
      payload: {
        completed: totalLevelCount > 0 && clearedLevelCount === totalLevelCount,
        levelsCleared: clearedLevelCount,
        levelsPlayed: levelEvents.length,
      },
    },
  ];
}

function buildLevelEvent(
  student: RankedStudentSnapshot,
  levelId: string,
  level: LevelProgress,
  levelOrder: Map<string, number>,
  sessionId: string,
  gameId: string,
  fallbackTs: string,
): GpafLogEvent {
  const eventType = level.status === "cleared" ? "level_complete" : "level_progress";
  const lastRun = toRunPayload(level.lastRun);
  const bestRun = toRunPayload(level.bestRun);

  return {
    ts: getLevelEventTimestamp(level, fallbackTs),
    playerPseudoId: student.playerPseudoId,
    sessionId,
    gameId,
    eventType,
    payload: {
      level: levelOrder.get(levelId) ?? 0,
      levelId,
      status: level.status,
      attempts: level.attempts,
      endingsSeen: level.seenEndingIds.length,
      bestEndingId: level.bestEndingId ?? null,
      firstClearedAt: level.firstClearedAt ?? null,
      lastPlayedAt: level.lastPlayedAt ?? null,
      xp: level.rewards.xp,
      coins: level.rewards.coins,
      completed: level.status === "cleared",
      lastRun,
      bestRun,
    },
  };
}

function toRunPayload(run: LevelRunRecord | undefined): Record<string, unknown> | null {
  if (!run) return null;

  return {
    endingId: run.endingId,
    endingLabel: run.endingLabel,
    endingTier: run.endingTier,
    elapsedMs: run.elapsedMs,
    successRate: run.successRate,
    gatesCleared: run.gatesCleared,
    challengesCompleted: run.challengesCompleted,
    mistakes: run.mistakes,
    optionalRoutesCompleted: run.optionalRoutesCompleted,
    rank: run.rank,
    completesLevel: run.completesLevel,
    at: run.at,
    xp: run.rewards.xp,
    coins: run.rewards.coins,
  };
}

function createPlayerPseudoId(userId: string): string {
  return `p-${hashValue(userId).slice(0, 12)}`;
}

function createSessionId(
  playerPseudoId: string,
  profile: ProgressProfile,
  generatedAt: string,
): string {
  const seed = `${playerPseudoId}:${getSessionEndTimestamp(profile, generatedAt, generatedAt)}`;
  return `s-${hashValue(seed).slice(0, 12)}`;
}

function readGpafGameId(): string {
  const configured = process.env.GPAF_GAME_ID?.trim();
  return configured ? configured : DEFAULT_GPAF_GAME_ID;
}

function getSessionStartTimestamp(
  profile: ProgressProfile,
  fallbackTs: string,
): string {
  const candidates = Object.values(profile.levels).flatMap((level) => [
    normalizeTimestamp(level.firstClearedAt),
    normalizeTimestamp(level.lastPlayedAt),
    normalizeTimestamp(level.bestRun?.at),
    normalizeTimestamp(level.lastRun?.at),
  ]);

  return firstTimestamp(candidates) ?? normalizeTimestamp(profile.updatedAt) ?? fallbackTs;
}

function getSessionEndTimestamp(
  profile: ProgressProfile,
  startTs: string,
  fallbackTs: string,
): string {
  const candidates = Object.values(profile.levels).flatMap((level) => [
    normalizeTimestamp(level.lastPlayedAt),
    normalizeTimestamp(level.bestRun?.at),
    normalizeTimestamp(level.lastRun?.at),
  ]);

  return (
    lastTimestamp([
      ...candidates,
      normalizeTimestamp(profile.updatedAt),
      normalizeTimestamp(startTs),
    ]) ?? fallbackTs
  );
}

function getLevelEventTimestamp(level: LevelProgress, fallbackTs: string): string {
  return (
    lastTimestamp([
      normalizeTimestamp(level.lastRun?.at),
      normalizeTimestamp(level.lastPlayedAt),
      normalizeTimestamp(level.firstClearedAt),
      normalizeTimestamp(level.bestRun?.at),
    ]) ?? fallbackTs
  );
}

function normalizeTimestamp(value: string | undefined): string | null {
  if (!value || value === EMPTY_PROFILE_UPDATED_AT) return null;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;

  return new Date(parsed).toISOString();
}

function firstTimestamp(values: Array<string | null>): string | null {
  return [...values]
    .filter(isDefined)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

function lastTimestamp(values: Array<string | null>): string | null {
  return [...values]
    .filter(isDefined)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1) ?? null;
}

function compareGpafEvents(a: GpafLogEvent, b: GpafLogEvent): number {
  const tsDiff = Date.parse(a.ts) - Date.parse(b.ts);
  if (tsDiff !== 0) return tsDiff;

  if (a.playerPseudoId !== b.playerPseudoId) {
    return a.playerPseudoId.localeCompare(b.playerPseudoId);
  }

  if (a.sessionId !== b.sessionId) {
    return a.sessionId.localeCompare(b.sessionId);
  }

  return eventPriority(a.eventType) - eventPriority(b.eventType);
}

function eventPriority(eventType: GpafLogEvent["eventType"]): number {
  switch (eventType) {
    case "session_start":
      return 0;
    case "level_progress":
      return 1;
    case "level_complete":
      return 2;
    case "score_update":
      return 3;
    case "session_end":
      return 4;
  }
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareStudents(
  a: StudentSnapshot,
  b: StudentSnapshot,
): number {
  if (a.progress.totals.xp !== b.progress.totals.xp) {
    return b.progress.totals.xp - a.progress.totals.xp;
  }

  return a.studentNumber.localeCompare(b.studentNumber);
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}
