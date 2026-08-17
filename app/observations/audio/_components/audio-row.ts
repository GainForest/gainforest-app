/**
 * Pure helpers behind the audio explore project rows.
 *
 * The page's rule is that each fact lives at exactly one level: the row owns
 * project identity and its totals, a slot owns its kind, its date and the size
 * of the one folder it stands for. These functions resolve those facts;
 * the components only draw them.
 *
 * A soundscape is always built from a single folder (`ac.deployment`), so a
 * soundscape and a raw upload slot are tied together by `deploymentRef` — never
 * by guessing from a project that happens to have one folder.
 */

import type { AudioProjectUpload } from "@/app/_lib/audio-projects";
import type { NetworkSoundscape } from "@/app/_lib/soundscape-explore";

/** Trailing `· 2024-04-04` or `· 2024-04-03 – 2024-04-05` on a generated title. */
const TRAILING_DATE = /\s*[·•]\s*\d{4}-\d{2}-\d{2}(?:\s*[–—-]\s*\d{4}-\d{2}-\d{2})?\s*$/;

/**
 * The title a soundscape slot shows. The slot header already states the date
 * in the reader's own format, so a generated title's trailing ISO date is
 * dropped — but everything else is kept, because that is where the folder it
 * came from is named. Titles without a trailing date are left untouched.
 */
export function displaySoundscapeTitle(value: string | null | undefined, fallback: string): string {
  const title = value?.trim();
  if (!title) return fallback;
  return title.replace(TRAILING_DATE, "").trim() || fallback;
}

/**
 * The upload slot a soundscape was built from, matched on the folder both
 * point at. Returns null when the folder is unknown, so the slot falls back to
 * facts the soundscape carries itself rather than borrowing another folder's.
 */
export function uploadForSoundscape(
  item: NetworkSoundscape,
  uploads: AudioProjectUpload[],
): AudioProjectUpload | null {
  const ref = item.deploymentRef;
  if (!ref) return null;
  return uploads.find((upload) => upload.deploymentRef === ref) ?? null;
}

/** True when this soundscape and this upload describe the same folder. */
export function sharesFolder(item: NetworkSoundscape, upload: AudioProjectUpload): boolean {
  return Boolean(item.deploymentRef) && item.deploymentRef === upload.deploymentRef;
}

/**
 * How many files sit in the folder behind a soundscape slot. The folder total
 * is the honest number when it is known; otherwise the soundscape can only
 * speak for the recordings it was built from.
 */
export function countForSoundscape(
  item: NetworkSoundscape,
  upload: AudioProjectUpload | null,
): number {
  if (upload && upload.recordingCount > 0) return upload.recordingCount;
  return item.soundscape.sources.length;
}

/**
 * Totals for a row we only know through its published soundscapes.
 *
 * Several soundscapes can be built from one folder (a single day, then the
 * whole week), so counting per soundscape would report one recorder as many
 * and add its files up repeatedly. Group by folder, take the largest reading
 * each folder gives, and only then add up.
 */
export function soundscapeOnlyTotals(items: NetworkSoundscape[]): {
  recorderCount: number;
  recordingCount: number;
} {
  const byFolder = new Map<string, number>();
  let knownFolders = 0;
  for (const item of items) {
    if (item.deploymentRef) knownFolders += byFolder.has(item.deploymentRef) ? 0 : 1;
    // An unresolved folder can't be proven distinct, so it shares one bucket
    // rather than inflating the recorder count.
    const key = item.deploymentRef ?? "unknown-folder";
    byFolder.set(key, Math.max(byFolder.get(key) ?? 0, item.soundscape.sources.length));
  }
  return {
    // At least one recorder must exist for a soundscape to have been built.
    recorderCount: Math.max(1, knownFolders),
    recordingCount: [...byFolder.values()].reduce((total, count) => total + count, 0),
  };
}

/** Newest of a set of `YYYY-MM-DD` keys, as ms. Midday keeps the day from
 *  sliding when the viewer sits west of the recorder. */
export function dateKeysMs(dates: string[]): number {
  return Math.max(
    0,
    ...dates.map((date) => {
      const time = Date.parse(`${date}T12:00:00`);
      return Number.isNaN(time) ? 0 : time;
    }),
  );
}

/** When a soundscape was published, as ms. */
export function publishedMs(item: NetworkSoundscape): number {
  const time = Date.parse(item.soundscape.createdAt ?? "");
  return Number.isNaN(time) ? 0 : time;
}

/** Newest day a soundscape covers, as ms. */
export function recordedMs(item: NetworkSoundscape): number {
  const dates = [...new Set(item.soundscape.sources.map((source) => source.date))].sort();
  const last = dates[dates.length - 1];
  return last ? dateKeysMs([last]) : 0;
}

/** When a folder last received an upload, as ms. */
export function uploadedMs(upload: AudioProjectUpload): number {
  const time = upload.createdAt ? Date.parse(upload.createdAt) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

/** The `YYYY-MM-DD` keys a recordings slot puts in its header. Falls back to
 *  the upload's own moment when no recording carried a timestamp. */
export function slotDateKeys(upload: AudioProjectUpload): string[] {
  if (upload.recordedDates.length > 0) return upload.recordedDates;
  const key = upload.createdAt?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  return key ? [key] : [];
}
