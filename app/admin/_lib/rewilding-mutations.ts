import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  REWILDING_DOCUMENT_COLLECTION,
  REWILDING_MILESTONE_COLLECTION,
  doneRewildingMilestoneIds,
  fetchRewildingDocumentRecords,
  fetchRewildingMilestoneRecords,
  invalidateRewildingCaches,
  isRewildingMilestoneId,
  type RewildingDocumentRecord,
  type RewildingMilestoneId,
  type RewildingMilestoneRecord,
} from "@/app/_lib/rewilding-milestones";

/**
 * Admin-side writers for the Rewilding the Web panel: milestone confirmations
 * and grant-document uploads, all written to the GainForest moderation repo
 * through the CGS mutation proxy with the acting admin's session cookie.
 */

export type RewildingMutationErrorCode =
  | "invalid_request"
  | "file_too_large"
  | "file_type_unsupported"
  | "save_failed"
  | "delete_failed";

export class RewildingMutationError extends Error {
  status: number;
  code: RewildingMutationErrorCode;

  constructor(code: RewildingMutationErrorCode, status: number) {
    super(code);
    this.name = "RewildingMutationError";
    this.status = status;
    this.code = code;
  }
}

/** Documents an admin may upload: contracts and supporting paperwork. */
export const REWILDING_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
]);

/**
 * 3 MB of raw file. The upload travels as base64 JSON through a route
 * handler, and Vercel caps request bodies at 4.5 MB — 3 MB of file is the
 * safe budget after base64 inflation, and it fits a signed contract PDF.
 */
export const REWILDING_DOCUMENT_MAX_BYTES = 3 * 1024 * 1024;

type CgsMutationResult = { uri?: string; blob?: unknown; error?: string; message?: string };
type CgsPayload =
  | { operation: "createRecord"; collection: string; record: Record<string, unknown> }
  | { operation: "deleteRecord"; collection: string; rkey: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string };

async function cgsMutate(
  repo: string,
  cookie: string | null,
  payload: CgsPayload,
  failureCode: "save_failed" | "delete_failed" = "save_failed",
): Promise<CgsMutationResult> {
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ ...payload, repo }),
    cache: "no-store",
  });
  const data = (await upstream.json().catch(() => null)) as CgsMutationResult | null;
  if (!upstream.ok || !data || data.error) {
    throw new RewildingMutationError(failureCode, upstream.status || 502);
  }
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Confirm or reopen one milestone for one grantee. Append-only and idempotent:
 * when the effective state already matches, no event is written.
 */
export async function setRewildingMilestone(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  milestoneId: string,
  done: boolean,
): Promise<RewildingMilestoneRecord> {
  const did = subjectDid.trim();
  if (!did.startsWith("did:") || !isRewildingMilestoneId(milestoneId)) {
    throw new RewildingMutationError("invalid_request", 400);
  }

  const existing = await fetchRewildingMilestoneRecords(repoDid);
  const alreadyDone = doneRewildingMilestoneIds(existing, did).has(milestoneId);
  if (alreadyDone === done) {
    const current = existing.find(
      (record) => record.subjectDid === did && record.milestoneId === milestoneId,
    );
    if (current) return current;
  }

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: REWILDING_MILESTONE_COLLECTION,
    record: {
      $type: REWILDING_MILESTONE_COLLECTION,
      subject: did,
      milestoneId,
      done,
      createdAt,
    },
  });
  if (!created.uri) throw new RewildingMutationError("save_failed", 502);

  invalidateRewildingCaches();
  return {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid: did,
    milestoneId: milestoneId as RewildingMilestoneId,
    done,
    createdAt,
  };
}

export type NewRewildingDocument = {
  subjectDid: string;
  title: string;
  fileName: string;
  mimeType: string;
  /** Base64 of the raw file bytes. */
  dataBase64: string;
};

/**
 * Upload one grant document: the file becomes a blob on the moderation
 * account's PDS, referenced by a document record naming the grantee.
 */
export async function addRewildingDocument(
  repoDid: string,
  cookie: string | null,
  input: NewRewildingDocument,
): Promise<RewildingDocumentRecord> {
  const did = input.subjectDid.trim();
  const title = input.title.trim().slice(0, 200);
  const fileName = input.fileName.trim().slice(0, 200);
  const mimeType = input.mimeType.trim();
  if (!did.startsWith("did:") || !title || !fileName || !input.dataBase64) {
    throw new RewildingMutationError("invalid_request", 400);
  }
  if (!REWILDING_DOCUMENT_MIME_TYPES.has(mimeType)) {
    throw new RewildingMutationError("file_type_unsupported", 400);
  }
  // Base64 inflates by 4/3; compare against the encoded budget.
  if (input.dataBase64.length > Math.ceil((REWILDING_DOCUMENT_MAX_BYTES * 4) / 3) + 4) {
    throw new RewildingMutationError("file_too_large", 413);
  }

  const uploaded = await cgsMutate(repoDid, cookie, {
    operation: "uploadBlob",
    blobData: input.dataBase64,
    blobMimeType: mimeType,
  });
  // The proxy returns either `{ blob: {...} }` or the blob object itself.
  const blob: Record<string, unknown> = isRecord(uploaded.blob)
    ? uploaded.blob
    : (uploaded as unknown as Record<string, unknown>);
  if (blob.ref === undefined || blob.ref === null) {
    throw new RewildingMutationError("save_failed", 502);
  }

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: REWILDING_DOCUMENT_COLLECTION,
    record: {
      $type: REWILDING_DOCUMENT_COLLECTION,
      subject: did,
      title,
      fileName,
      file: {
        $type: "blob",
        ref: blob.ref,
        mimeType: typeof blob.mimeType === "string" ? blob.mimeType : mimeType,
        size: typeof blob.size === "number" ? blob.size : undefined,
      },
      createdAt,
    },
  });
  if (!created.uri) throw new RewildingMutationError("save_failed", 502);

  invalidateRewildingCaches();
  const ref = blob.ref;
  const cid = typeof ref === "string" ? ref : isRecord(ref) && typeof ref.$link === "string" ? ref.$link : "";
  return {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid: did,
    title,
    fileName,
    fileCid: cid,
    fileMimeType: mimeType,
    createdAt,
  };
}

/** Remove one uploaded document record (the wrong file, a duplicate, …). */
export async function removeRewildingDocument(
  repoDid: string,
  cookie: string | null,
  rkey: string,
): Promise<void> {
  const trimmed = rkey.trim();
  if (!trimmed) throw new RewildingMutationError("invalid_request", 400);

  // Only delete records that are actually grant documents in this repo.
  const existing = await fetchRewildingDocumentRecords(repoDid);
  if (!existing.some((record) => record.rkey === trimmed)) return;

  await cgsMutate(
    repoDid,
    cookie,
    { operation: "deleteRecord", collection: REWILDING_DOCUMENT_COLLECTION, rkey: trimmed },
    "delete_failed",
  );
  invalidateRewildingCaches();
}
