"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { redirectToAuthTarget } from "@/lib/auth/redirect";

/**
 * Sends a signed-in user from an auth screen to the post-auth target.
 *
 * Fires both when the user is already signed in on mount (e.g. they navigated
 * back to `/login`) and right after `setActive()` flips `isSignedIn` to true at
 * the end of a sign-in / sign-up flow. The hard navigation lives in
 * `redirectToAuthTarget`, which avoids the soft-nav cookie race that otherwise
 * bounces the user back to the login screen.
 */
export function useRedirectIfSignedIn(): {
  isLoaded: boolean;
  isSignedIn: boolean;
} {
  const { isLoaded, isSignedIn } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || done.current) return;
    done.current = true;
    redirectToAuthTarget();
  }, [isLoaded, isSignedIn]);

  return { isLoaded, isSignedIn: Boolean(isSignedIn) };
}
