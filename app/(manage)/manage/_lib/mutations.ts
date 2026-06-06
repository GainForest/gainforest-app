"use client";

/**
 * Client-side helper for ATProto mutations routed through
 * /api/manage/proxy → auth.gainforest.app/api/atproto/mutation.
 *
 * All mutations are executed in the context of the logged-in user's PDS.
 */

type MutationPayload =
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown> }
  | { operation: "deleteRecord"; collection: string; rkey: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string };

type CreateResult = { uri: string; cid: string };
type UploadBlobResult = { ref: unknown; mimeType: string; size: number };

async function callProxy<T>(payload: MutationPayload): Promise<T> {
  const res = await fetch("/api/manage/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Mutation failed (${res.status})`);
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

export async function uploadBlob(file: File): Promise<UploadBlobResult> {
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return callProxy({ operation: "uploadBlob", blobData: b64, blobMimeType: file.type });
}
