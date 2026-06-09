"use client";

/**
 * Client-side helper for publish mutations routed through
 * /api/manage/proxy → auth.gainforest.app/api/atproto/mutation.
 *
 * All mutations are executed in the context of the logged-in user's account.
 */

type MutationPayload =
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown> }
  | { operation: "deleteRecord"; collection: string; rkey: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string }
  | { operation: "getDatasetRecord"; rkey: string }
  | { operation: "incrementDatasetRecordCount"; rkey: string; increment: number }
  | {
      operation: "createMultimediaFromUrl";
      url: string;
      occurrenceRef: string;
      siteRef?: string;
      subjectPart: string;
      caption?: string;
    };

type CreateResult = { uri: string; cid: string };
type UploadBlobResult = { ref: unknown; mimeType: string; size: number; blob?: unknown };
type MultimediaResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type DatasetRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };

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

async function callProxy<T>(payload: MutationPayload): Promise<T> {
  const res = await fetch("/api/manage/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Saving failed (${res.status})`);
  }
  return data;
}

export async function createRecord(
  collection: string,
  record: Record<string, unknown>,
  rkey?: string,
): Promise<CreateResult> {
  return callProxy({ operation: "createRecord", collection, record, ...(rkey ? { rkey } : {}) });
}

export async function putRecord(
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
): Promise<CreateResult> {
  return callProxy({ operation: "putRecord", collection, rkey, record });
}

export async function deleteRecord(collection: string, rkey: string): Promise<void> {
  await callProxy({ operation: "deleteRecord", collection, rkey });
}

export async function getDatasetRecord(rkey: string): Promise<DatasetRecordResult> {
  return callProxy({ operation: "getDatasetRecord", rkey });
}

export async function incrementDatasetRecordCount(rkey: string, increment: number): Promise<DatasetRecordResult> {
  return callProxy({ operation: "incrementDatasetRecordCount", rkey, increment });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function uploadBlob(file: File): Promise<UploadBlobResult> {
  const buf = await file.arrayBuffer();
  const b64 = bytesToBase64(new Uint8Array(buf));
  return callProxy({ operation: "uploadBlob", blobData: b64, blobMimeType: file.type });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getUploadedBlob(uploaded: UploadBlobResult, file: File) {
  const raw = isRecord(uploaded.blob) ? uploaded.blob : uploaded;
  if (!isRecord(raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("Photo could not be saved.");
  }

  return {
    $type: "blob" as const,
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : (file.type || "application/octet-stream"),
    size: typeof raw.size === "number" ? raw.size : file.size,
  };
}

function omitUndefined(record: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined || record[key] === null) delete record[key];
  }
  return record;
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "unknown";
}

export async function createMultimediaFromFile(input: CreateMultimediaFromFileInput): Promise<MultimediaResult> {
  const uploaded = await uploadBlob(input.imageFile);
  const file = getUploadedBlob(uploaded, input.imageFile);
  const record = omitUndefined({
    $type: MULTIMEDIA_COLLECTION,
    file,
    occurrenceRef: input.occurrenceRef,
    siteRef: input.siteRef,
    subjectPart: input.subjectPart,
    caption: input.caption,
    format: input.format ?? file.mimeType,
    createdAt: new Date().toISOString(),
  });
  const result = await createRecord(MULTIMEDIA_COLLECTION, record);
  return { ...result, rkey: rkeyFromUri(result.uri), record };
}

export async function createMultimediaFromUrl(input: CreateMultimediaFromUrlInput): Promise<MultimediaResult> {
  return callProxy({
    operation: "createMultimediaFromUrl",
    url: input.url,
    occurrenceRef: input.occurrenceRef,
    ...(input.siteRef ? { siteRef: input.siteRef } : {}),
    subjectPart: input.subjectPart,
    ...(input.caption ? { caption: input.caption } : {}),
  });
}
