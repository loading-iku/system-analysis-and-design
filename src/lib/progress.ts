"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { EndingTier, LevelProgress, LevelSummary, ProgressProfile } from "@/lib/level/types";
import {
  completedLevelIds,
  emptyProfile,
  formatEndingId,
  isLevelUnlocked,
  mergeLevelSummary,
  normalizeProfile,
} from "./progressModel";

const PROFILE_STORAGE_KEY = "logic-path:progress-profile:v2";
const LEGACY_STORAGE_KEY = "logic-path:progress:v1";
const inflightRuns = new Map<string, Promise<{ profile: ProgressProfile; summary: LevelSummary }>>();
const resolvedRuns = new Map<string, LevelSummary>();

let cachedProfile: ProgressProfile = emptyProfile();
let hasHydratedCache = false;
const listeners = new Set<() => void>();

function readStoredProfile(): ProgressProfile {
  if (typeof window === "undefined") return emptyProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) return normalizeProfile(JSON.parse(raw));

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return emptyProfile();

    const parsed: unknown = JSON.parse(legacyRaw);
    if (!Array.isArray(parsed)) return emptyProfile();

    const migrated = emptyProfile();
    parsed
      .filter((entry): entry is string => typeof entry === "string")
      .forEach((levelId) => {
        migrated.levels[levelId] = {
          status: "cleared",
          attempts: 1,
          seenEndingIds: [],
          rewards: { xp: 0, coins: 0 },
        };
      });

    return migrated;
  } catch {
    return emptyProfile();
  }
}

function persistProfile(profile: ProgressProfile) {
  cachedProfile = profile;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      window.localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify(completedLevelIds(profile)),
      );
    } catch {
      // Keep the in-memory cache hot even if storage is unavailable.
    }
  }
}

function emit(profile: ProgressProfile) {
  persistProfile(profile);
  listeners.forEach((listener) => listener());
}

function ensureHydratedCache() {
  if (hasHydratedCache) return;
  cachedProfile = readStoredProfile();
  hasHydratedCache = true;
}

function clearRunRequestCache() {
  inflightRuns.clear();
  resolvedRuns.clear();
}

function createRunKey(summary: LevelSummary): string {
  return `${summary.levelId}:${summary.endingId}:${summary.at}`;
}

export async function fetchProgressProfile(): Promise<ProgressProfile> {
  ensureHydratedCache();

  try {
    const response = await fetch("/api/progress", { cache: "no-store" });
    if (!response.ok) return cachedProfile;
    const payload = (await response.json()) as { profile?: unknown };
    const profile = normalizeProfile(payload.profile);
    emit(profile);
    return profile;
  } catch {
    return cachedProfile;
  }
}

export async function resetProgressProfile(): Promise<ProgressProfile> {
  ensureHydratedCache();

  const response = await fetch("/api/progress", {
    method: "DELETE",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to reset progress.");
  }

  const payload = (await response.json()) as { profile?: unknown };
  const profile = normalizeProfile(payload.profile);
  clearRunRequestCache();
  emit(profile);
  return profile;
}

export async function recordLevelRunSummary(summary: LevelSummary) {
  ensureHydratedCache();

  const runKey = createRunKey(summary);
  const resolved = resolvedRuns.get(runKey);
  if (resolved) {
    return { profile: cachedProfile, summary: resolved };
  }

  const inflight = inflightRuns.get(runKey);
  if (inflight) return inflight;

  const request = fetch("/api/progress/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Unable to persist level summary.");
      }

      const payload = (await response.json()) as {
        profile?: unknown;
        summary?: unknown;
      };
      const profile = normalizeProfile(payload.profile);
      const syncedSummary =
        payload.summary && typeof payload.summary === "object"
          ? (payload.summary as LevelSummary)
          : summary;
      emit(profile);
      resolvedRuns.set(runKey, syncedSummary);
      return { profile, summary: syncedSummary };
    })
    .catch(() => {
      const merged = mergeLevelSummary(cachedProfile, summary);
      emit(merged.profile);
      resolvedRuns.set(runKey, merged.summary);
      return merged;
    })
    .finally(() => {
      inflightRuns.delete(runKey);
    });

  inflightRuns.set(runKey, request);
  return request;
}

export const submitLevelSummary = recordLevelRunSummary;

export function useProgressProfile(): ProgressProfile {
  const profile = useSyncExternalStore(
    (listener) => {
      ensureHydratedCache();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => {
      ensureHydratedCache();
      return cachedProfile;
    },
    emptyProfile,
  );

  useEffect(() => {
    void fetchProgressProfile();
  }, []);

  return profile;
}

export function getClearedLevelIds(profile: ProgressProfile): string[] {
  return completedLevelIds(profile);
}

export function formatEndingTier(tier?: EndingTier | null): string {
  return tier ? tier.toUpperCase() : "--";
}

export { formatEndingId, isLevelUnlocked };
export type { LevelProgress, LevelSummary, ProgressProfile };
