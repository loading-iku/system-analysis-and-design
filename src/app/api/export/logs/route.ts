import { NextResponse } from "next/server";
import { getCurrentStudentAccess } from "@/lib/auth/studentServer";
import { buildStudentLogExportPayload } from "@/lib/leaderboardServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getCurrentStudentAccess();
  if (access.kind === "signed-out") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.kind === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await buildStudentLogExportPayload();
    const fileStamp = payload.generatedAt.replace(/[:.]/g, "-");

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition":
          `attachment; filename="logic-path-logs-${fileStamp}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to export logs." },
      { status: 500 },
    );
  }
}
