import { NextResponse } from "next/server";
import { getLeaderboardEntries } from "@/lib/leaderboardServer";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const entries = await getLeaderboardEntries();

  return NextResponse.json(entries, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
