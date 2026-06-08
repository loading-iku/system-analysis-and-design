import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext Cloudflare configuration. The Next.js server is bundled into
// a single Worker that runs in the Node.js-compatible runtime. No KV/R2/D1
// caching layers are wired up yet; add them here if incremental caching is
// needed later.
export default defineCloudflareConfig();
