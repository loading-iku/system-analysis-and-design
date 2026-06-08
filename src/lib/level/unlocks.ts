import type { LabyrinthLevelJSON } from "./types";

export function computeUnlockedEndingIds(
  level: LabyrinthLevelJSON,
  seenEndingIds: Iterable<string>,
): Set<string> {
  const seen = new Set(seenEndingIds);
  const endingsById = new Map(level.endings.map((ending) => [ending.id, ending]));
  const unlocked = new Set<string>();

  level.endings.forEach((ending) => {
    if (ending.initiallyUnlocked) {
      unlocked.add(ending.id);
    }
  });

  seen.forEach((endingId) => {
    if (endingsById.has(endingId)) {
      unlocked.add(endingId);
    }
  });

  seen.forEach((endingId) => {
    const ending = endingsById.get(endingId);
    if (!ending) return;
    ending.unlocksEndingIds.forEach((unlockedEndingId) => {
      unlocked.add(unlockedEndingId);
    });
  });

  return unlocked;
}

export function computeNewlyUnlockedEndingIds(
  level: LabyrinthLevelJSON,
  seenEndingIds: Iterable<string>,
  discoveredEndingId: string,
): string[] {
  const before = computeUnlockedEndingIds(level, seenEndingIds);
  const nextSeenEndingIds = new Set(seenEndingIds);
  nextSeenEndingIds.add(discoveredEndingId);
  const after = computeUnlockedEndingIds(level, nextSeenEndingIds);

  return level.endings
    .filter(
      (ending) =>
        ending.id !== discoveredEndingId &&
        after.has(ending.id) &&
        !before.has(ending.id),
    )
    .map((ending) => ending.id);
}
