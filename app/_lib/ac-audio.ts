/**
 * Audio recording records — `app.gainforest.ac.audio`.
 *
 * One record per uploaded AudioMoth WAV: a compact preview blob on the PDS
 * (playable anywhere), the archival original in object storage referenced
 * via `accessUri`, technical metadata parsed from the WAV header, and a
 * `deploymentRef` back to the ac.deployment the recording came from.
 *
 * Reads are public straight from the owner's PDS; writes go through the
 * session-gated `/api/manage/proxy` mutation route.
 */

import { resolvePdsHost } from "./pds";

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
  deploymentRef?: string;
  recordedBy?: string;
  tags?: string[];
};

type MutationResult = { uri: string; cid: string };

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
export async function uploadPreviewBlob(bytes: Uint8Array, mimeType = "audio/wav"): Promise<UploadedBlobRef> {
  const result = await postMutation<unknown>(
    { operation: "uploadBlob", blobData: toBase64(bytes), blobMimeType: mimeType },
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
  if (draft.deploymentRef) record.deploymentRef = draft.deploymentRef;
  if (draft.recordedBy) record.recordedBy = draft.recordedBy;
  if (draft.tags?.length) record.tags = draft.tags;
  return record;
}

export async function createAcAudioRecord(draft: AcAudioDraft): Promise<MutationResult> {
  return postMutation<MutationResult>(
    {
      operation: "createRecord",
      collection: AC_AUDIO_COLLECTION,
      record: buildAcAudioRecord(draft),
    },
    "The recording could not be saved.",
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
  createdAt: string;
};

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
    createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date(0).toISOString(),
  };
}

/** All ac.audio records linked to a deployment, oldest first (chronological). */
export async function listRecordingsForDeployment(
  did: string,
  deploymentUri: string,
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
      if (!isRecord(r.value) || r.value.deploymentRef !== deploymentUri) continue;
      const item = parseAcAudioListItem(did, r);
      if (item) items.push(item);
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  items.sort((a, b) => (a.recordedAt ?? a.createdAt).localeCompare(b.recordedAt ?? b.createdAt));
  return items;
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
