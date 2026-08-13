/**
 * Real audio-upload figures for the Rewilding grantee dashboard.
 *
 * The "Audio uploaded" stat counts the grantee account's
 * `app.gainforest.ac.audio` records — the same records Bumiscan's Klarna
 * scorecard tracks as "Bioacoustic Data Collected" — read from the GainForest
 * hyperindex. Every ac.audio record carries `metadata.duration` (seconds), so
 * the dashboard can report minutes of audio rather than a bare recording
 * count, matching the program's 7,000-minute-per-community target.
 */

import { INDEXER_URL } from "@/app/_lib/urls";
import { cachedAsync } from "@/app/_lib/async-cache";

export type GranteeAudioStats = {
  /** Total minutes of audio uploaded by the account, rounded. */
  audioMinutes: number;
  /** Cumulative uploaded minutes at each of the last {@link TREND_WEEKS}
   *  week boundaries (oldest → newest), for the sparkline. Empty when there
   *  is no audio at all. */
  audioTrend: number[];
};

export const EMPTY_AUDIO_STATS: GranteeAudioStats = { audioMinutes: 0, audioTrend: [] };

/** One upload, reduced to what the stats need. */
export type AudioUploadEvent = {
  /** Epoch ms the record was created (upload time). */
  t: number;
  /** Length of the recording in seconds. */
  seconds: number;
};

const WEEK_MS = 7 * 86_400_000;
/** How many weekly points the sparkline gets. */
const TREND_WEEKS = 12;

const PAGE_SIZE = 1000;
/** Safety cap: at most this many pages per account (10,000 recordings). An
 *  account past the cap undercounts its oldest uploads rather than hammering
 *  the indexer; revisit if a grantee ever legitimately exceeds it. */
const MAX_PAGES = 10;

const CACHE_PREFIX = "rewilding-audio:v1:";
const CACHE_MS = 5 * 60_000;

/**
 * Fold upload events into the headline number and the weekly cumulative
 * trend. Pure — exported for tests.
 */
export function buildAudioStats(events: readonly AudioUploadEvent[], now: number = Date.now()): GranteeAudioStats {
  const totalSeconds = events.reduce((sum, event) => sum + Math.max(0, event.seconds), 0);
  if (totalSeconds <= 0) return EMPTY_AUDIO_STATS;

  // Cumulative minutes at each week boundary, ending now. Uploads older than
  // the window form the baseline, so the sparkline shows overall progress.
  const audioTrend: number[] = [];
  for (let week = TREND_WEEKS - 1; week >= 0; week -= 1) {
    const boundary = now - week * WEEK_MS;
    const seconds = events.reduce(
      (sum, event) => (event.t <= boundary ? sum + Math.max(0, event.seconds) : sum),
      0,
    );
    audioTrend.push(Math.round(seconds / 60));
  }

  return { audioMinutes: Math.round(totalSeconds / 60), audioTrend };
}

const AUDIO_PAGE_QUERY = `query GranteeAudio($did: String!, $first: Int!, $after: String) {
  appGainforestAcAudio(first: $first, after: $after, where: { did: { eq: $did } }, sortBy: createdAt, sortDirection: DESC) {
    pageInfo { hasNextPage endCursor }
    edges { node { createdAt metadata { duration } } }
  }
}`;

type AudioPage = {
  appGainforestAcAudio?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{
      node?: { createdAt?: string | null; metadata?: { duration?: string | null } | null } | null;
    } | null> | null;
  } | null;
};

async function fetchAudioPage(did: string, after: string | null): Promise<AudioPage["appGainforestAcAudio"]> {
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: AUDIO_PAGE_QUERY, variables: { did, first: PAGE_SIZE, after } }),
  });
  if (!response.ok) throw new Error(`indexer responded ${response.status}`);
  const json = (await response.json()) as { data?: AudioPage | null };
  return json.data?.appGainforestAcAudio ?? null;
}

/** Every upload event for one account, newest first, capped at {@link MAX_PAGES}. */
async function fetchAudioUploadEvents(did: string): Promise<AudioUploadEvent[]> {
  const events: AudioUploadEvent[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const conn = await fetchAudioPage(did, after);
    for (const edge of conn?.edges ?? []) {
      const node = edge?.node;
      if (!node) continue;
      const t = Date.parse(node.createdAt ?? "");
      const seconds = Number.parseFloat(node.metadata?.duration ?? "");
      if (Number.isNaN(t) || !Number.isFinite(seconds)) continue;
      events.push({ t, seconds });
    }
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return events;
}

/**
 * The grantee's audio-upload stats, read live from the hyperindex and cached
 * briefly per account. Throws on indexer failure — callers decide whether a
 * zeroed fallback is acceptable.
 */
export function fetchGranteeAudioStats(did: string, signal?: AbortSignal): Promise<GranteeAudioStats> {
  return cachedAsync(
    `${CACHE_PREFIX}${did}`,
    CACHE_MS,
    async () => buildAudioStats(await fetchAudioUploadEvents(did)),
    signal,
  );
}
