/**
 * Deleting uploaded recordings.
 *
 * One recording is more than its `ac.audio` record: the soundscape analysis
 * derived from it, the archival original in object storage, and every
 * identification drawn on it — each of those is a box on a stretch of *this*
 * audio and cannot outlive it. All of them have to go.
 *
 * Order matters. Identifications are deleted first, and a recording whose
 * identifications could not all be deleted is left alone and reported as
 * failed, so a retry finishes the job. Deleting the audio first and its
 * identifications after would, on any failure, leave public observations
 * pointing at audio that no longer exists.
 *
 * The analysis and the storage object are the opposite case — invisible
 * leftovers that must never turn a deletion the user asked for into an error
 * — so they are best effort, after the record is gone.
 *
 * Shared by the profile's Audio tab (drive-style multi-select) and the folder
 * delete on both the Audio and soundscape tabs, so a recording disappears the
 * same way wherever it is deleted from.
 */

import { deleteRecord } from "@/app/(manage)/manage/_lib/mutations";
import { SOUNDSCAPE_ANALYSIS_COLLECTION } from "@/lib/soundscape/analysis-record";
import {
  deleteAudioOccurrence,
  listAudioOccurrencesForRecordings,
  type AudioOccurrenceItem,
} from "./audiomoth/occurrences";
import {
  AC_AUDIO_COLLECTION,
  audiomothStorageKey,
  deleteArchivedOriginals,
  type AcAudioListItem,
} from "./ac-audio";

export type DeleteRecordingsOutcome = {
  /** AT-URIs of the recordings that are gone. */
  deleted: Set<string>;
  /** AT-URIs that are still there — worth keeping selected for a retry. */
  failed: Set<string>;
  /** How many identifications went with them. */
  deletedIdentifications: number;
};

/**
 * How many identifications are drawn on these recordings — what a delete
 * would take with it. Best effort: a repo that cannot be listed reports 0,
 * and the warning falls back to saying identifications go without a number.
 */
export async function countIdentificationsOn(
  recordings: readonly AcAudioListItem[],
  signal?: AbortSignal,
): Promise<number> {
  const did = recordings[0]?.did;
  if (!did) return 0;
  const items = await listAudioOccurrencesForRecordings(
    did,
    recordings.map((item) => item.uri),
    signal,
  );
  return items.length;
}

export async function deleteRecordings({
  items,
  survivors,
  repo,
  onProgress,
}: {
  items: readonly AcAudioListItem[];
  /**
   * Every recording that stays behind. Duplicate uploads can share one
   * archival original, so an object in storage is only removed when no
   * surviving record still points at it.
   */
  survivors: readonly AcAudioListItem[];
  /** Group repo DID, when deleting from an organization's profile. */
  repo?: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<DeleteRecordingsOutcome> {
  const repoOptions = repo ? { repo } : undefined;
  const deleted = new Set<string>();
  const failed = new Set<string>();
  let deletedIdentifications = 0;
  let done = 0;

  /* One listing for the whole batch, grouped by the recording each
     identification was drawn on. A repo that cannot be listed must not block
     the deletion: the recordings still go, and any identification left over
     is the pre-existing status quo. */
  const identifications = new Map<string, AudioOccurrenceItem[]>();
  const did = items[0]?.did;
  if (did) {
    const found = await listAudioOccurrencesForRecordings(
      did,
      items.map((item) => item.uri),
    ).catch(() => [] as AudioOccurrenceItem[]);
    for (const item of found) {
      const list = identifications.get(item.sourceAudioUri) ?? [];
      list.push(item);
      identifications.set(item.sourceAudioUri, list);
    }
  }

  for (const item of items) {
    try {
      for (const identification of identifications.get(item.uri) ?? []) {
        await deleteAudioOccurrence(identification, repoOptions);
        deletedIdentifications += 1;
      }
      await deleteRecord(AC_AUDIO_COLLECTION, item.rkey, repoOptions);
      deleted.add(item.uri);
      // The soundscape analysis describes audio that no longer exists.
      await deleteRecord(SOUNDSCAPE_ANALYSIS_COLLECTION, item.rkey, repoOptions).catch(() => {});
    } catch {
      failed.add(item.uri);
    }
    done += 1;
    onProgress?.(done, items.length);
  }

  if (deleted.size > 0) {
    const survivingKeys = new Set(
      survivors
        .map((item) => audiomothStorageKey(item.accessUri))
        .filter((key): key is string => key !== null),
    );
    const removableKeys = new Set(
      items
        .filter((item) => deleted.has(item.uri))
        .map((item) => audiomothStorageKey(item.accessUri))
        .filter((key): key is string => key !== null && !survivingKeys.has(key)),
    );
    if (removableKeys.size > 0) await deleteArchivedOriginals(removableKeys);
  }

  return { deleted, failed, deletedIdentifications };
}
