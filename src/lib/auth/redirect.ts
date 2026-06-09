const DEFAULT_AUTH_REDIRECT = "/start";

export function resolveAuthRedirect(
  rawRedirect: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  if (!rawRedirect) return fallback;

  try {
    const base =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const url = new URL(rawRedirect, base);

    if (typeof window !== "undefined" && url.origin !== window.location.origin) {
      return fallback;
    }

    const target = `${url.pathname}${url.search}${url.hash}`;
    if (!target.startsWith("/") || target.startsWith("//")) return fallback;
    if (target.startsWith("/login") || target.startsWith("/signup")) {
      return fallback;
    }

    return target;
  } catch {
    return fallback;
  }
}

export function currentAuthRedirect(fallback = DEFAULT_AUTH_REDIRECT): string {
  if (typeof window === "undefined") return fallback;
  return resolveAuthRedirect(
    new URLSearchParams(window.location.search).get("redirect_url"),
    fallback,
  );
}

/**
 * Sends the browser to the post-auth target with a *hard* navigation.
 *
 * A full-document `location.replace` (rather than a soft `router.push`) forces
 * the Edge middleware to re-run with the freshly written Clerk session cookie,
 * so the protected `/start` route resolves instead of racing the cookie and
 * bouncing back to `/login`. `replace` also keeps the auth screen out of
 * history so Back doesn't return to the form.
 */
export function redirectToAuthTarget(fallback = DEFAULT_AUTH_REDIRECT): void {
  if (typeof window === "undefined") return;
  window.location.replace(currentAuthRedirect(fallback));
}
