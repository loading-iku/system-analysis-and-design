import manifest from "@/data/levels/manifest.json";
import placeOrder from "@/data/levels/place-order.json";
import type { LevelJSON, LevelManifestEntry } from "./types";

const registry: Record<string, LevelJSON> = {
  "place-order": placeOrder as LevelJSON,
};

export function loadLevel(id: string): LevelJSON | null {
  return registry[id] ?? null;
}

export function listLevels(): LevelManifestEntry[] {
  return manifest as LevelManifestEntry[];
}
