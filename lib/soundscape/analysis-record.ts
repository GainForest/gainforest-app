/**
 * Stored PMN analysis — `app.gainforest.ac.soundscapeAnalysis`.
 *
 * One record per analyzed `ac.audio` recording, holding what the soundscape
 * clock needs so the result outlives one browser: the five band values it
 * draws and the full 192-bin spectrum those bands were cut from.
 *
 * Why a companion record rather than a field on `ac.audio`:
 *
 *  - Analysis is derived, recomputable and versioned; the audio record is
 *    evidence. Writing the analysis into the audio record would change that
 *    record's CID — which is exactly the key used to notice that the audio
 *    itself changed and must be re-analyzed. Derived data would invalidate
 *    its own invalidation key, and every pipeline change would rewrite every
 *    evidence record in the repo.
 *  - The spectrum is ~1.4 kB. On `ac.audio` it would be dragged along by every
 *    listing that only wants a name and a timestamp.
 *
 * The rkey mirrors the audio record's rkey, so writing an analysis is an
 * idempotent `putRecord` and joining the two collections is a map lookup.
 */

import { PMN_BIN_COUNT, PMN_SPECTRUM_BINS } from "./pmn";

export const SOUNDSCAPE_ANALYSIS_COLLECTION = "app.gainforest.ac.soundscapeAnalysis";

/**
 * Bumped whenever the numbers change meaning — the PMN pipeline itself or the
 * band edges it is cut into. Stored results from an older pipeline are ignored
 * and recomputed, exactly like the local cache's storage key.
 *
 * `pmn-2`: real-Hz band edges derived from each recording's sample rate
 * (`pmn-1` used the reference pipeline's pseudo-Hz edges).
 */
export const PMN_PIPELINE_VERSION = "pmn-2";

export type StoredAnalysis = {
  /** AT-URI of the `ac.audio` record this describes. */
  audio: string;
  /** That record's CID when it was analyzed — re-uploaded audio gets a new
   *  CID, so a stale analysis is spotted rather than trusted. */
  audioCid: string;
  pipeline: string;
  sampleRate: number;
  /** Max PMN per voice band. */
  bands: number[];
  /** Max PMN per FFT bin, so band edges can change without re-analysis. */
  spectrum: number[];
};

function isIntVector(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/**
 * Record body for one analyzed recording. Values are rounded: PMN runs into
 * the tens of thousands, so a fraction of a decibel-sum is far below anything
 * the dial can draw, and integers keep the record compact.
 */
export function buildAnalysisRecord(
  input: {
    audioUri: string;
    audioCid: string;
    sampleRate: number;
    bands: number[];
    spectrum: number[];
  },
  createdAt = new Date().toISOString(),
): Record<string, unknown> {
  return {
    $type: SOUNDSCAPE_ANALYSIS_COLLECTION,
    audio: input.audioUri,
    audioCid: input.audioCid,
    pipeline: PMN_PIPELINE_VERSION,
    sampleRate: Math.round(input.sampleRate),
    bands: input.bands.map((value) => Math.round(value)),
    spectrum: input.spectrum.map((value) => Math.round(value)),
    createdAt,
  };
}

/** Parse a stored analysis, returning null for anything unusable. */
export function parseAnalysisRecord(value: unknown): StoredAnalysis | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.audio !== "string" || typeof record.audioCid !== "string") return null;
  if (typeof record.pipeline !== "string") return null;
  if (typeof record.sampleRate !== "number" || !Number.isFinite(record.sampleRate) || record.sampleRate <= 0) {
    return null;
  }
  if (!isIntVector(record.bands, PMN_BIN_COUNT) || !isIntVector(record.spectrum, PMN_SPECTRUM_BINS)) return null;
  return {
    audio: record.audio,
    audioCid: record.audioCid,
    pipeline: record.pipeline,
    sampleRate: record.sampleRate,
    bands: record.bands,
    spectrum: record.spectrum,
  };
}

/**
 * Whether a stored analysis can stand in for running the pipeline again: same
 * audio bytes, same pipeline. Anything else is recomputed.
 */
export function isUsableAnalysis(analysis: StoredAnalysis, audioCid: string): boolean {
  return analysis.audioCid === audioCid && analysis.pipeline === PMN_PIPELINE_VERSION;
}
