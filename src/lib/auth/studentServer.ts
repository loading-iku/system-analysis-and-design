import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStudentNumber, isAllowedStudentEmail, normalizeStudentEmail } from "./student";

type ClerkEmailLike = {
  emailAddress?: string | null;
};

type ClerkUserLike = {
  id: string;
  primaryEmailAddress?: ClerkEmailLike | null;
  emailAddresses?: ClerkEmailLike[];
  unsafeMetadata?: unknown;
  privateMetadata?: unknown;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type StudentIdentity = {
  userId: string;
  email: string;
  studentNumber: string;
  fullName: string;
};

export type StudentAccess =
  | { kind: "signed-out" }
  | { kind: "forbidden"; email: string | null }
  | { kind: "allowed"; identity: StudentIdentity; user: ClerkUserLike };

export function getUserPrimaryEmail(user: ClerkUserLike): string | null {
  const primary = normalizeEmail(user.primaryEmailAddress?.emailAddress);
  if (primary) return primary;

  for (const address of user.emailAddresses ?? []) {
    const candidate = normalizeEmail(address.emailAddress);
    if (candidate) return candidate;
  }

  return null;
}

export function getStudentIdentityFromUser(user: ClerkUserLike): StudentIdentity | null {
  const email = getUserPrimaryEmail(user);
  if (!email || !isAllowedStudentEmail(email)) return null;

  const studentNumber = getStudentNumber(email);
  if (!studentNumber) return null;

  const fullName =
    readMetadataName(user.unsafeMetadata) ??
    normalizeDisplayName(user.fullName) ??
    joinDisplayName(user.firstName, user.lastName) ??
    studentNumber;

  return {
    userId: user.id,
    email,
    studentNumber,
    fullName,
  };
}

export async function getCurrentStudentAccess(): Promise<StudentAccess> {
  const { userId } = await auth();
  if (!userId) return { kind: "signed-out" };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const identity = getStudentIdentityFromUser(user);

  if (!identity) {
    return {
      kind: "forbidden",
      email: getUserPrimaryEmail(user),
    };
  }

  return {
    kind: "allowed",
    identity,
    user,
  };
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return normalizeStudentEmail(raw);
}

function readMetadataName(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  return normalizeDisplayName(metadata.name);
}

function joinDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const combined = [firstName, lastName]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");

  return normalizeDisplayName(combined);
}

function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const normalized = raw.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
