import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Clerk auth gate, implemented as Next.js Edge Middleware.
//
// NOTE: Next.js 16 deprecates the `middleware` filename in favour of `proxy`,
// and `next build` prints a warning about it. We deliberately keep
// `middleware.ts`: @opennextjs/cloudflare supports Edge Middleware (this file)
// but does NOT support the Node.js `proxy` runtime — renaming to `proxy.ts`
// fails the OpenNext build with "Node.js middleware is not currently
// supported." Keep this as middleware.ts until OpenNext supports proxy.
// (Pages/route handlers are the opposite: they must NOT use `runtime = "edge"`.)

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
