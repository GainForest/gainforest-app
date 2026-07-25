/**
 * Per-recording PMN result cache, so the soundscape tab doesn't re-download
 * and re-analyze the same archival WAVs on every visit.
 *
 * Keyed by the ac.audio record CID — content-addressed, so an edited or
 * re-uploaded record gets a fresh CID and is simply analyzed again. Each
 * entry is just the five per-band PMN maxima, so even thousands of cached
 * recordings stay far below localStorage quotas.
 */

import { PMN_BIN_COUNT } from "./pmn";

const STORAGE_KEY = "soundscape:pmn:v1";

/** Insertion-ordered; oldest entries are dropped first when trimming. */
export const PMN_CACHE_MAX_ENTRIES = 4000;

export type PmnCache = Record<string, number[]>;

function isPmnVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === PMN_BIN_COUNT &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/** Parse a serialized cache, dropping anything that isn't a valid PMN vector. */
export function parsePmnCache(raw: string | null): PmnCache {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const cache: PmnCache = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isPmnVector(value)) cache[key] = value;
    }
    return cache;
  } catch {
    return {};
  }
}

/** Keep at most `max` entries, discarding the earliest-inserted ones. */
export function trimPmnCache(cache: PmnCache, max = PMN_CACHE_MAX_ENTRIES): PmnCache {
  const keys = Object.keys(cache);
  if (keys.length <= max) return cache;
  const trimmed: PmnCache = {};
  for (const key of keys.slice(keys.length - max)) trimmed[key] = cache[key];
  return trimmed;
}

export function loadPmnCache(): PmnCache {
  try {
    return parsePmnCache(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function savePmnCache(cache: PmnCache): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimPmnCache(cache)));
  } catch {
    /* storage unavailable (private mode / quota) — analysis simply re-runs next visit */
  }
}
