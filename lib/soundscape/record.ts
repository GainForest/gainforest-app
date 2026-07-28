/**
 * A *published* soundscape — the shareable form of the 24-hour clock.
 *
 * Analysis itself is a browser-local affair: `lib/soundscape/pmn.ts` turns a
 * multi-megabyte archival WAV into five numbers, and `pmn-cache.ts` keeps
 * those numbers in localStorage. That is enough to draw a clock for yourself
 * and nobody else — a reader of a feed post has neither the cache nor the
 * appetite to re-download gigabytes of audio.
 *
 * So sharing means writing the *result* down: one small record carrying the
 * per-recording band maxima plus a pointer back to each source `ac.audio`
 * record. Anyone can then draw the same dial instantly, and clicking a time
 * still plays the real recording — fetched from the owner's PDS on demand,
 * exactly one recording at a time.
 *
 * This module is pure (no React, no DOM, no network) so it can be unit
 * tested; `app/_lib/soundscape-record.ts` owns reading and writing it.
 */

import { buildSoundscapePoints, FREQUENCY_BANDS, type SoundscapePoint } from "./analysis";

export const SOUNDSCAPE_COLLECTION = "app.gainforest.ac.soundscape";

/**
 * Upper bound on how many recordings one published soundscape carries.
 *
 * An atproto record must fit comfortably inside the PDS's ~1 MB ceiling; at
 * roughly 160 bytes of JSON per entry this caps a record near 320 kB, which
 * leaves ample headroom. Above the cap the quietest recordings are dropped
 * (see `capSourceRecordings`) — the dial keeps its shape because the clock
 * only ever draws the loudest recording of each minute anyway.
 */
export const MAX_SOUNDSCAPE_RECORDINGS = 2000;

export const MAX_SOUNDSCAPE_TITLE_LENGTH = 256;
export const MAX_SOUNDSCAPE_NOTE_LENGTH = 2000;

/** One analyzed recording, as stored in a published soundscape. */
export type SoundscapeSource = {
  /** AT-URI of the `app.gainforest.ac.audio` record this came from. */
  audioUri: string;
  /** The recording's file name, for the "now playing" line. */
  name: string;
  /** Local wall-clock date of the recording, `YYYY-MM-DD`. */
  date: string;
  /** Minutes since local midnight (0..1439). */
  minuteOfDay: number;
  /** Max Power-Minus-Noise per frequency band, one per `FREQUENCY_BANDS`. */
  pmn: number[];
};

/** The frequency band edges a soundscape was binned with, frozen at publish
 *  time so a later change to `FREQUENCY_BANDS` can't silently relabel an
 *  already-published dial. */
export type SoundscapeBand = {
  id: string;
  minHz: number;
  /** `null` = open-ended, closed at `ceilingHz` when drawn. */
  maxHz: number | null;
};

export type SoundscapeDraft = {
  title: string;
  /** Optional caption written by the author. */
  note?: string;
  /** Highest frequency the source recordings can represent. */
  ceilingHz: number;
  sources: SoundscapeSource[];
};

/** A published soundscape, parsed back out of its record. */
export type PublishedSoundscape = {
  title: string;
  note: string | null;
  ceilingHz: number;
  bands: SoundscapeBand[];
  sources: SoundscapeSource[];
  createdAt: string | null;
};

function currentBands(): SoundscapeBand[] {
  return FREQUENCY_BANDS.map((band) => ({ id: band.id, minHz: band.minHz, maxHz: band.maxHz }));
}

/** Total loudness of a recording — used to decide what survives the cap. */
function loudness(source: SoundscapeSource): number {
  return source.pmn.reduce((sum, value) => sum + value, 0);
}

/**
 * Trim a source list to `max` entries, keeping the loudest recording of each
 * minute-of-day first (those are the ones the dial draws), then the loudest of
 * whatever is left. Order is normalised to earliest-minute-first so a stored
 * record reads chronologically.
 */
