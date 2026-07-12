"use client";

/**
 * Client-side helper for publish mutations routed through
 * /api/manage/proxy for personal repo writes, or /api/cgs/mutation for
 * organization-owned writes. Server routes forward to the configured auth
 * service.
 */

import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { resolveStrongRef, type StrongRef } from "@/app/_lib/pds";
import type {
  AppendExistingDatasetResponse,
  AppendExistingDatasetRowInput,
} from "./upload/append-existing-dataset";

export type FloraMeasurementFields = {
  dbh?: string;
  totalHeight?: string;
  basalDiameter?: string;
  canopyCoverPercent?: string;
};

type UpdateOccurrenceData = {
  scientificName?: string;
  vernacularName?: string;
  kingdom?: string;
  basisOfRecord?: string;
  eventDate?: string;
  recordedBy?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
  locality?: string;
  country?: string;
  habitat?: string;
  establishmentMeans?: string;
  occurrenceRemarks?: string;
};

type UpdateMeasurementData = {
  result?: Record<string, unknown>;
};

type UpdateMultimediaData = {
  caption?: string;
};

export type AttachExistingOccurrencesResult = {
  datasetUri: string;
  datasetRkey: string;
  attachedCount: number;
  skippedCount: number;
  errorCount: number;
  datasetCountUpdated: boolean;
  datasetCountError: string | null;
  results: Array<
    | { rkey: string; state: "success"; occurrenceUri: string }
    | { rkey: string; state: "skipped"; reason: string }
    | { rkey: string; state: "error"; error: string }
  >;
};

type GroupScoped = { repo?: string };

export type DeleteTreeGroupCascadeResult = {
  treeGroupRkey: string;
  treeGroupUri: string;
  foundTreeCount: number;
  deletedTreeRkeys: string[];
  deletedTreeUris: string[];
  deletedMeasurementRkeys: string[];
  deletedMultimediaRkeys: string[];
  failedTreeCount: number;
  cleanupErrorCount: number;
  treeGroupDeleted: boolean;
  treeGroupDeleteError: string | null;
  errors: string[];
};

type MutationPayload = GroupScoped & (
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown>; swapRecord?: string }
  | { operation: "deleteRecord"; collection: string; rkey: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string }
  | { operation: "getRecord"; collection: string; rkey: string }
  | { operation: "createMultimediaFromFile"; blobData: string; blobMimeType: string; occurrenceRef: string; siteRef?: string; subjectPart: string; caption?: string }
  | { operation: "getDatasetRecord"; rkey: string }
  | { operation: "getCertifiedLocationRecord"; rkey: string }
  | { operation: "incrementDatasetRecordCount"; rkey: string; increment: number }
  | { operation: "createMeasurement"; occurrenceRef: string; flora: FloraMeasurementFields }
  | { operation: "updateMeasurement"; rkey: string; data: UpdateMeasurementData; unset?: string[]; resultUnset?: string[] }
  | { operation: "updateOccurrence"; rkey: string; data: UpdateOccurrenceData; unset?: string[] }
  | { operation: "updateMultimedia"; rkey: string; data: UpdateMultimediaData; unset?: string[] }
  | { operation: "deleteOccurrenceCascade"; rkey: string }
  | { operation: "deleteTreeGroupCascade"; datasetRkey: string }
  | { operation: "accountDataSummary" }
  | { operation: "deleteAccountDataChunk" }
  | { operation: "detachOccurrenceFromDataset"; rkey: string }
  | { operation: "attachExistingOccurrences"; datasetRkey: string; occurrenceRkeys: string[] }
  | {
      operation: "appendExistingDataset";
      datasetRkey: string;
      rows: AppendExistingDatasetRowInput[];
      establishmentMeans?: string | null;
    }
  | {
      operation: "createMultimediaFromUrl";
      url: string;
      occurrenceRef: string;
      siteRef?: string;
      subjectPart: string;
      caption?: string;
    }
);

type CreateResult = { uri: string; cid: string };
type RecordMutationResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type UploadBlobResult = { ref: unknown; mimeType: string; size: number; blob?: unknown; $type?: string };
type MultimediaResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type RecordReadResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
type DatasetRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
type CertifiedLocationRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
type CascadeDeleteResult = {
  deletedOccurrenceRkey: string;
  deletedMeasurementRkeys: string[];
  deletedMultimediaRkeys: string[];
  treeGroupCountUpdated?: boolean;
  treeGroupCountError?: string | null;
  cleanupError?: string | null;
};

type CreateMultimediaInput = {
  occurrenceRef: string;
  siteRef?: string;
  subjectPart: string;
  caption?: string;
  format?: string;
};

type CreateMultimediaFromFileInput = CreateMultimediaInput & {
  imageFile: File;
};

