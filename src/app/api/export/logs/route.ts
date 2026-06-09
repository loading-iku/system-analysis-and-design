import { NextResponse } from "next/server";
import { getCurrentStudentAccess } from "@/lib/auth/studentServer";
import { buildGpafLogExportFile } from "@/lib/leaderboardServer";

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
    const exportFile = await buildGpafLogExportFile();
    const fileStamp = exportFile.generatedAt.replace(/[:.]/g, "-");

    return new Response(exportFile.content, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition":
          `attachment; filename="logic-path-logs-${fileStamp}.jsonl"`,
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to export logs." },
      { status: 500 },
    );
  }
}
