/**
 * Per-recording PMN result cache, so the soundscape tab doesn't re-download
 * and re-analyze the same archival WAVs on every visit.
 *
 * Keyed by the ac.audio record CID — content-addressed, so an edited or
 * re-uploaded record gets a fresh CID and is simply analyzed again.
 *
 * Each entry keeps the banded maxima AND the full per-FFT-bin spectrum plus
 * the sample rate needed to read it as Hz. Storing the spectrum costs ~1.4 kB
 * per recording but means any future change to the band edges — including
 * region-specific ones learned from occurrence labels — is a re-render rather
 * than another multi-gigabyte re-analysis pass.
 *
 * v2 dropped v1's bare five-number vectors: those were binned with the old
 * pseudo-Hz edges (`FFT index * 750`), so their bands mean something different
 * and cannot be migrated. v1 entries are ignored and recomputed once.
 */

import { PMN_BIN_COUNT, PMN_SPECTRUM_BINS } from "./pmn";

const STORAGE_KEY = "soundscape:pmn:v2";

/**
 * Insertion-ordered; oldest entries are dropped first when trimming. Lower
 * than v1's 4000 because entries now carry a full spectrum — this keeps a full
 * cache near ~1.7 MB, well inside a 5 MB localStorage budget shared with the
 * rest of the app. Overflow degrades gracefully: `savePmnCache` swallows quota
 * errors and the affected recordings are simply analyzed again next visit.
 */
export const PMN_CACHE_MAX_ENTRIES = 1200;

export type PmnCacheEntry = {
  /** Max PMN per voice band. */
  bands: number[];
  /** Max PMN per FFT bin (length PMN_SPECTRUM_BINS), rounded to integers. */
  spectrum: number[];
  sampleRate: number;
};

export type PmnCache = Record<string, PmnCacheEntry>;

function isNumberVector(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isPmnEntry(value: unknown): value is PmnCacheEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    isNumberVector(entry.bands, PMN_BIN_COUNT) &&
    isNumberVector(entry.spectrum, PMN_SPECTRUM_BINS) &&
    typeof entry.sampleRate === "number" &&
    Number.isFinite(entry.sampleRate) &&
    entry.sampleRate > 0
  );
}

/** Parse a serialized cache, dropping anything that isn't a valid entry. */
export function parsePmnCache(raw: string | null): PmnCache {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const cache: PmnCache = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isPmnEntry(value)) cache[key] = value;
    }
    return cache;
  } catch {
    return {};
  }
}

/**
 * PMN values are sums of decibels above the noise floor, in the tens of
 * thousands — integer precision is far below any visible difference and keeps
 * the serialized cache compact.
 */
export function toCacheEntry(bands: number[], spectrum: number[], sampleRate: number): PmnCacheEntry {
  return {
    bands,
    spectrum: spectrum.map((value) => Math.round(value)),
    sampleRate,
  };
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
