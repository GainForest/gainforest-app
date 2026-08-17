import "server-only";
import { randomUUID } from "node:crypto";
import {
  deleteObject,
  getJson,
  getS3Config,
  listKeys,
  presignDownload,
  putJson,
  putObject,
  type S3Config,
} from "@/app/_lib/s3-storage";

/**
 * Grant documents for the Rewilding the Web program (the signed contract and
 * anything like it).
 *
 * These are **private**. They are deliberately NOT atproto records and NOT PDS
 * blobs: everything in the GainForest moderation repo is world-readable, and a
 * grant contract is between GainForest and one partner. Instead the file and
 * its metadata live in the same private object storage the data-batch ingest
 * uses, and the only way to read one back is a short-lived presigned link
 * minted by an admin-gated route.
 *
 * Layout (flat — the set is small, dozens of files):
 *   rewilding/documents/<id>.json   metadata, incl. which grantee it belongs to
 *   rewilding/documents/<id>.file   the bytes
 */

const PREFIX = "rewilding/documents/";
const metaKey = (id: string) => `${PREFIX}${id}.json`;
const fileKey = (id: string) => `${PREFIX}${id}.file`;

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
 * 3 MB of raw file. The upload travels as base64 JSON through a route handler,
 * and Vercel caps request bodies at 4.5 MB — 3 MB of file is the safe budget
 * after base64 inflation, and it fits a signed contract PDF.
 */
export const REWILDING_DOCUMENT_MAX_BYTES = 3 * 1024 * 1024;

/** How long a download link stays valid. Short: these are private contracts. */
export const REWILDING_DOCUMENT_LINK_SECONDS = 300;

export type RewildingDocument = {
  id: string;
  /** DID of the grantee the document belongs to. */
  subjectDid: string;
  /** Display name, e.g. "Grant contract". */
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  /** DID of the admin who uploaded it — the private store has no audit log. */
  uploadedByDid: string | null;
};

export type RewildingDocumentErrorCode =
  | "invalid_request"
  | "file_too_large"
  | "file_type_unsupported"
  | "storage_unavailable"
  | "save_failed"
  | "delete_failed";

export class RewildingDocumentError extends Error {
  status: number;
  code: RewildingDocumentErrorCode;

  constructor(code: RewildingDocumentErrorCode, status: number) {
    super(code);
    this.name = "RewildingDocumentError";
    this.status = status;
    this.code = code;
  }
}

/** True when the deployment has private storage configured at all. */
export function isRewildingDocumentStorageConfigured(): boolean {
  return getS3Config() !== null;
}

function requireStorage(): S3Config {
  const config = getS3Config();
  if (!config) throw new RewildingDocumentError("storage_unavailable", 503);
  return config;
}

function isDocument(value: unknown): value is RewildingDocument {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.subjectDid === "string" &&
    entry.subjectDid.startsWith("did:") &&
    typeof entry.title === "string" &&
    typeof entry.fileName === "string"
  );
}

/** Every grant document, newest first. Empty when storage isn't configured. */
export async function listRewildingDocuments(): Promise<RewildingDocument[]> {
  const config = getS3Config();
  if (!config) return [];

  const keys = await listKeys(config, PREFIX).catch(() => []);
  const metaKeys = keys.filter((key) => key.endsWith(".json"));
  const documents = await Promise.all(
    metaKeys.map((key) => getJson<unknown>(config, key).catch(() => null)),
  );
  return documents
    .filter(isDocument)
    .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
}

export type NewRewildingDocument = {
  subjectDid: string;
  title: string;
  fileName: string;
  mimeType: string;
  /** Base64 of the raw file bytes. */
  dataBase64: string;
  /** DID of the admin performing the upload. */
  uploadedByDid: string | null;
};

/** Store one grant document privately and return its metadata. */
export async function addRewildingDocument(input: NewRewildingDocument): Promise<RewildingDocument> {
  const config = requireStorage();
  const subjectDid = input.subjectDid.trim();
  const title = input.title.trim().slice(0, 200);
  const fileName = input.fileName.trim().slice(0, 200);
  const mimeType = input.mimeType.trim();
  if (!subjectDid.startsWith("did:") || !title || !fileName || !input.dataBase64) {
    throw new RewildingDocumentError("invalid_request", 400);
  }
  if (!REWILDING_DOCUMENT_MIME_TYPES.has(mimeType)) {
    throw new RewildingDocumentError("file_type_unsupported", 400);
  }

  const bytes = Buffer.from(input.dataBase64, "base64");
  if (bytes.byteLength === 0) throw new RewildingDocumentError("invalid_request", 400);
  if (bytes.byteLength > REWILDING_DOCUMENT_MAX_BYTES) {
    throw new RewildingDocumentError("file_too_large", 413);
  }

  const document: RewildingDocument = {
    id: randomUUID(),
    subjectDid,
    title,
    fileName,
    mimeType,
    sizeBytes: bytes.byteLength,
    uploadedAt: new Date().toISOString(),
    uploadedByDid: input.uploadedByDid,
  };

  try {
    await putObject(config, fileKey(document.id), bytes, mimeType);
    await putJson(config, metaKey(document.id), document);
  } catch (error) {
    console.error("[rewilding] document upload failed", error);
    // Never leave the bytes behind without metadata pointing at them.
    await deleteObject(config, fileKey(document.id)).catch(() => {});
    throw new RewildingDocumentError("save_failed", 502);
  }
  return document;
}

export async function getRewildingDocument(id: string): Promise<RewildingDocument | null> {
  const config = getS3Config();
  if (!config || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  const document = await getJson<unknown>(config, metaKey(id)).catch(() => null);
  return isDocument(document) ? document : null;
}

/** A short-lived link to the file itself. Only ever handed to an admin. */
export function presignRewildingDocument(document: RewildingDocument): string {
  return presignDownload(
    requireStorage(),
    fileKey(document.id),
    REWILDING_DOCUMENT_LINK_SECONDS,
    document.fileName,
  );
}

/** Remove one document (wrong file, duplicate, …). Metadata goes first, so a
 *  partial failure can never leave a listed document with no bytes. */
export async function removeRewildingDocument(id: string): Promise<void> {
  const config = requireStorage();
  const document = await getRewildingDocument(id);
  if (!document) return;
  try {
    await deleteObject(config, metaKey(id));
    await deleteObject(config, fileKey(id));
  } catch (error) {
    console.error("[rewilding] document delete failed", error);
    throw new RewildingDocumentError("delete_failed", 502);
  }
}
