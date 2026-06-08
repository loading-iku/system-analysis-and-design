import { spawnSync } from "node:child_process";

const isPagesBuild = process.env.CF_PAGES === "1";
const isInternalNextBuild = process.env.CLOUDFLARE_PAGES_NEXT_BUILD === "1";

if (isPagesBuild && !isInternalNextBuild) {
  // Cloudflare Pages expects a Pages-compatible output tree, while local and
  // non-Pages builds should continue to use the standard Next.js build.
  run(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["@cloudflare/next-on-pages@1"],
    {
      ...process.env,
      CLOUDFLARE_PAGES_NEXT_BUILD: "1",
    },
  );
} else {
  run(process.platform === "win32" ? "next.cmd" : "next", ["build"], process.env);
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
