import type { OccurrenceRecord } from "@/app/_lib/indexer";

type LabelEvidenceRecord = Pick<OccurrenceRecord, "imageRef" | "audioRef" | "audioUrl" | "media">;

/**
 * Labelers only review evidence that can actually be opened. Photo-like rows
 * must carry a stored image/spectrogram blob reference; a filename in
 * `associatedMedia`, an external thumbnail, or an AI note alone is not image
 * evidence. Genuine sound records remain eligible.
 */
export function hasLabelEvidence(record: LabelEvidenceRecord): boolean {
  const hasStoredVisualEvidence = Boolean(record.imageRef) &&
    (record.media.includes("image") || record.media.includes("spectrogram"));
  const hasAudioEvidence = Boolean(record.audioRef || record.audioUrl);
  return hasStoredVisualEvidence || hasAudioEvidence;
}

/**
 * An observation nobody has named yet — the labeler's "unidentified" queue.
 * ("Nature sound recording" is a placeholder name written by the sound
 * importer, not a real identification.) Shared with Tainá's "can you help
 * identify this?" prompt so both surfaces agree on what needs help.
 */
export function isUnidentifiedRecord(
  record: Pick<OccurrenceRecord, "scientificName" | "vernacularName">,
): boolean {
  return !record.scientificName &&
    (!record.vernacularName || record.vernacularName === "Nature sound recording");
}