type CreateMultimediaFromUrlInput = CreateMultimediaInput & {
  url: string;
};

const MULTIMEDIA_COLLECTION = "app.gainforest.ac.multimedia";
const MUTATION_TIMEOUT_MS = 45_000;
const DIRECT_CGS_OPERATIONS = new Set<MutationPayload["operation"]>(["createRecord", "putRecord", "deleteRecord", "uploadBlob"]);

async function readProxyResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.trim() };
  }
}

async function callProxy<T>(payload: MutationPayload): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MUTATION_TIMEOUT_MS);
  const isGroupScoped = "repo" in payload && typeof payload.repo === "string" && payload.repo.length > 0;
  const useDirectCgs = isGroupScoped && DIRECT_CGS_OPERATIONS.has(payload.operation);

  try {
    const res = await fetch(useDirectCgs ? "/api/cgs/mutation" : "/api/manage/proxy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await readProxyResponse(res);
    const error = isRecord(data) && typeof data.error === "string" ? data.error : null;
    const message = isRecord(data) && typeof data.message === "string" ? data.message : null;
    if (!res.ok || error) {
      const fallback = isGroupScoped ? "Organization request failed." : `Saving failed (${res.status})`;
      const detail = message ?? error ?? fallback;
      throw new Error(isGroupScoped ? formatCgsErrorMessage(detail, fallback) : detail);
    }
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Saving timed out. Please try again.");
    }
    if (isGroupScoped) {
      throw new Error(formatCgsErrorMessage(error, "Organization request failed."));
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function createRecord(
  collection: string,
  record: Record<string, unknown>,
  rkey?: string,
  options?: { repo?: string },
): Promise<CreateResult> {
  return callProxy({
    operation: "createRecord",
    collection,
    record,
    ...(rkey ? { rkey } : {}),
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export async function putRecord(
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
  options?: { swapRecord?: string; repo?: string },
): Promise<CreateResult> {
  return callProxy({
    operation: "putRecord",
    collection,
    rkey,
    record,
    ...(options?.swapRecord ? { swapRecord: options.swapRecord } : {}),
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export async function deleteRecord(collection: string, rkey: string, options?: { repo?: string }): Promise<void> {
  await callProxy({ operation: "deleteRecord", collection, rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

// ── Account data deletion (settings → danger zone) ───────────────────────

export type AccountDataSummary = {
  collections: Array<{ collection: string; count: number }>;
  total: number;
  /** True when a very large repo made exact counting impractical. */
  approximate: boolean;
};

export type AccountDataDeleteChunkResult = {
  deleted: number;
  failed: number;
  done: boolean;
};

/** Count every GainForest-namespace record in the signed-in user's repo. */
export async function fetchAccountDataSummary(): Promise<AccountDataSummary> {
  return callProxy({ operation: "accountDataSummary" });
}

/**
 * Delete one chunk of the signed-in user's GainForest records. Call in a
 * loop until `done` — the server bounds each request so arbitrarily large
 * repos never hit a single-request timeout.
 */
export async function deleteAccountDataChunk(): Promise<AccountDataDeleteChunkResult> {
  return callProxy({ operation: "deleteAccountDataChunk" });
}

export async function getRecord(collection: string, rkey: string, options?: { repo?: string }): Promise<RecordReadResult> {
  return callProxy({ operation: "getRecord", collection, rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function getDatasetRecord(rkey: string, options?: { repo?: string }): Promise<DatasetRecordResult> {
  return callProxy({ operation: "getDatasetRecord", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function getCertifiedLocationRecord(rkey: string, options?: { repo?: string }): Promise<CertifiedLocationRecordResult> {
  return callProxy({ operation: "getCertifiedLocationRecord", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function incrementDatasetRecordCount(rkey: string, increment: number, options?: { repo?: string }): Promise<DatasetRecordResult> {
  return callProxy({ operation: "incrementDatasetRecordCount", rkey, increment, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function createMeasurement(input: {
  occurrenceRef: string;
  flora: FloraMeasurementFields;
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  if (options?.repo) {
    const basalDiameter = input.flora.basalDiameter;
    const record = {
      $type: "app.gainforest.dwc.measurement",
      occurrenceRef: input.occurrenceRef,
      result: {
        $type: "app.gainforest.dwc.measurement#floraMeasurement",
        dbh: input.flora.dbh,
        totalHeight: input.flora.totalHeight,
        basalDiameter,
        canopyCoverPercent: input.flora.canopyCoverPercent,
      },
      createdAt: new Date().toISOString(),
    };
    const result = await createRecord("app.gainforest.dwc.measurement", record, undefined, options);
    return { ...result, rkey: result.uri.split("/").pop() ?? "", record };
  }
  return callProxy({ operation: "createMeasurement", ...input });
}

export async function updateMeasurement(input: {
  rkey: string;
  data: UpdateMeasurementData;
  unset?: string[];
  resultUnset?: string[];
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateMeasurement", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function deleteMeasurement(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord("app.gainforest.dwc.measurement", rkey, options);
}

export async function updateOccurrence(input: {
  rkey: string;
  data: UpdateOccurrenceData;
  unset?: string[];
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateOccurrence", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function appendExistingDataset(input: {
  datasetRkey: string;
  rows: AppendExistingDatasetRowInput[];
  establishmentMeans?: string | null;
}, options?: { repo?: string }): Promise<AppendExistingDatasetResponse> {
  return callProxy({ operation: "appendExistingDataset", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function detachOccurrenceFromDataset(rkey: string, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "detachOccurrenceFromDataset", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function attachExistingOccurrences(input: {
  datasetRkey: string;
  occurrenceRkeys: string[];
}, options?: { repo?: string }): Promise<AttachExistingOccurrencesResult> {
  return callProxy({ operation: "attachExistingOccurrences", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function updateMultimedia(input: {
  rkey: string;
  data: UpdateMultimediaData;
  unset?: string[];
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateMultimedia", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function deleteMultimedia(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord(MULTIMEDIA_COLLECTION, rkey, options);
}

export async function deleteOccurrenceCascade(rkey: string, options?: { repo?: string }): Promise<CascadeDeleteResult> {
  return callProxy({ operation: "deleteOccurrenceCascade", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function deleteTreeGroupCascade(datasetRkey: string, options?: { repo?: string }): Promise<DeleteTreeGroupCascadeResult> {
  return callProxy({ operation: "deleteTreeGroupCascade", datasetRkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeUploadBlobResult(value: unknown): UploadBlobResult {
  const candidate = isRecord(value) && isRecord(value.blob) ? value.blob : value;
  if (!isRecord(candidate) || !("ref" in candidate)) {
    throw new Error("We could not upload this photo. Please try again.");
  }

  return {
    $type: typeof candidate.$type === "string" ? candidate.$type : "blob",
    ref: candidate.ref,
    mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : "application/octet-stream",
    size: typeof candidate.size === "number" ? candidate.size : 0,
  };
}

export async function uploadBlob(file: File, options?: { repo?: string }): Promise<UploadBlobResult> {
  const buf = await file.arrayBuffer();
  const b64 = bytesToBase64(new Uint8Array(buf));
  const result = await callProxy<unknown>({
    operation: "uploadBlob",
    blobData: b64,
    blobMimeType: file.type || "application/octet-stream",
    ...(options?.repo ? { repo: options.repo } : {}),
  });
  return normalizeUploadBlobResult(result);
}

export async function createMultimediaFromFile(input: CreateMultimediaFromFileInput, options?: { repo?: string }): Promise<MultimediaResult> {
  const buf = await input.imageFile.arrayBuffer();
  const b64 = bytesToBase64(new Uint8Array(buf));
  return callProxy({
    operation: "createMultimediaFromFile",
    blobData: b64,
    blobMimeType: input.imageFile.type,
    occurrenceRef: input.occurrenceRef,
    ...(input.siteRef ? { siteRef: input.siteRef } : {}),
    subjectPart: input.subjectPart,
    ...(input.caption ? { caption: input.caption } : {}),
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export async function createMultimediaFromUrl(input: CreateMultimediaFromUrlInput, options?: { repo?: string }): Promise<MultimediaResult> {
  return callProxy({
    operation: "createMultimediaFromUrl",
    url: input.url,
    occurrenceRef: input.occurrenceRef,
    ...(input.siteRef ? { siteRef: input.siteRef } : {}),
    subjectPart: input.subjectPart,
    ...(input.caption ? { caption: input.caption } : {}),
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

// ── GainForest feed: posts, comments (reply-posts), likes ───────────────────
// app.gainforest.feed.* are Bluesky's feed primitives in our namespace. A
// comment is a reply-post (a post carrying `reply: { root, parent }`); a like
// targets a com.atproto.repo.strongRef (uri + cid). The subject's cid is
// resolved on the fly because feed rows carry only a uri. Default writes land in
// the signed-in user's own repo; pass `{ repo }` to write to a group repo (CGS
// enforces membership there). See lexicons/README.md.

const FEED_POST_COLLECTION = "app.gainforest.feed.post";
const FEED_LIKE_COLLECTION = "app.gainforest.feed.like";

type FeedWriteResult = { uri: string; cid: string; rkey: string };

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/** Publish a top-level narrative post to the feed (app.gainforest.feed.post). */
export async function createFeedPost(
  input: { text: string; langs?: string[]; tags?: string[] },
  options?: { repo?: string },
): Promise<FeedWriteResult> {
  const record: Record<string, unknown> = {
    $type: FEED_POST_COLLECTION,
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
  };
  if (input.langs?.length) record.langs = input.langs.slice(0, 3);
  if (input.tags?.length) record.tags = input.tags.slice(0, 8);
  const result = await createRecord(FEED_POST_COLLECTION, record, undefined, options);
  return { ...result, rkey: rkeyOf(result.uri) };
}

/**
 * Edit an existing feed post or comment (both are app.gainforest.feed.post): read
 * the current record, swap only its `text`, and put it back. Every other field —
 * `reply` (so a comment stays a comment), `createdAt`, `langs`, `tags`, `embed` —
 * is preserved untouched. `swapRecord` guards against editing a stale version.
 * Caller must own the record (or manage the repo it lives in).
 */
export async function updateFeedPost(
  rkey: string,
  text: string,
  options?: { repo?: string },
): Promise<FeedWriteResult> {
  const existing = await getRecord(FEED_POST_COLLECTION, rkey, options);
  const record: Record<string, unknown> = { ...existing.record, text: text.trim() };
  const result = await putRecord(FEED_POST_COLLECTION, rkey, record, {
    swapRecord: existing.cid,
    ...(options?.repo ? { repo: options.repo } : {}),
  });
  return { ...result, rkey };
}

/**
 * Comment on a record, or reply to another comment. Mirrors Bluesky's model: a
 * comment is a reply-post whose `reply.parent` is the thing replied to and
 * `reply.root` is the top of the thread. Pass only `subjectUri` for a top-level
 * comment (root defaults to it); add `rootUri` for a threaded reply. Both are
 * resolved to strongRefs (uri + cid).
 */
export async function createFeedComment(
  input: { text: string; subjectUri: string; rootUri?: string; langs?: string[] },
  options?: { repo?: string },
): Promise<FeedWriteResult> {
  const parent: StrongRef = await resolveStrongRef(input.subjectUri);
  const root: StrongRef =
    input.rootUri && input.rootUri !== input.subjectUri
      ? await resolveStrongRef(input.rootUri)
      : parent;
  const record: Record<string, unknown> = {
    $type: FEED_POST_COLLECTION,
    text: input.text.trim(),
    reply: { root, parent },
    createdAt: new Date().toISOString(),
  };
  if (input.langs?.length) record.langs = input.langs.slice(0, 3);
  const result = await createRecord(FEED_POST_COLLECTION, record, undefined, options);
  return { ...result, rkey: rkeyOf(result.uri) };
}

/**
 * Delete one of the viewer's own feed posts or comments (both are
 * app.gainforest.feed.post). Caller must own the record (or manage the repo it
 * lives in); deleting a comment removes that reply-post, which the appview then
 * stops counting under its subject. Pass `{ repo }` to target a group repo.
 */
export async function deleteFeedPost(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord(FEED_POST_COLLECTION, rkey, options);
}

/** Like any record/post/comment (app.gainforest.feed.like). Returns the like
 *  record's rkey so the caller can later unlike it via deleteFeedLike. */
export async function createFeedLike(
  subjectUri: string,
  options?: { repo?: string },
): Promise<FeedWriteResult> {
  const subject: StrongRef = await resolveStrongRef(subjectUri);
  const record = {
    $type: FEED_LIKE_COLLECTION,
    subject,
    createdAt: new Date().toISOString(),
  };
  const result = await createRecord(FEED_LIKE_COLLECTION, record, undefined, options);
  return { ...result, rkey: rkeyOf(result.uri) };
}

/** Remove a like (unlike) by the like record's rkey. */
export async function deleteFeedLike(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord(FEED_LIKE_COLLECTION, rkey, options);
}

// ── Social graph: follows ───────────────────────────────────────────────────
// app.certified.graph.follow declares an actor→actor follow: `subject` is the
// followed account's DID (not a strongRef). The record lives in the follower's
// repo, so a default write follows on behalf of the signed-in user; pass
// `{ repo }` to follow on behalf of a group the viewer manages (CGS enforces
// membership). Mirrors app.bsky.graph.follow.

const FOLLOW_COLLECTION = "app.certified.graph.follow";

/** Follow an account by its DID. Returns the follow record's rkey so the caller
 *  can later unfollow it via deleteFollow. */
export async function createFollow(
  subjectDid: string,
  options?: { repo?: string },
): Promise<FeedWriteResult> {
  const record = {
    $type: FOLLOW_COLLECTION,
    subject: subjectDid,
    createdAt: new Date().toISOString(),
  };
  const result = await createRecord(FOLLOW_COLLECTION, record, undefined, options);
  return { ...result, rkey: rkeyOf(result.uri) };
}

/** Unfollow by the follow record's rkey. */
export async function deleteFollow(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord(FOLLOW_COLLECTION, rkey, options);
}
