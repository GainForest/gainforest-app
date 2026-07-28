/**
 * Reading and writing published soundscapes (`app.gainforest.ac.soundscape`).
 *
 * The record shape and every pure helper live in `lib/soundscape/record.ts`;
 * this module is the I/O half: writes go through the session-gated manage
 * proxy (same path as every other record this app creates), reads come
 * straight from the owner's PDS — public, CORS-open, and available to signed
 * out readers of a feed post.
 */

import { getPdsRecord, parseAtUri, resolvePdsHost, blobUrl } from "./pds";
import {
  buildSoundscapeRecord,
  parseSoundscapeRecord,
  SOUNDSCAPE_COLLECTION,
  type PublishedSoundscape,
  type SoundscapeDraft,
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
