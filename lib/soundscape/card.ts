/**
 * Pure helpers for the compact soundscape card — the calm, glanceable form a
 * published soundscape takes in a feed post or on an evidence timeline.
 *
 * The card deliberately shows less than the full explorer: per-band outlines
 * smoothed into a handful of angular bins, four hour marks, one needle, one
 * player bar. These functions do the data reduction; the component
 * (app/soundscape/_components/SoundscapeCard.tsx) only draws.
 */

import type { SoundscapeSource } from "./record";

/** How many angular bins the card's dial reduces a day to. Enough to keep
 *  the dawn-chorus / night-insect shape, few enough to read as an outline. */
export const CARD_BIN_COUNT = 48;

export type CardOutlinePoint = {
  /** Center of the bin, minutes since midnight. */
  minuteOfDay: number;
  /** Max PMN per band among sources in this bin. */
  pmn: number[];
};

/**
 * Fold sources into `binCount` angular buckets — the MEAN per band per
 * bucket, matching the full dial's averaging (a typical day, not the
 * loudest one; see buildSoundscapePoints). Only buckets that actually
 * contain a recording are returned, in clock order — silence stays a gap
 * instead of a spike to zero.
 */
export function cardOutline(
  sources: SoundscapeSource[],
  bandCount: number,
  binCount = CARD_BIN_COUNT,
): CardOutlinePoint[] {
  const binMinutes = 1440 / binCount;
  const byBin = new Map<number, { sums: number[]; count: number }>();
  for (const source of sources) {
    const bin = Math.min(binCount - 1, Math.floor((((source.minuteOfDay % 1440) + 1440) % 1440) / binMinutes));
    let entry = byBin.get(bin);
    if (!entry) {
      entry = { sums: new Array<number>(bandCount).fill(0), count: 0 };
      byBin.set(bin, entry);
    }
    entry.count++;
    for (let band = 0; band < bandCount; band++) {
      entry.sums[band] += source.pmn[band] ?? 0;
    }
  }
  return [...byBin.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bin, { sums, count }]) => ({
      minuteOfDay: Math.round(bin * binMinutes + binMinutes / 2),
      pmn: sums.map((sum) => sum / count),
    }));
}

/** The recording a tap at `minuteOfDay` should play: the closest one on the
 *  dial (wrapping around midnight), loudest first among ties at that minute. */
export function nearestSource(sources: SoundscapeSource[], minuteOfDay: number): SoundscapeSource | null {
  let best: SoundscapeSource | null = null;
  let bestDistance = Infinity;
  const loudness = (source: SoundscapeSource) => source.pmn.reduce((sum, value) => sum + value, 0);
  for (const source of sources) {
    const raw = Math.abs(source.minuteOfDay - minuteOfDay);
    const distance = Math.min(raw, 1440 - raw);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && loudness(source) > loudness(best))
    ) {
      best = source;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Human date-range label for the card header, e.g. `3 – 7 Apr 2024` (en-GB)
 * or `Apr 3 – 7, 2024` (en-US) — delegated to `Intl.DateTimeFormat`'s range
 * formatting so every locale gets its own convention. `dates` are the
 * record's `YYYY-MM-DD` strings (already sorted).
 */
export function formatCardDateRange(dates: string[], locale: string): string {
  const parse = (value: string): Date | null => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  };
  const first = dates.length > 0 ? parse(dates[0]) : null;
  const last = dates.length > 0 ? parse(dates[dates.length - 1]) : null;
  if (!first || !last) return dates.join(" \u2013 ");

  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return first.getTime() === last.getTime() ? format.format(first) : format.formatRange(first, last);
}