export function capSourceRecordings(
  sources: SoundscapeSource[],
  max = MAX_SOUNDSCAPE_RECORDINGS,
): SoundscapeSource[] {
  const byTime = (a: SoundscapeSource, b: SoundscapeSource) =>
    a.minuteOfDay - b.minuteOfDay || a.date.localeCompare(b.date);
  if (sources.length <= max) return [...sources].sort(byTime);

  const loudestPerMinute = new Map<number, SoundscapeSource>();
  for (const source of sources) {
    const existing = loudestPerMinute.get(source.minuteOfDay);
    if (!existing || loudness(source) > loudness(existing)) loudestPerMinute.set(source.minuteOfDay, source);
  }
  const kept = [...loudestPerMinute.values()];
  if (kept.length >= max) {
    return kept
      .sort((a, b) => loudness(b) - loudness(a))
      .slice(0, max)
      .sort(byTime);
  }
  const keptUris = new Set(kept.map((source) => source.audioUri));
  const rest = sources
    .filter((source) => !keptUris.has(source.audioUri))
    .sort((a, b) => loudness(b) - loudness(a))
    .slice(0, max - kept.length);
  return [...kept, ...rest].sort(byTime);
}

/** The distinct dates a soundscape covers, earliest first. */
export function soundscapeDates(sources: SoundscapeSource[]): string[] {
  return [...new Set(sources.map((source) => source.date))].sort();
}

/** `2026-03-14` or `2026-03-14 – 2026-03-16`; empty when there are no sources. */
export function formatSoundscapeDateRange(sources: SoundscapeSource[]): string {
  const dates = soundscapeDates(sources);
  if (dates.length === 0) return "";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} \u2013 ${dates[dates.length - 1]}`;
}

/** Build the record body for `app.gainforest.ac.soundscape`. */
export function buildSoundscapeRecord(
  draft: SoundscapeDraft,
  createdAt = new Date().toISOString(),
): Record<string, unknown> {
  const sources = capSourceRecordings(draft.sources);
  const record: Record<string, unknown> = {
    $type: SOUNDSCAPE_COLLECTION,
    title: draft.title.trim().slice(0, MAX_SOUNDSCAPE_TITLE_LENGTH),
    ceilingHz: Math.round(draft.ceilingHz),
    bands: currentBands(),
    dates: soundscapeDates(sources),
    recordings: sources.map((source) => ({
      audio: source.audioUri,
      name: source.name,
      date: source.date,
      minuteOfDay: source.minuteOfDay,
      // Integers: PMN values run into the tens of thousands, so a fraction of
      // a decibel-sum is far below anything the dial can show.
      pmn: source.pmn.map((value) => Math.round(value)),
    })),
    createdAt,
  };
  const note = draft.note?.trim();
  if (note) record.note = note.slice(0, MAX_SOUNDSCAPE_NOTE_LENGTH);
  return record;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBands(value: unknown): SoundscapeBand[] {
  if (!Array.isArray(value)) return currentBands();
  const bands = value.flatMap((entry) => {
    if (!isRecordValue(entry) || typeof entry.id !== "string" || typeof entry.minHz !== "number") return [];
    const maxHz = typeof entry.maxHz === "number" ? entry.maxHz : null;
    return [{ id: entry.id, minHz: entry.minHz, maxHz }];
  });
  return bands.length > 0 ? bands : currentBands();
}

function parseSource(value: unknown, bandCount: number): SoundscapeSource | null {
  if (!isRecordValue(value)) return null;
  const audioUri = typeof value.audio === "string" ? value.audio : null;
  const date = typeof value.date === "string" ? value.date : null;
  const minuteOfDay = typeof value.minuteOfDay === "number" ? Math.round(value.minuteOfDay) : null;
  if (!audioUri || !date || minuteOfDay === null || minuteOfDay < 0 || minuteOfDay > 1439) return null;
  if (!Array.isArray(value.pmn)) return null;
  // Pad or trim to the record's own band count so a soundscape published with
  // a different set of bands still draws (missing bands read as silence).
  const pmn = Array.from({ length: bandCount }, (_, index) => {
    const entry = (value.pmn as unknown[])[index];
    return typeof entry === "number" && Number.isFinite(entry) ? entry : 0;
  });
  return {
    audioUri,
    name: typeof value.name === "string" ? value.name : "",
    date,
    minuteOfDay,
    pmn,
  };
}

/** Parse a stored record; returns null when it isn't a usable soundscape. */
export function parseSoundscapeRecord(value: unknown): PublishedSoundscape | null {
  if (!isRecordValue(value)) return null;
  const bands = parseBands(value.bands);
  const rawSources = Array.isArray(value.recordings) ? value.recordings : [];
  const sources = rawSources
    .map((entry) => parseSource(entry, bands.length))
    .filter((entry): entry is SoundscapeSource => entry !== null);
  if (sources.length === 0) return null;
  const ceilingHz =
    typeof value.ceilingHz === "number" && value.ceilingHz > 0 ? value.ceilingHz : 24_000;
  return {
    title: typeof value.title === "string" ? value.title : "",
    note: typeof value.note === "string" && value.note.trim() ? value.note.trim() : null,
    ceilingHz,
    bands,
    sources,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
  };
}

/** Fold a published soundscape's sources onto the 24-hour dial. Delegates to
 *  `buildSoundscapePoints` so a shared clock averages its days exactly like
 *  the one it was shared from — the two must never tell different stories
 *  about the same recordings. */
export function soundscapePoints(sources: SoundscapeSource[]): SoundscapePoint[] {
  return buildSoundscapePoints(sources);
}

/** The recording a click on `minuteOfDay` should play. The dial draws the
 *  average of everything in that minute, so no single recording is "the" one
 *  — play the loudest. */
export function sourceForMinute(sources: SoundscapeSource[], minuteOfDay: number): SoundscapeSource | null {
  let best: SoundscapeSource | null = null;
  for (const source of sources) {
    if (source.minuteOfDay !== minuteOfDay) continue;
    if (!best || loudness(source) > loudness(best)) best = source;
  }
  return best;
}

// ── Permalinks ──────────────────────────────────────────────────────────────

/** Where a published soundscape can be read and played. */
export function soundscapeHref(did: string, rkey: string): string {
  return `/soundscape/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

