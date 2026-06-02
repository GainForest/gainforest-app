/**
 * Pure cumulative / distinct / per-day series math, shared by the server-side
 * hero trends (trends.ts) and the client-side stat bands (RecordExplorer,
 * Dashboard). Kept free of any fetch/IO so it tree-shakes cleanly into client
 * bundles. Everything is built off a record's `createdAt`/`occurredAt`.
 */

/** A daily time series for one metric. */
export type MetricSeries = {
  /** ISO date axis (YYYY-MM-DD), oldest → newest. */
  days: string[];
  /** Value at the end of each day. Same length as `days`. */
  values: number[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

/** Day axis (day-start epoch ms + ISO strings) spanning earliest → today. */
function dayAxis(allTimes: number[]): { days: number[]; isoDays: string[] } {
  const valid = allTimes.filter((t) => !Number.isNaN(t));
  if (valid.length === 0) return { days: [], isoDays: [] };
  const startDay = Math.floor(Math.min(...valid) / DAY_MS) * DAY_MS;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDay = today.getTime();
  const days: number[] = [];
  for (let d = startDay; d <= endDay && days.length < 2000; d += DAY_MS) days.push(d);
  return { days, isoDays: days.map((d) => new Date(d).toISOString().slice(0, 10)) };
}

/** Running total at the end of each day in `days`, from timestamped increments. */
function cumulativeOnAxis(days: number[], events: { t: number; inc: number }[]): number[] {
  const sorted = [...events].filter((e) => !Number.isNaN(e.t)).sort((a, b) => a.t - b.t);
  const out: number[] = [];
  let i = 0;
  let acc = 0;
  for (const day of days) {
    const cutoff = day + DAY_MS;
    while (i < sorted.length && sorted[i].t < cutoff) {
      acc += sorted[i].inc;
      i++;
    }
    out.push(acc);
  }
  return out;
}

/** Cumulative running total (counts when inc=1, USD when inc=amount). */
export function seriesFromIncrements(events: { t: number; inc: number }[]): MetricSeries | null {
  const { days, isoDays } = dayAxis(events.map((e) => e.t));
  if (days.length === 0) return null;
  return { days: isoDays, values: cumulativeOnAxis(days, events) };
}

/** Cumulative count of distinct keys seen up to the end of each day. */
export function seriesFromDistinct(events: { t: number; key: string | null | undefined }[]): MetricSeries | null {
  const clean = events.filter((e) => !Number.isNaN(e.t) && e.key);
  const { days, isoDays } = dayAxis(clean.map((e) => e.t));
  if (days.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a.t - b.t);
  const seen = new Set<string>();
  const values: number[] = [];
  let i = 0;
  for (const day of days) {
    const cutoff = day + DAY_MS;
    while (i < sorted.length && sorted[i].t < cutoff) {
      seen.add(sorted[i].key as string);
      i++;
    }
    values.push(seen.size);
  }
  return { days: isoDays, values };
}

/** Running average (cumulative sum ÷ cumulative count) at each day. */
export function seriesFromAverage(events: { t: number; value: number }[]): MetricSeries | null {
  const clean = events.filter((e) => !Number.isNaN(e.t));
  const { days, isoDays } = dayAxis(clean.map((e) => e.t));
  if (days.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a.t - b.t);
  const values: number[] = [];
  let i = 0;
  let sum = 0;
  let count = 0;
  for (const day of days) {
    const cutoff = day + DAY_MS;
    while (i < sorted.length && sorted[i].t < cutoff) {
      sum += sorted[i].value;
      count += 1;
      i++;
    }
    values.push(count > 0 ? sum / count : 0);
  }
  return { days: isoDays, values };
}

/** Per-day (non-cumulative) counts over the most recent `windowDays` — an
 *  activity line for windowed metrics like "Last 30 days". */
export function dailyCountSeries(times: number[], windowDays: number): MetricSeries | null {
  const valid = times.filter((t) => !Number.isNaN(t));
  if (valid.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = today.getTime();
  const start = end - (windowDays - 1) * DAY_MS;
  const buckets = new Map<number, number>();
  for (let d = start; d <= end; d += DAY_MS) buckets.set(d, 0);
  for (const t of valid) {
    const day = Math.floor(t / DAY_MS) * DAY_MS;
    if (buckets.has(day)) buckets.set(day, buckets.get(day)! + 1);
  }
  const days = [...buckets.keys()].sort((a, b) => a - b);
  return {
    days: days.map((d) => new Date(d).toISOString().slice(0, 10)),
    values: days.map((d) => buckets.get(d)!),
  };
}
