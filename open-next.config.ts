import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext Cloudflare configuration. The Next.js server is bundled into
// a single Worker that runs in the Node.js-compatible runtime. No KV/R2/D1
// caching layers are wired up yet; add them here if incremental caching is
// needed later.
const config = defineCloudflareConfig();

// `npm run build` IS `opennextjs-cloudflare build` (so the Cloudflare Workers
// Builds default build command produces the `.open-next/` Worker bundle). By
// default OpenNext runs `npm run build` for the inner Next.js build, which would
// recurse into this same command — so pin the framework build to `next build`.
config.buildCommand = "npm run build:next";

export default config;
