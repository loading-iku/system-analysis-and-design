# Loading — Logic Path

An educational game for learning system analysis and design concepts through a
real-time CLI/TUI-style labyrinth. Built with Next.js 16, React 19, TypeScript,
CSS Modules, and Clerk authentication.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For local development you need Clerk **test** keys. Create a `.env.local` file:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | OpenNext build — runs `next build` **and** emits the deployable Worker (`.open-next/worker.js`) |
| `npm run build:next` | Plain `next build` (no Worker bundle) |
| `npm run lint` | ESLint |
| `npm run verify:levels:v2` | Validate the JSON level files |
| `npm run preview` | Build + run the Cloudflare Worker locally (workerd) |
| `npm run deploy` | Build + deploy the Worker to Cloudflare |
| `npm run cf-typegen` | Generate `cloudflare-env.d.ts` from `wrangler.jsonc` |

## Deploying to Cloudflare Workers (OpenNext)

This app is deployed as a **Cloudflare Worker** using
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). The relevant
files:

- `wrangler.jsonc` — Worker config. **Requires** the `nodejs_compat`
  compatibility flag; OpenNext runs the Next.js server in the Workers Node.js
  runtime, not the Edge runtime.
- `open-next.config.ts` — OpenNext adapter config.

Deploy from your machine:

```bash
npm run deploy
```

Or connect the repo to **Cloudflare → Workers & Pages → Workers Builds**. Set:

- **Build command:** `npm run build` (it runs the OpenNext build and emits
  `.open-next/worker.js`).
- **Deploy command:** `npx wrangler deploy` (or `npx wrangler versions upload`).

> ⚠️ If the build command only runs `next build`, the Worker bundle is never
> generated and the deploy fails with
> `The entry-point file at ".open-next/worker.js" was not found`.

### Runtime model — important constraints

- **Pages and route handlers must NOT declare `export const runtime = "edge"`.**
  OpenNext for Cloudflare only supports the Node.js runtime; edge routes crash
  the Worker with a bare `500 Internal Server Error`.
- **`src/middleware.ts` must stay named `middleware.ts`** (Edge Middleware).
  Next.js 16 prints a deprecation warning suggesting `proxy.ts`, but the `proxy`
  convention runs on Node.js, which OpenNext rejects with "Node.js middleware is
  not currently supported." Keep it as `middleware.ts`.

### Environment variables on Cloudflare

Clerk needs two keys, and **where** you set them matters:

| Variable | Where it must exist | How to set it |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Build time** (inlined into the client bundle by Next.js) **and** runtime | Add as a **build variable** in Workers Builds settings. Publishable keys are public, so it can also be a plain Worker variable. |
| `CLERK_SECRET_KEY` | **Runtime** only | Worker **secret**: `npx wrangler secret put CLERK_SECRET_KEY`, or the dashboard's encrypted variables. |

> ⚠️ The most common deploy failure: adding `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
> only as a *runtime* variable. Because Next.js inlines `NEXT_PUBLIC_*` at build
> time, it must be present **when the Worker is built**, or Clerk fails and every
> page returns a 500.

For local Worker testing (`npm run preview`), copy `.dev.vars.example` to
`.dev.vars` and fill in your test keys.
