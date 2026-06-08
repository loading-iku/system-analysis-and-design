import manifest from "@/data/levels/manifest.json";
import placeOrder from "@/data/levels/place-order.json";
import userLogin from "@/data/levels/user-login.json";
import userRegistration from "@/data/levels/user-registration.json";
import type { LevelJSON, LevelManifestEntry } from "./types";
import { normalizeLevel } from "./normalizeLevel";
import { validateLevel } from "./validation";

const rawRegistry: Record<string, Record<string, unknown>> = {
  "place-order": placeOrder as Record<string, unknown>,
  "user-login": userLogin as Record<string, unknown>,
  "user-registration": userRegistration as Record<string, unknown>,
};

const registry: Record<string, LevelJSON> = Object.fromEntries(
  Object.entries(rawRegistry).map(([id, rawLevel]) => [id, normalizeLevel(rawLevel)]),
) as Record<string, LevelJSON>;

Object.entries(registry).forEach(([id, level]) => {
  const errors = validateLevel(level);
  if (errors.length > 0) {
    throw new Error(`Invalid level "${id}":\n${errors.join("\n")}`);
  }
});

export function loadLevel(id: string): LevelJSON | null {
  return registry[id] ?? null;
}

export function listLevels(): LevelManifestEntry[] {
  return manifest as LevelManifestEntry[];
}
