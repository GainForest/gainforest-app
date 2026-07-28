/**
 * Deleting uploaded recordings.
 *
 * One recording is three things: the `ac.audio` record, the soundscape
 * analysis derived from it, and the archival original in object storage. All
 * three have to go, and only the record deletion may fail loudly — a leftover
 * analysis or an orphaned WAV is invisible to the user and must never turn a
 * deletion they asked for into an error.
 *
 * Shared by the profile's Audio tab (drive-style multi-select) and the
 * soundscape page (deleting a whole folder), so a recording disappears the
 * same way wherever it is deleted from.
 */

import { deleteRecord } from "@/app/(manage)/manage/_lib/mutations";
import { SOUNDSCAPE_ANALYSIS_COLLECTION } from "@/lib/soundscape/analysis-record";
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
};

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
  let done = 0;

  for (const item of items) {
    try {
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

  return { deleted, failed };
}
