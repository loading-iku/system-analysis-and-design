import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

/**
 * Turns an unknown error thrown by a Clerk custom-flow call into a single
 * human-readable line suitable for the CLI error display.
 */
export function clerkErrorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return first?.longMessage ?? first?.message ?? "Something went wrong.";
  }
  return "Something went wrong. Please try again.";
}
