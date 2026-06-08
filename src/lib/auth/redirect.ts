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
