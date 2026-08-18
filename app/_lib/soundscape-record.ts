/**
 * Reading and writing published soundscapes (`app.gainforest.ac.soundscape`).
 *
 * The record shape and every pure helper live in `lib/soundscape/record.ts`;
 * this module is the I/O half: writes go through the session-gated manage
 * proxy (same path as every other record this app creates), reads come
 * straight from the owner's PDS — public, CORS-open, and available to signed
 * out readers of a feed post.
 */

import {
  getPdsRecord,
  listLatestPdsRecords,
  listRepoCollections,
  parseAtUri,
  resolvePdsHost,
  blobUrl,
} from "./pds";
import {
  buildSoundscapeRecord,
  parseSoundscapeRecord,
  parseSoundscapeSummary,
  SOUNDSCAPE_COLLECTION,
  type PublishedSoundscape,
  type SoundscapeDraft,
  type SoundscapeSummary,
} from "@/lib/soundscape/record";

export type CreatedSoundscape = { uri: string; cid: string; rkey: string; did: string };

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function didOf(uri: string): string {
  return parseAtUri(uri)?.did ?? "";
}

/**
 * Publish a soundscape to the acting repo. `repo` targets an organization the
 * user manages; omitted, it lands in the user's own account.
 */
export async function createSoundscapeRecord(
  draft: SoundscapeDraft,
  options?: { repo?: string },
): Promise<CreatedSoundscape> {
  const { createRecord } = await import("@/app/(manage)/manage/_lib/mutations");
  const created = await createRecord(SOUNDSCAPE_COLLECTION, buildSoundscapeRecord(draft), undefined, options);
  return { uri: created.uri, cid: created.cid, rkey: rkeyOf(created.uri), did: didOf(created.uri) };
}

/**
 * Create-or-update a soundscape at a fixed rkey — how a folder's *living*
 * record is maintained. The workbench keeps one soundscape per folder at the
 * folder's own rkey, updating it as analysis progresses, so writing is an
 * idempotent put rather than a pile of near-identical creates.
 */
export async function putSoundscapeRecord(
  rkey: string,
  draft: SoundscapeDraft,
  options?: { repo?: string },
): Promise<CreatedSoundscape> {
  const { putRecord } = await import("@/app/(manage)/manage/_lib/mutations");
  const saved = await putRecord(SOUNDSCAPE_COLLECTION, rkey, buildSoundscapeRecord(draft), options);
  return { uri: saved.uri, cid: saved.cid, rkey: rkeyOf(saved.uri), did: didOf(saved.uri) };
}

/**
 * Remove a soundscape record. Used when a folder is deleted — its living
 * record would otherwise keep drawing a dial whose recordings are gone.
 * Best-effort by nature: the record may never have existed.
 */
export async function deleteSoundscapeRecord(rkey: string, options?: { repo?: string }): Promise<void> {
  const { deleteRecord } = await import("@/app/(manage)/manage/_lib/mutations");
  await deleteRecord(SOUNDSCAPE_COLLECTION, rkey, options);
}

/** Read a published soundscape from its owner's PDS. Null when it is gone,
 *  unreachable, or not a usable soundscape. */
export async function fetchPublishedSoundscape(
  did: string,
  rkey: string,
  signal?: AbortSignal,
): Promise<PublishedSoundscape | null> {
  const record = await getPdsRecord(did, SOUNDSCAPE_COLLECTION, rkey, signal);
  if (!record) return null;
  return parseSoundscapeRecord(record.value);
}

/**
 * How many published soundscapes a picker offers. A repo accumulates one
 * record per shared analysis, and each can run to a few hundred kilobytes, so
 * a listing takes the newest handful rather than the whole history.
 */
export const SOUNDSCAPE_LIST_LIMIT = 12;

/** A published soundscape, listed. */
export type ListedSoundscape = SoundscapeSummary & {
  uri: string;
  did: string;
  rkey: string;
};

/**
 * Whether an account has ever published a soundscape.
 *
 * Cheap on purpose: this decides whether to *offer* soundscapes at all, so it
 * runs for anyone who can post an update on a project, and an account with no
 * recordings must not pay for a listing to be told it has nothing.
 */
export async function hasPublishedSoundscapes(did: string, signal?: AbortSignal): Promise<boolean> {
  const collections = await listRepoCollections(did, signal);
  return collections.includes(SOUNDSCAPE_COLLECTION);
}

/**
 * The account's most recently published soundscapes, newest first. Summaries
 * only — the dial itself is drawn from the full record, read once a reader
 * actually opens one.
 */
export async function listPublishedSoundscapes(
  did: string,
  signal?: AbortSignal,
): Promise<ListedSoundscape[]> {
  const records = await listLatestPdsRecords(did, SOUNDSCAPE_COLLECTION, SOUNDSCAPE_LIST_LIMIT, signal);
  return records.flatMap((record) => {
    const summary = parseSoundscapeSummary(record.value);
    const parts = parseAtUri(record.uri);
    if (!summary || !parts) return [];
    return [{ ...summary, uri: record.uri, did: parts.did, rkey: parts.rkey }];
  });
}

/** Same, addressed by AT-URI (how the evidence timeline stores it). */
export async function fetchSoundscapeByUri(
  uri: string,
  signal?: AbortSignal,
): Promise<PublishedSoundscape | null> {
  const parts = parseAtUri(uri);
  if (!parts || parts.collection !== SOUNDSCAPE_COLLECTION) return null;
  return fetchPublishedSoundscape(parts.did, parts.rkey, signal);
}

export type PlayableRecording = {
  /** Playable URLs, best first: the compact PDS preview, then the archival
   *  original. The preview is small enough to download in one go, which is
   *  what makes it seekable (the PDS blob endpoint ignores Range requests). */
  urls: string[];
  name: string | null;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** CID of a `{ file: blob }` (or bare blob) field on an ac.audio record. */
function blobCid(value: unknown): string | null {
  if (!isRecordValue(value)) return null;
  const file = isRecordValue(value.file) ? value.file : value;
  if (!isRecordValue(file) || !isRecordValue(file.ref) || typeof file.ref.$link !== "string") return null;
  return file.ref.$link;
}

/**
 * Resolve one of a soundscape's source recordings into something playable.
 * Read on demand — a soundscape can point at hundreds of recordings and a
 * reader only ever listens to the minute they clicked.
 */
export async function resolvePlayableRecording(
  audioUri: string,
  signal?: AbortSignal,
): Promise<PlayableRecording | null> {
  const parts = parseAtUri(audioUri);
  if (!parts) return null;
  const [host, record] = await Promise.all([
    resolvePdsHost(parts.did, signal),
    getPdsRecord(parts.did, parts.collection, parts.rkey, signal),
  ]);
  if (!host || !record) return null;
  const value = record.value;
  const previewCid = blobCid(value.blob);
  const urls = [
    previewCid ? blobUrl(host, parts.did, previewCid) : null,
    typeof value.accessUri === "string" && value.accessUri.trim() ? value.accessUri : null,
  ].filter((url): url is string => Boolean(url));
  if (urls.length === 0) return null;
  return { urls, name: typeof value.name === "string" ? value.name : null };
}
