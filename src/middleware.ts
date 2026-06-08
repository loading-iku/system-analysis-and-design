import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Cloudflare Pages still requires Edge middleware, so we intentionally keep the
// deprecated middleware file convention instead of migrating this to proxy.ts.

// Routes that require an authenticated session. Everything else (home, /login,
// /signup, /signup/verify) stays public so users can actually sign in.
const isProtectedRoute = createRouteMatcher(["/start(.*)", "/levels(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
