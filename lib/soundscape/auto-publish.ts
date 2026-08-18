/**
 * Auto-published soundscapes — the rule that an analyzed folder *has* a
 * published soundscape, with no separate publish step.
 *
 * Analysis used to be private-by-default: the workbench drew the clock from
 * numbers held in the browser (and mirrored into `ac.soundscapeAnalysis`
 * records), and a public `ac.soundscape` record only existed if the author
 * also clicked Share. Most never did — folders sat fully analyzed with
 * nothing to show on the profile.
 *
 * Now the workbench maintains one living soundscape record per folder,
 * stored at a deterministic rkey — the folder's own — so updating is an
 * idempotent putRecord and "which record is this folder's?" is never a
 * search. A half-analyzed folder is published with the sources analyzed so
 * far; each pass extends the same record.
 *
 * This module is the pure half (no React, no network): grouping analyzed
 * recordings into per-folder drafts, and deciding whether a draft differs
 * from what is already published. `useAutoPublishSoundscapes` owns the
 * timing and the writes.
 */

import { nyquistHz } from "./analysis";
import {
  formatDateRange,
  soundscapeDates,
  type PublishedSoundscape,
  type SoundscapeSource,
} from "./record";

/** One analyzed recording, as the workbench knows it. */
export type AutoPublishEntry = {
  /** AT-URI of the `ac.audio` record. */
  audioUri: string;
  name: string;
  /** AT-URI of the folder (`ac.deployment`) the recording is filed in. */
  deploymentRef: string | null;
  /** Local wall-clock date, `YYYY-MM-DD`. */
  date: string;
  /** Minutes since local midnight (0..1439). */
  minuteOfDay: number;
  /** Max PMN per voice band. */
  pmn: number[];
  sampleRate: number | null;
};

/** A folder the account still holds a record for — the only kind published. */
export type AutoPublishFolder = { uri: string; name: string };

/** Everything needed to write (or skip) one folder's living record. */
export type AutoDraft = {
  folderUri: string;
  folderName: string;
  /** The record's fixed address: the folder's own rkey. */
  rkey: string;
  /** Which recordings the draft covers — order-independent. */
  signature: string;
  sources: SoundscapeSource[];
  ceilingHz: number;
  /** `2026-03-14` or `2026-03-14 – 2026-03-16`, for the generated title. */
  dateLabel: string;
};

/** Last path segment of an AT-URI — its rkey. */
export function rkeyOfUri(uri: string): string | null {
  const rkey = uri.split("/").pop() ?? "";
  return rkey.length > 0 && !rkey.includes(":") ? rkey : null;
}

/**
 * Identity of a source set: which recordings it covers, order-independent.
 * The same signature the share flow uses, so "did anything change?" means the
 * same thing everywhere.
 */
export function sourcesSignature(sources: ReadonlyArray<Pick<SoundscapeSource, "audioUri">>): string {
  return sources
    .map((source) => source.audioUri)
    .sort()
    .join("\n");
}

const DEFAULT_CEILING_SAMPLE_RATE = 48_000;

/**
 * Group every analyzed recording by folder and shape each folder into a
 * publishable draft. Recordings without a folder — or whose folder record is
 * gone — are left out: the living record borrows the folder's identity (its
 * rkey and its name), so without the folder there is nothing to key it to.
 */
export function buildAutoDrafts(
  entries: readonly AutoPublishEntry[],
  folders: readonly AutoPublishFolder[],
): AutoDraft[] {
  const names = new Map(folders.map((folder) => [folder.uri, folder.name]));
  const groups = new Map<string, AutoPublishEntry[]>();
  for (const entry of entries) {
    if (!entry.deploymentRef || !names.has(entry.deploymentRef)) continue;
    if (entry.pmn.length === 0) continue;
    const group = groups.get(entry.deploymentRef);
    if (group) group.push(entry);
    else groups.set(entry.deploymentRef, [entry]);
  }

  const drafts: AutoDraft[] = [];
  for (const [folderUri, group] of groups) {
    const rkey = rkeyOfUri(folderUri);
    if (!rkey) continue;
    const sources: SoundscapeSource[] = group
      .map((entry) => ({
        audioUri: entry.audioUri,
        name: entry.name,
        date: entry.date,
        minuteOfDay: entry.minuteOfDay,
        pmn: entry.pmn,
      }))
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay || a.date.localeCompare(b.date));
    const maxRate = Math.max(
      DEFAULT_CEILING_SAMPLE_RATE,
      ...group.map((entry) => entry.sampleRate ?? 0),
    );
    drafts.push({
      folderUri,
      folderName: names.get(folderUri)!,
      rkey,
      signature: sourcesSignature(sources),
      sources,
      ceilingHz: nyquistHz(maxRate),
      dateLabel: formatDateRange(soundscapeDates(sources)),
    });
  }
  // Stable order so callers can diff two passes without re-sorting.
  return drafts.sort((a, b) => a.folderUri.localeCompare(b.folderUri));
}

/** What an auto-update pass should do with one folder's record. */
export type AutoWriteDecision = {
  write: boolean;
  /** The published note to carry forward — the record's own words, never
   *  overwritten by an automatic pass. */
  note: string | undefined;
};

/**
 * Whether the living record needs rewriting. Content is compared by source
 * set and title — the two things an automatic pass generates. The note is
 * the author's own (written when sharing) and is always preserved.
 */
export function decideAutoWrite(
  existing: PublishedSoundscape | null,
  draft: { signature: string; title: string },
): AutoWriteDecision {
  if (!existing) return { write: true, note: undefined };
  const note = existing.note ?? undefined;
  const unchanged =
    sourcesSignature(existing.sources) === draft.signature && existing.title === draft.title;
  return { write: !unchanged, note };
}
