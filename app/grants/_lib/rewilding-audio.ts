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
import type { AudioPace, AudioSeries } from "../_components/rewilding/model";

export type GranteeAudioStats = {
  /** Total minutes of audio uploaded by the account, rounded. */
  audioMinutes: number;
  /** Cumulative uploaded minutes at each of the last {@link TREND_WEEKS}
   *  week boundaries (oldest → newest), for the sparkline. Empty when there
   *  is no audio at all. */
  audioTrend: number[];
  /** Daily cumulative minutes backing the pace chart. Null with no audio. */
  audioSeries: AudioSeries | null;
};

export const EMPTY_AUDIO_STATS: GranteeAudioStats = {
  audioMinutes: 0,
  audioTrend: [],
  audioSeries: null,
};

/** One upload, reduced to what the stats need. */
export type AudioUploadEvent = {
  /** Epoch ms the record was created (upload time). */
  t: number;
  /** Length of the recording in seconds. */
  seconds: number;
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** How many weekly points the sparkline gets. */
const TREND_WEEKS = 12;

/** Axis cap for {@link buildAudioSeries} — comfortably longer than any grant. */
const MAX_SERIES_DAYS = 1200;

const PAGE_SIZE = 1000;
/** Safety cap: at most this many pages per account (10,000 recordings). An
 *  account past the cap undercounts its oldest uploads rather than hammering
 *  the indexer; revisit if a grantee ever legitimately exceeds it. */
const MAX_PAGES = 10;

const CACHE_PREFIX = "rewilding-audio:v1:";
const CACHE_MS = 5 * 60_000;

/**
 * Cumulative uploaded minutes at the end of each UTC day, from the first
 * upload through today — the shape the pace chart plots against the line it
 * needs to be on. The axis runs to today even when nothing was uploaded
 * recently, so a stalled grant visibly flattens instead of stopping short.
 *
 * Pure — exported for tests.
 */
export function buildAudioSeries(
  events: readonly AudioUploadEvent[],
  now: number = Date.now(),
): AudioSeries | null {
  const valid = events.filter((event) => Number.isFinite(event.t) && event.seconds > 0);
  if (valid.length === 0) return null;

  const startDay = Math.floor(Math.min(...valid.map((event) => event.t)) / DAY_MS) * DAY_MS;
  const endDay = Math.floor(now / DAY_MS) * DAY_MS;

  const sorted = [...valid].sort((a, b) => a.t - b.t);
  const days: string[] = [];
  const values: number[] = [];
  let index = 0;
  let seconds = 0;
  // Cap the axis so a very old first upload cannot build an unbounded array.
  for (let day = startDay; day <= endDay && days.length < MAX_SERIES_DAYS; day += DAY_MS) {
    const cutoff = day + DAY_MS;
    while (index < sorted.length && sorted[index]!.t < cutoff) {
      seconds += sorted[index]!.seconds;
      index += 1;
    }
    days.push(new Date(day).toISOString().slice(0, 10));
    values.push(seconds / 60);
  }
  return { days, values };
}

/**
 * Fold upload events into the headline number, the weekly cumulative trend
 * and the daily series. Pure — exported for tests.
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

  return {
    audioMinutes: Math.round(totalSeconds / 60),
    audioTrend,
    audioSeries: buildAudioSeries(events, now),
  };
}

/**
 * Compare uploaded minutes against the straight line from the grant start to
 * the target on the deadline.
 *
 * Before the window opens there is nothing to be behind: the grant reports
 * the pace it will demand across the whole period and no ahead/behind
 * verdict. Pure — exported for tests.
 */
export function buildAudioPace({
  audioMinutes,
  targetMinutes,
  startMs,
  endMs,
  now = Date.now(),
}: {
  audioMinutes: number;
  targetMinutes: number;
  startMs: number;
  endMs: number;
  now?: number;
}): AudioPace {
  const remainingMinutes = Math.max(0, targetMinutes - audioMinutes);
  const msRemaining = Math.max(0, endMs - now);
  const daysRemaining = Math.floor(msRemaining / DAY_MS);
  const msUntilStart = Math.max(0, startMs - now);
  const daysUntilStart = Math.ceil(msUntilStart / DAY_MS);
  const notStarted = msUntilStart > 0;

  const status =
    audioMinutes >= targetMinutes
      ? "met"
      : notStarted
        ? "upcoming"
        : msRemaining <= 0
          ? "closed"
          : "active";

  // Only time inside the grant window counts toward the achieved pace, so a
  // grant that has not opened reports no rate rather than dividing by a
  // negative elapsed time.
  const elapsedDays = notStarted ? 0 : Math.max(msRemaining > 0 ? 0.5 : 1, (now - startMs) / DAY_MS);
  const actualPerDay = notStarted ? 0 : audioMinutes / elapsedDays;

  // Days left counted from the real remaining time, not whole days, so the
  // required pace does not jump the moment a day boundary passes. Before the
  // grant opens the target is spread across the whole window instead.
  const windowDays = Math.max(1 / 24, (endMs - startMs) / DAY_MS);
  const daysLeftExact = msRemaining / DAY_MS;
  const requiredPerDay =
    status === "active"
      ? remainingMinutes / Math.max(daysLeftExact, 1 / 24)
      : status === "upcoming"
        ? targetMinutes / windowDays
        : null;

  const projectedMinutes = notStarted
    ? audioMinutes
    : Math.round(audioMinutes + actualPerDay * daysLeftExact);

  // Where a grantee on a straight line to target would be today. Flat at zero
  // until the window opens.
  const totalMs = Math.max(1, endMs - startMs);
  const progress = Math.min(1, Math.max(0, (now - startMs) / totalMs));
  const expectedToday = targetMinutes * progress;

  return {
    status,
    targetMinutes,
    remainingMinutes,
    daysRemaining,
    daysUntilStart,
    requiredPerDay,
    actualPerDay,
    projectedMinutes,
    deltaVsPace: notStarted ? 0 : Math.round(audioMinutes - expectedToday),
  };
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
