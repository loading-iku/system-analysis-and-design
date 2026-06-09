import type { ProgressProfile } from "@/lib/level/types";
import type { LeaderboardEntry } from "./leaderboard";

export const LOG_EXPORT_VERSION = 1 as const;

export type StudentLogExportEntry = {
  fullName: string;
  studentNumber: string;
  progress: ProgressProfile;
};

export type StudentLogExportPayload = {
  version: typeof LOG_EXPORT_VERSION;
  generatedAt: string;
  studentCount: number;
  leaderboard: LeaderboardEntry[];
  students: StudentLogExportEntry[];
};
