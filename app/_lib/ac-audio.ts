/**
 * Audio recording records — `app.gainforest.ac.audio`.
 *
 * One record per uploaded AudioMoth WAV: a compact preview blob on the PDS
 * (playable anywhere), the archival original in object storage referenced
 * via `accessUri`, technical metadata parsed from the WAV header, and a
 * `deploymentRef` back to the ac.deployment the recording came from.
 *
 * Reads are public straight from the owner's PDS; writes go through the
 * session-gated `/api/manage/proxy` mutation route — into the signed-in
 * user's repo by default, or an organization's repo when a `repo` option
 * is given (the proxy checks group membership).
 */

import { resolvePdsHost, getPdsRecord, parseAtUri } from "./pds";

export const AC_AUDIO_COLLECTION = "app.gainforest.ac.audio";

export type UploadedBlobRef = {
  $type: "blob";
  ref: unknown;
  mimeType: string;
  size: number;
};

export type AcAudioMetadata = {
  codec?: string;
  channels: number;
  /** Seconds, stringified per the lexicon (no float type in atproto). */
  duration: string;
  sampleRate: number;
  recordedAt: string;
  bitDepth?: number;
  fileFormat?: string;
  fileSizeBytes?: number;
};

export type AcAudioDraft = {
  name: string;
  metadata: AcAudioMetadata;
  /** Compact preview stored on the PDS, when one could be generated. */
  previewBlob?: UploadedBlobRef | null;
  /** Spectrogram PNG stored on the PDS, when one could be generated. */
  spectrogramBlob?: UploadedBlobRef | null;
  /** URL of the archival original (object storage redirect). */
  accessUri?: string;
  /**
   * Content CID (CIDv1 raw sha-256) of the archival *original* — the
   * full-resolution file behind `accessUri`, as opposed to the compressed
   * preview variant stored as the PDS blob. Lets re-scans of the same SD
   * card recognise byte-identical recordings and skip them.
   */
  originalCid?: string;
  deploymentRef?: string;
  recordedBy?: string;
  tags?: string[];
};

type MutationResult = { uri: string; cid: string };

/** Write target: the signed-in account by default, an organization's repo when given. */
export type AcAudioWriteOptions = { repo?: string | null };

function scopedRepo(options?: AcAudioWriteOptions): { repo?: string } {
  const repo = options?.repo?.trim();
  return repo ? { repo } : {};
}

async function postMutation<T>(body: Record<string, unknown>, fallbackMessage: string): Promise<T> {
  const res = await fetch("/api/manage/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!res.ok || !json || json.error) {
    throw new Error(json?.message ?? json?.error ?? fallbackMessage);
  }
  return json;
}

