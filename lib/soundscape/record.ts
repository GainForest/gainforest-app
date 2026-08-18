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

/** `contentType` marking a timeline attachment as a soundscape. Written when
 *  one is added to a project update, read back by the timeline viewer so it
 *  draws the dial instead of a plain link. */
export const SOUNDSCAPE_ATTACHMENT_CONTENT_TYPE = "soundscape";

/**
 * Upper bound on how many recordings one published soundscape carries.
 *
 * An atproto record must fit comfortably inside the PDS's ~1 MB ceiling; at
 * roughly 160 bytes of JSON per entry this caps a record near 320 kB, which
 * leaves ample headroom. Above the cap an even sample is kept (see
 * `capSourceRecordings`) — never a selection by loudness, which would bias
 * the average the dial now draws.
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

/** Total loudness of a recording. */
function loudness(source: SoundscapeSource): number {
  return source.pmn.reduce((sum, value) => sum + value, 0);
}

/**
 * Positions of an n-item list in repeated-midpoint order: the middle first,
 * then the middles of each half, and so on. Any prefix of the result is spread
 * roughly evenly across the whole list, so taking "the first k" of a run of
 * dates samples the whole deployment instead of its first few days.
 */
function spreadOrder(length: number): number[] {
  const order: number[] = [];
  const ranges: Array<[number, number]> = [[0, length - 1]];
  while (ranges.length > 0) {
    const [low, high] = ranges.shift()!;
    if (low > high) continue;
    const middle = (low + high) >> 1;
    order.push(middle);
    ranges.push([low, middle - 1], [middle + 1, high]);
  }
  return order;
}

/**
 * Trim a source list to `max` entries by taking an even sample: one recording
 * from each time of day per pass, and within a time of day, dates spread
 * across the whole deployment.
 *
 * Deliberately blind to loudness. The dial averages the recordings at each
 * time of day and shades their spread, so dropping the quiet ones would push
 * the average up and cut off the very tail that makes the spread visible —
 * a published clock would then read louder and steadier than the library it
 * came from. An even sample keeps both unbiased.
 *
 * Each pass starts at a different time of day, so when the budget runs out
 * mid-pass the shortfall lands somewhere different rather than always thinning
 * the same end of the day. Order is normalised to earliest-minute-first so a
 * stored record reads chronologically.
 */
export function capSourceRecordings(
  sources: SoundscapeSource[],
  max = MAX_SOUNDSCAPE_RECORDINGS,
): SoundscapeSource[] {
  const byTime = (a: SoundscapeSource, b: SoundscapeSource) =>
    a.minuteOfDay - b.minuteOfDay || a.date.localeCompare(b.date);
  if (sources.length <= max) return [...sources].sort(byTime);

  const byMinute = new Map<number, SoundscapeSource[]>();
  for (const source of sources) {
    const group = byMinute.get(source.minuteOfDay);
    if (group) group.push(source);
    else byMinute.set(source.minuteOfDay, [source]);
  }
  const minutes = [...byMinute.keys()].sort((a, b) => a - b);
  // Within a time of day: chronological, then reordered so any prefix covers
  // the whole run of dates.
  const queues = minutes.map((minute) => {
    const group = byMinute.get(minute)!.sort((a, b) => a.date.localeCompare(b.date));
    return spreadOrder(group.length).map((index) => group[index]);
  });

  const kept: SoundscapeSource[] = [];
  const deepest = Math.max(...queues.map((queue) => queue.length));
  for (let pass = 0; pass < deepest && kept.length < max; pass++) {
    for (let step = 0; step < queues.length && kept.length < max; step++) {
      const queue = queues[(step + pass) % queues.length];
      const source = queue[pass];
      if (source) kept.push(source);
    }
  }
  return kept.sort(byTime);
}

/** The distinct dates a soundscape covers, earliest first. */
export function soundscapeDates(sources: SoundscapeSource[]): string[] {
  return [...new Set(sources.map((source) => source.date))].sort();
}

/**
 * The recorder/deployment name a soundscape was built from, recovered from its
 * generated title. Titles are always app-written as `{Prefix} · {name} · {dates}`
 * (from a named folder) or `{Prefix} · {dates}` (no folder). The localized
 * prefix word and the date format vary, but the `·` separator is constant
 * across every locale, so the name is simply the middle segment. Returns null
 * when the title carries no name — the caller then keeps the generic heading.
 */
export function soundscapeDeploymentName(title: string | null | undefined): string | null {
  if (!title) return null;
  const parts = title.split("\u00b7").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const name = parts.slice(1, -1).join(" \u00b7 ").trim();
  return name || null;
}

/** `2026-03-14` or `2026-03-14 – 2026-03-16`; empty when there are no dates. */
export function formatDateRange(dates: string[]): string {
  if (dates.length === 0) return "";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} \u2013 ${dates[dates.length - 1]}`;
}

/** `2026-03-14` or `2026-03-14 – 2026-03-16`; empty when there are no sources. */
export function formatSoundscapeDateRange(sources: SoundscapeSource[]): string {
  return formatDateRange(soundscapeDates(sources));
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

/**
 * A published soundscape as it appears in a *list* — enough to recognise and
 * choose one, and nothing else.
 *
 * A soundscape record carries up to {@link MAX_SOUNDSCAPE_RECORDINGS} entries,
 * so a picker that parsed every record in full would hold megabytes of band
 * values it never draws. The dates and the count are all a chooser shows, and
 * both are already written at the top of the record.
 */
export type SoundscapeSummary = {
  title: string;
  note: string | null;
  /** Distinct local dates the recordings cover, earliest first. */
  dates: string[];
  recordingCount: number;
  createdAt: string | null;
};

/**
 * Summarise a stored record without keeping its recordings. Returns null for
 * anything unusable — same bar as {@link parseSoundscapeRecord}, so a listing
 * never offers a soundscape that would fail to draw once opened.
 */
export function parseSoundscapeSummary(value: unknown): SoundscapeSummary | null {
  if (!isRecordValue(value)) return null;
  const recordings = Array.isArray(value.recordings) ? value.recordings : [];
  if (recordings.length === 0) return null;
  // `dates` is written at publish time; older or hand-written records without
  // it fall back to reading the dates off the recordings themselves.
  const dates = Array.isArray(value.dates)
    ? [...new Set(value.dates.filter((entry): entry is string => typeof entry === "string"))].sort()
    : [
        ...new Set(
          recordings.flatMap((entry) =>
            isRecordValue(entry) && typeof entry.date === "string" ? [entry.date] : [],
          ),
        ),
      ].sort();
  return {
    title: typeof value.title === "string" ? value.title : "",
    note: typeof value.note === "string" && value.note.trim() ? value.note.trim() : null,
    dates,
    recordingCount: recordings.length,
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
