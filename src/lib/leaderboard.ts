export type LeaderboardEntry = {
  rank: number;
  fullName: string;
  studentNumber: string;
  xp: number;
};

export const LEADERBOARD_REFRESH_MS = 15_000;