/* ── Preview blob upload (base64 through the session-gated proxy) ─────────── */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Upload a small preview WAV as a PDS blob; returns the blob ref. */
export async function uploadPreviewBlob(
  bytes: Uint8Array,
  mimeType = "audio/wav",
  options?: AcAudioWriteOptions,
): Promise<UploadedBlobRef> {
  const result = await postMutation<unknown>(
    { operation: "uploadBlob", blobData: toBase64(bytes), blobMimeType: mimeType, ...scopedRepo(options) },
    "The audio preview could not be uploaded.",
  );
  const raw = isRecord(result) && isRecord(result.blob) ? result.blob : result;
  if (!isRecord(raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("The audio preview could not be uploaded.");
  }
  return {
    $type: "blob",
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : mimeType,
    size: typeof raw.size === "number" ? raw.size : bytes.byteLength,
  };
}

/* ── Record creation ──────────────────────────────────────────────────────── */

export function buildAcAudioRecord(draft: AcAudioDraft): Record<string, unknown> {
  const record: Record<string, unknown> = {
    $type: AC_AUDIO_COLLECTION,
    name: draft.name,
    metadata: { ...draft.metadata },
    createdAt: new Date().toISOString(),
  };
  if (draft.previewBlob) {
    record.blob = { file: draft.previewBlob };
    record.variantLiteral = "Lower Quality";
  }
  if (draft.spectrogramBlob) {
    record.spectrogram = { file: draft.spectrogramBlob };
  }
  if (draft.accessUri) record.accessUri = draft.accessUri;
  if (draft.originalCid) record.originalCid = draft.originalCid;
  if (draft.deploymentRef) record.deploymentRef = draft.deploymentRef;
  if (draft.recordedBy) record.recordedBy = draft.recordedBy;
  if (draft.tags?.length) record.tags = draft.tags;
  return record;
}

export async function createAcAudioRecord(
  draft: AcAudioDraft,
  options?: AcAudioWriteOptions,
): Promise<MutationResult> {
  return postMutation<MutationResult>(
    {
      operation: "createRecord",
      collection: AC_AUDIO_COLLECTION,
      record: buildAcAudioRecord(draft),
      ...scopedRepo(options),
    },
    "The recording could not be saved.",
  );
}

/**
 * Re-point one already-written recording at a different `ac.deployment` by
 * rkey — the tray uses this to attach a batch to a deployment created after
 * the upload started. The stored record is read back and written whole with
 * only `deploymentRef` changed, like {@link moveRecordings}.
 */
export async function updateRecordingDeployment(
  rkey: string,
  deploymentRef: string,
  options?: AcAudioWriteOptions,
): Promise<void> {
  const scope = scopedRepo(options);
  const current = await postMutation<{ cid: string; record: Record<string, unknown> }>(
    { operation: "getRecord", collection: AC_AUDIO_COLLECTION, rkey, ...scope },
    "The recording could not be read.",
  );
  await postMutation<MutationResult>(
    {
      operation: "putRecord",
      collection: AC_AUDIO_COLLECTION,
      rkey,
      swapRecord: current.cid,
      record: { ...current.record, deploymentRef },
      ...scope,
    },
    "The recording could not be moved.",
  );
}

/** A recording row as shown on deployment pages. */
export type AcAudioListItem = {
  uri: string;
  rkey: string;
  cid: string;
  did: string;
  name: string;
  recordedAt: string | null;
  durationSeconds: number | null;
  sampleRate: number | null;
  /** CID + mime of the playable preview blob, when present. */
  previewCid: string | null;
  previewMimeType: string | null;
  /** CID of the spectrogram PNG blob, when present. */
  spectrogramCid: string | null;
  /** URL of the archival original, when present. */
  accessUri: string | null;
  /** AT-URI of the ac.deployment this recording belongs to, when present. */
  deploymentRef: string | null;
  /** AT-URI of the field site linked directly to this recording, when present. */
  siteRef?: string | null;
  createdAt: string;
};

/**
 * Extract the object-storage key from an `accessUri` that points at our
 * archival download endpoint (`/api/audiomoth/recordings?key=…`). Returns
 * null for absent, malformed, or third-party URIs — those have no object in
 * our bucket to clean up.
 */
export function audiomothStorageKey(accessUri: string | null | undefined): string | null {
  if (!accessUri) return null;
  try {
    const url = new URL(accessUri, "https://placeholder.invalid");
    if (!url.pathname.endsWith("/api/audiomoth/recordings")) return null;
    const key = url.searchParams.get("key");
    return key && key.startsWith("audiomoth/") ? key : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort removal of archival originals from object storage. Failures
 * are swallowed — an orphaned WAV in the bucket is the pre-existing status
 * quo and must never block the record deletion the user asked for.
 */
export async function deleteArchivedOriginals(keys: Iterable<string>): Promise<void> {
  await Promise.allSettled(
    [...keys].map((key) =>
      fetch(`/api/audiomoth/recordings?key=${encodeURIComponent(key)}`, { method: "DELETE" }),
    ),
  );
}

/** Public getBlob URL for a blob on the owner's PDS. */
export function pdsBlobUrl(host: string, did: string, cid: string): string {
  const params = new URLSearchParams({ did, cid });
  return `https://${host}/xrpc/com.atproto.sync.getBlob?${params.toString()}`;
}

function blobRefFrom(value: unknown): { cid: string; mimeType: string | null } | null {
  if (!isRecord(value)) return null;
  const file = isRecord(value.file) ? value.file : value;
  if (!isRecord(file) || !isRecord(file.ref) || typeof file.ref.$link !== "string") return null;
  return { cid: file.ref.$link, mimeType: typeof file.mimeType === "string" ? file.mimeType : null };
}

function parseAcAudioListItem(
  did: string,
  entry: { uri?: unknown; cid?: unknown; value?: unknown },
): AcAudioListItem | null {
  if (typeof entry.uri !== "string" || typeof entry.cid !== "string" || !isRecord(entry.value)) return null;
  const v = entry.value;
  if (typeof v.name !== "string") return null;
  const metadata = isRecord(v.metadata) ? v.metadata : {};
  const preview = blobRefFrom(v.blob);
  const spectrogram = blobRefFrom(v.spectrogram);
  const duration = typeof metadata.duration === "string" ? Number(metadata.duration) : null;
  return {
    uri: entry.uri,
    rkey: entry.uri.split("/").pop() ?? "",
    cid: entry.cid,
    did,
    name: v.name,
    recordedAt: typeof metadata.recordedAt === "string" ? metadata.recordedAt : null,
    durationSeconds: duration !== null && Number.isFinite(duration) ? duration : null,
    sampleRate: typeof metadata.sampleRate === "number" ? metadata.sampleRate : null,
    previewCid: preview?.cid ?? null,
    previewMimeType: preview?.mimeType ?? null,
    spectrogramCid: spectrogram?.cid ?? null,
    accessUri: typeof v.accessUri === "string" ? v.accessUri : null,
    deploymentRef: typeof v.deploymentRef === "string" ? v.deploymentRef : null,
    siteRef: typeof v.siteRef === "string" ? v.siteRef : null,
    createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date(0).toISOString(),
  };
}

async function listAcAudioItems(
  did: string,
  keep: (value: Record<string, unknown>) => boolean,
  signal?: AbortSignal,
): Promise<AcAudioListItem[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) throw new Error(`Could not resolve the data host for ${did}.`);

  const items: AcAudioListItem[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ repo: did, collection: AC_AUDIO_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 400 && items.length === 0) return [];
      throw new Error(`Could not load recordings (${res.status}).`);
    }
    const data = (await res.json()) as {
      records?: Array<{ uri?: unknown; cid?: unknown; value?: unknown }>;
      cursor?: unknown;
    };
    for (const r of data.records ?? []) {
      if (!isRecord(r.value) || !keep(r.value)) continue;
      const item = parseAcAudioListItem(did, r);
      if (item) items.push(item);
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  items.sort((a, b) => (a.recordedAt ?? a.createdAt).localeCompare(b.recordedAt ?? b.createdAt));
  return items;
}

/** Every ac.audio record in a repo, oldest first. */
export async function listAllRecordings(did: string, signal?: AbortSignal): Promise<AcAudioListItem[]> {
  return listAcAudioItems(did, () => true, signal);
}

/**
 * Read one recording by its AT-URI, straight from the owner's PDS. A public,
 * CORS-open read (same trust model as blob fetching), so it works for
 * signed-out visitors — used to hydrate a published soundscape's source
 * recordings, which store only a pointer back to their ac.audio record.
 * Returns null when the record can't be reached or isn't a usable recording.
 */
export async function fetchRecordingByUri(
  uri: string,
  signal?: AbortSignal,
): Promise<AcAudioListItem | null> {
  const parts = parseAtUri(uri);
  if (!parts || parts.collection !== AC_AUDIO_COLLECTION) return null;
  const record = await getPdsRecord(parts.did, AC_AUDIO_COLLECTION, parts.rkey, signal);
  if (!record) return null;
  return parseAcAudioListItem(parts.did, { uri: record.uri, cid: record.cid ?? "", value: record.value });
}

/** All ac.audio records linked to a deployment, oldest first (chronological). */
export async function listRecordingsForDeployment(
  did: string,
  deploymentUri: string,
  signal?: AbortSignal,
): Promise<AcAudioListItem[]> {
  return listAcAudioItems(did, (value) => value.deploymentRef === deploymentUri, signal);
}


/* ── Moving recordings between folders ──────────────────────────────── */

/**
 * Put one recording in a different folder. Which folder a recording is in is
 * a single field (`deploymentRef`), but it lives in a record full of blob
 * refs and parsed WAV metadata this app never models in full — so the stored
 * record is read back and written whole, with only that one field changed.
 */
async function moveRecording(
  item: AcAudioListItem,
  deploymentRef: string,
  repo?: string | null,
): Promise<void> {
  const scope = repo ? { repo } : {};
  const current = await postMutation<{ cid: string; record: Record<string, unknown> }>(
    { operation: "getRecord", collection: AC_AUDIO_COLLECTION, rkey: item.rkey, ...scope },
    "The recording could not be read.",
  );
  await postMutation<MutationResult>(
    {
      operation: "putRecord",
      collection: AC_AUDIO_COLLECTION,
      rkey: item.rkey,
      swapRecord: current.cid,
      record: { ...current.record, deploymentRef },
      ...scope,
    },
    "The recording could not be moved.",
  );
}

export type MoveRecordingsOutcome = {
  /** AT-URIs now in the destination folder. */
  moved: Set<string>;
  /** AT-URIs that stayed put — worth keeping selected for a retry. */
  failed: Set<string>;
};

/**
 * Move a selection of recordings into one folder, one at a time so a single
 * failure costs one recording rather than the whole batch.
 */
export async function moveRecordings({
  items,
  deploymentRef,
  repo,
  onProgress,
}: {
  items: readonly AcAudioListItem[];
  /** AT-URI of the destination `ac.deployment`. */
  deploymentRef: string;
  /** Group repo DID, when moving on an organization's profile. */
  repo?: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<MoveRecordingsOutcome> {
  const moved = new Set<string>();
  const failed = new Set<string>();
  let done = 0;
  for (const item of items) {
    if (item.deploymentRef === deploymentRef) {
      // Already there: nothing to write, and no reason to call it a failure.
      moved.add(item.uri);
    } else {
      try {
        await moveRecording(item, deploymentRef, repo);
        moved.add(item.uri);
      } catch {
        failed.add(item.uri);
      }
    }
    done += 1;
    onProgress?.(done, items.length);
  }
  return { moved, failed };
}

/* ── Already-uploaded detection ───────────────────────────────────────────── */

/** Identity keys of every recording already in a repo, for pre-upload dedup. */
export type UploadedRecordingKeys = {
  /** Content CIDs (`originalCid`) of the archival originals. */
  cids: Set<string>;
  /** `name + file size` keys for records created before CIDs were stored. */
  legacy: Set<string>;
  /** How many recordings each `ac.deployment` already holds, keyed by AT-URI. */
  countsByDeployment: Map<string, number>;
};

/** Fallback identity for records that predate `originalCid`. */
export function legacyRecordingKey(name: string, fileSizeBytes: number): string {
  return `${name}\u0000${fileSizeBytes}`;
}

/**
 * Index one ac.audio record's identity into `keys`.
 *
 * Records with an `originalCid` are identified by content only. The weak
 * name+size key is indexed *solely* for records without a CID: AudioMoth
 * filenames are timestamps and fixed-duration recordings are byte-identical
 * in size, so two devices on the same schedule produce colliding name+size
 * pairs. Indexing name+size for CID-bearing records made the uploader skip
 * fresh files from a second SD card as "already uploaded".
 */
export function indexUploadedRecordingKeys(keys: UploadedRecordingKeys, value: unknown): void {
  if (!isRecord(value)) return;
  const cid = typeof value.originalCid === "string" ? value.originalCid : null;
  if (cid) keys.cids.add(cid);
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  if (!cid && typeof value.name === "string" && typeof metadata?.fileSizeBytes === "number") {
    keys.legacy.add(legacyRecordingKey(value.name, metadata.fileSizeBytes));
  }
  if (typeof value.deploymentRef === "string") {
    keys.countsByDeployment.set(value.deploymentRef, (keys.countsByDeployment.get(value.deploymentRef) ?? 0) + 1);
  }
}

/**
 * Every recording identity in a repo — content CIDs where stored, plus a
 * name+size fallback only for older records that predate CIDs — so the
 * uploader can skip files whose content is already in the account before
 * uploading anything.
 * Throws when the repo cannot be listed (callers then skip dedup).
 */
export async function listUploadedRecordingKeys(did: string, signal?: AbortSignal): Promise<UploadedRecordingKeys> {
  const host = await resolvePdsHost(did, signal);
  if (!host) throw new Error(`Could not resolve the data host for ${did}.`);

  const keys: UploadedRecordingKeys = { cids: new Set(), legacy: new Set(), countsByDeployment: new Map() };
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ repo: did, collection: AC_AUDIO_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 400 && keys.cids.size === 0 && keys.legacy.size === 0) return keys; // no collection yet
      throw new Error(`Could not load recordings (${res.status}).`);
    }
    const data = (await res.json()) as {
      records?: Array<{ value?: unknown }>;
      cursor?: unknown;
    };
    for (const r of data.records ?? []) indexUploadedRecordingKeys(keys, r.value);
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  return keys;
}

/**
 * The names (filenames) of all ac.audio records already linked to a
 * deployment, so re-scanning the same SD card can skip uploaded files.
 */
export async function listUploadedRecordingNames(
  did: string,
  deploymentUri: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const host = await resolvePdsHost(did, signal);
  const names = new Set<string>();
  if (!host) return names;

  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ repo: did, collection: AC_AUDIO_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) return names;
    const data = (await res.json().catch(() => null)) as {
      records?: Array<{ value?: unknown }>;
      cursor?: unknown;
    } | null;
    for (const r of data?.records ?? []) {
      if (!isRecord(r.value)) continue;
      if (r.value.deploymentRef !== deploymentUri) continue;
      if (typeof r.value.name === "string") names.add(r.value.name);
    }
    cursor = typeof data?.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  return names;
}