/**
 * Pull a soundscape's (did, rkey) back out of a link — used by the feed to
 * recognise a post that shares one and draw the dial inline instead of a bare
 * URL. Accepts absolute links (any host, so staging and production both work)
 * and site-relative ones.
 */
export function parseSoundscapeHref(value: string): { did: string; rkey: string } | null {
  const path = (() => {
    try {
      return new URL(value).pathname;
    } catch {
      return value.startsWith("/") ? value : null;
    }
  })();
  if (!path) return null;
  const match = path.match(/^\/soundscape\/([^/]+)\/([^/?#]+)\/?$/);
  if (!match) return null;
  const did = decodeURIComponent(match[1]);
  const rkey = decodeURIComponent(match[2]);
  if (!did.startsWith("did:") || !rkey) return null;
  return { did, rkey };
}

export type SoundscapeLinkInText = {
  did: string;
  rkey: string;
  /** The link exactly as written in the post, so an edit can put it back. */
  link: string;
  /** The post's text with the soundscape link taken out — the dial is drawn
   *  in its place, so showing the raw URL as well would be noise. */
  text: string;
};

/**
 * Find the soundscape a post shares. Sharing appends the permalink to the
 * post text (feed posts carry no media of their own), so a reader's feed can
 * recognise it and draw the playable dial inline. Only the first link counts —
 * one post shares one soundscape.
 */
export function extractSoundscapeLink(text: string | null | undefined): SoundscapeLinkInText | null {
  if (!text) return null;
  const tokens = text.match(/\S+/g);
  if (!tokens) return null;
  for (const token of tokens) {
    const parsed = parseSoundscapeHref(token);
    if (!parsed) continue;
    const stripped = text.replace(token, "").replace(/[ \t]+\n/g, "\n").trim();
    return { ...parsed, link: token, text: stripped };
  }
  return null;
}
