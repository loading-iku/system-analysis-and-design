"use client";

import { useClerk } from "@clerk/nextjs";
import { CliButtonLink } from "@/components/cli/CliButtonLink";

/** Signs the user out and returns them to the login screen. */
export function SignOutLink() {
  const { signOut } = useClerk();
  return (
    <CliButtonLink onClick={() => void signOut({ redirectUrl: "/login" })}>
      Log out &gt;
    </CliButtonLink>
  );
}
