import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCurrentStudentAccess } from "@/lib/auth/studentServer";
import {
  emptyProfile,
  PROGRESS_METADATA_KEY,
  readProgressProfile,
} from "@/lib/progressModel";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createResetProgressMetadata(existingMetadata: unknown) {
  const privateMetadata = isRecord(existingMetadata) ? existingMetadata : {};
  const profile = {
    ...emptyProfile(),
    updatedAt: new Date().toISOString(),
  };

  return {
    ...privateMetadata,
    [PROGRESS_METADATA_KEY]: {
      profile,
      lastRunAt: null,
      lastRunKey: null,
      lastRunResult: null,
    },
  };
}

async function readAllowedAccess() {
  const access = await getCurrentStudentAccess();
  if (access.kind === "signed-out") {
    return {
      access: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (access.kind === "forbidden") {
    return {
      access: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { access, error: null };
}

export async function GET() {
  const { access, error } = await readAllowedAccess();
  if (error || !access) return error;

  return NextResponse.json({
    profile: readProgressProfile(access.user.privateMetadata),
  });
}

export async function DELETE() {
  const { access, error } = await readAllowedAccess();
  if (error || !access) return error;

  const client = await clerkClient();
  const privateMetadata = createResetProgressMetadata(access.user.privateMetadata);

  await client.users.updateUserMetadata(access.identity.userId, {
    privateMetadata,
  });

  return NextResponse.json({
    profile: readProgressProfile(privateMetadata),
  });
}
