import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type { LeaderboardEntry } from "./leaderboard";
import { getStudentIdentityFromUser } from "./auth/studentServer";
import {
  LOG_EXPORT_VERSION,
  type StudentLogExportEntry,
  type StudentLogExportPayload,
} from "./logExport";
import { readProgressProfile } from "./progressModel";

type LeaderboardUser = Parameters<typeof getStudentIdentityFromUser>[0] & {
  privateMetadata?: unknown;
};

const USER_PAGE_SIZE = 100;

export async function getLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  try {
    return buildLeaderboardEntries(await listStudentLogExportEntries());
  } catch {
    return [];
  }
}

export async function buildStudentLogExportPayload(): Promise<StudentLogExportPayload> {
  const students = await listStudentLogExportEntries();

  return {
    version: LOG_EXPORT_VERSION,
    generatedAt: new Date().toISOString(),
    studentCount: students.length,
    leaderboard: buildLeaderboardEntries(students),
    students,
  };
}

async function listStudentLogExportEntries(): Promise<StudentLogExportEntry[]> {
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

  return users.map(toStudentLogExportEntry).filter(isDefined).sort(compareStudents);
}

function toStudentLogExportEntry(user: LeaderboardUser): StudentLogExportEntry | null {
  const identity = getStudentIdentityFromUser(user);
  if (!identity) return null;

  return {
    fullName: identity.fullName,
    studentNumber: identity.studentNumber,
    progress: readProgressProfile(user.privateMetadata),
  };
}

function buildLeaderboardEntries(students: StudentLogExportEntry[]): LeaderboardEntry[] {
  return [...students].sort(compareStudents).map((student, index) => ({
    rank: index + 1,
    fullName: student.fullName,
    studentNumber: student.studentNumber,
    xp: student.progress.totals.xp,
  }));
}

function compareStudents(
  a: StudentLogExportEntry,
  b: StudentLogExportEntry,
): number {
  if (a.progress.totals.xp !== b.progress.totals.xp) {
    return b.progress.totals.xp - a.progress.totals.xp;
  }

  return a.studentNumber.localeCompare(b.studentNumber);
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}
