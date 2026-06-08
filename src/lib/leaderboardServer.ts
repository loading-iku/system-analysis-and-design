import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type { LeaderboardEntry } from "./leaderboard";
import { getStudentIdentityFromUser } from "./auth/studentServer";
import { readProgressProfile } from "./progressModel";

type LeaderboardUser = Parameters<typeof getStudentIdentityFromUser>[0] & {
  privateMetadata?: unknown;
};

const USER_PAGE_SIZE = 100;

export async function getLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  try {
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

    return users
      .map((user) => {
        const identity = getStudentIdentityFromUser(user);
        if (!identity) return null;

        return {
          rank: 0,
          fullName: identity.fullName,
          studentNumber: identity.studentNumber,
          xp: readProgressProfile(user.privateMetadata).totals.xp,
        };
      })
      .filter((entry): entry is LeaderboardEntry => entry !== null)
      .sort((a, b) => {
        if (a.xp !== b.xp) return b.xp - a.xp;
        return a.studentNumber.localeCompare(b.studentNumber);
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
  } catch {
    return [];
  }
}
