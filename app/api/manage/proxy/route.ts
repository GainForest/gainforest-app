import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { resolvePdsHost } from "@/app/_lib/pds";
import { transformPhotoUrl } from "@/app/(manage)/manage/_lib/upload/url-transforms";

export const runtime = "nodejs";

type MutationBody =
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown>; swapRecord?: string }
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

type ForwardableMutationBody = Exclude<
  MutationBody,
  | { operation: "createMultimediaFromUrl" }
  | { operation: "getDatasetRecord" }
  | { operation: "incrementDatasetRecordCount" }
>;
type PdsSession = { did: string; accessJwt: string };
type DatasetRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };

const MULTIMEDIA_COLLECTION = "app.gainforest.ac.multimedia";
const DATASET_COLLECTION = "app.gainforest.dwc.dataset";
const MAX_URL_IMAGE_BYTES = 4.5 * 1024 * 1024;
const PHOTO_FETCH_TIMEOUT_MS = 30_000;
const MAX_PHOTO_REDIRECTS = 5;
const ACCEPTED_URL_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return typeof value === "undefined" || typeof value === "string";
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped?.[1]) return isBlockedIpAddress(ipv4Mapped[1]);

  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map((part) => Number(part));
    const [a = 0, b = 0] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return true;
}

async function assertFetchablePhotoUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Could not open this photo link.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Could not open this photo link.");
  }

  const hostname = parsed.hostname;
  if (isBlockedHostname(hostname)) throw new Error("Could not open this photo link.");

  if (isIP(hostname.replace(/^\[|\]$/g, ""))) {
    if (isBlockedIpAddress(hostname)) throw new Error("Could not open this photo link.");
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not open this photo link.");
  }

  if (addresses.length === 0 || addresses.some((address) => isBlockedIpAddress(address.address))) {
    throw new Error("Could not open this photo link.");
  }
}

function photoTooLargeError(sizeBytes: number): Error {
  const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
  return new Error(`This photo is too large: ${sizeMb} MB. Maximum is 4.5 MB.`);
}

async function readPhotoResponseBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error("Could not open this photo link.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_URL_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw photoTooLargeError(totalBytes);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Photo link took too long to open.");
    }
    throw error;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isMutationBody(value: unknown): value is MutationBody {
  if (!isRecord(value)) return false;
  const body = value as Partial<MutationBody>;
  if (body.operation === "uploadBlob") return typeof body.blobData === "string" && typeof body.blobMimeType === "string";
  if (body.operation === "createRecord") return typeof body.collection === "string" && typeof body.record === "object" && body.record !== null;
  if (body.operation === "putRecord") {
    return (
      typeof body.collection === "string" &&
      typeof body.rkey === "string" &&
      typeof body.record === "object" &&
      body.record !== null &&
      isOptionalString(body.swapRecord)
    );
  }
  if (body.operation === "deleteRecord") return typeof body.collection === "string" && typeof body.rkey === "string";
  if (body.operation === "getDatasetRecord") return typeof body.rkey === "string" && body.rkey.length > 0;
  if (body.operation === "incrementDatasetRecordCount") {
    return typeof body.rkey === "string" && body.rkey.length > 0 && typeof body.increment === "number" && Number.isInteger(body.increment) && body.increment >= 0;
  }
  if (body.operation === "createMultimediaFromUrl") {
    return (
      typeof body.url === "string" &&
      isHttpUrl(body.url) &&
      typeof body.occurrenceRef === "string" &&
      isOptionalString(body.siteRef) &&
      typeof body.subjectPart === "string" &&
      body.subjectPart.trim().length > 0 &&
      isOptionalString(body.caption)
    );
  }
  return false;
}

function getConfiguredPdsUrl(): string | null {
  const domain = process.env.E2E_TEST_PDS_DOMAIN?.trim();
  if (!domain) return null;
  return domain.startsWith("http://") || domain.startsWith("https://") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

async function createConfiguredPdsSession(expectedDid: string): Promise<{ pdsUrl: string; session: PdsSession } | null> {
  const pdsUrl = getConfiguredPdsUrl();
  const identifier = process.env.E2E_TEST_HANDLE?.trim();
  const password = process.env.E2E_TEST_PASSWORD?.trim();
  if (!pdsUrl || !identifier || !password) return null;

  const response = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as Partial<PdsSession> | null;
  if (!response.ok || !json || typeof json.did !== "string" || typeof json.accessJwt !== "string") {
    throw new Error("Could not create a publishing session for the configured test account.");
  }
  if (json.did !== expectedDid) {
    throw new Error("Configured publishing account does not match the signed-in account.");
  }
  return { pdsUrl, session: { did: json.did, accessJwt: json.accessJwt } };
}

async function callPdsXrpc<T>(pdsUrl: string, session: PdsSession, method: "POST", path: string, body: unknown, contentType = "application/json"): Promise<T> {
  const response = await fetch(`${pdsUrl}/xrpc/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.accessJwt}`,
      "content-type": contentType,
    },
    body: contentType === "application/json" ? JSON.stringify(body) : (body as BodyInit),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as T & { error?: string; message?: string } | null;
  if (!response.ok || !json) {
    throw new Error(json?.message ?? json?.error ?? `Publishing request failed (${response.status}).`);
  }
  return json;
}

async function runConfiguredPdsMutation(body: ForwardableMutationBody, did: string): Promise<Response | null> {
  const configured = await createConfiguredPdsSession(did);
  if (!configured) return null;
  const { pdsUrl, session } = configured;

  if (body.operation === "uploadBlob") {
    const bytes = Buffer.from(body.blobData, "base64");
    const result = await callPdsXrpc(pdsUrl, session, "POST", "com.atproto.repo.uploadBlob", bytes, body.blobMimeType);
    return Response.json(result);
  }

  if (body.operation === "createRecord") {
    const result = await callPdsXrpc<{ uri: string; cid: string }>(pdsUrl, session, "POST", "com.atproto.repo.createRecord", {
      repo: did,
      collection: body.collection,
      ...(body.rkey ? { rkey: body.rkey } : {}),
      record: body.record,
    });
    return Response.json({ uri: result.uri, cid: result.cid });
  }

  if (body.operation === "putRecord") {
    const result = await callPdsXrpc<{ uri: string; cid: string }>(pdsUrl, session, "POST", "com.atproto.repo.putRecord", {
      repo: did,
      collection: body.collection,
      rkey: body.rkey,
      record: body.record,
      ...(body.swapRecord ? { swapRecord: body.swapRecord } : {}),
    });
    return Response.json({ uri: result.uri, cid: result.cid });
  }

  await callPdsXrpc(pdsUrl, session, "POST", "com.atproto.repo.deleteRecord", {
    repo: did,
    collection: body.collection,
    rkey: body.rkey,
  });
  return Response.json({ success: true });
}

async function forwardMutationResponse(body: ForwardableMutationBody, did: string, cookie: string | null): Promise<Response> {
  const authUrl = `${getAuthBaseUrl()}/api/atproto/mutation`;
  let upstream: Response;
  try {
    upstream = await fetch(authUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const fallback = await runConfiguredPdsMutation(body, did).catch((error) => Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }));
    if (fallback) return fallback;
    const message = err instanceof Error ? err.message : "Saving is unavailable right now.";
    return Response.json({ error: message }, { status: 502 });
  }

  const result = await upstream.json().catch(() => null);
  if (result) return Response.json(result, { status: upstream.status });

  const fallback = await runConfiguredPdsMutation(body, did).catch((error) => Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }));
  if (fallback) return fallback;

  return Response.json({ error: "Saving is unavailable right now. Please try again later." }, { status: upstream.ok ? 502 : upstream.status });
}

async function executeForwardableMutation<T>(body: ForwardableMutationBody, did: string, cookie: string | null): Promise<T> {
  const response = await forwardMutationResponse(body, did, cookie);
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.message ?? payload?.error ?? "Photo could not be saved.");
  }
  return payload;
}

function getUploadedBlob(uploadResult: unknown, mimeType: string, size: number) {
  const raw = isRecord(uploadResult) && isRecord(uploadResult.blob) ? uploadResult.blob : uploadResult;
  if (!isRecord(raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("Photo could not be saved.");
  }

  return {
    $type: "blob" as const,
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : mimeType,
    size: typeof raw.size === "number" ? raw.size : size,
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

async function getDatasetRecordFromPds(did: string, rkey: string): Promise<DatasetRecordResult> {
  const configuredPdsUrl = getConfiguredPdsUrl();
  const host = configuredPdsUrl ? null : await resolvePdsHost(did);
  const pdsBaseUrl = configuredPdsUrl ?? (host ? `https://${host}` : null);
  if (!pdsBaseUrl) throw new Error("Could not check the selected tree group.");

  const params = new URLSearchParams({ repo: did, collection: DATASET_COLLECTION, rkey });
  const response = await fetch(`${pdsBaseUrl}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    uri?: unknown;
    cid?: unknown;
    value?: unknown;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || !payload || typeof payload.uri !== "string" || typeof payload.cid !== "string" || !isRecord(payload.value)) {
    throw new Error(payload?.message ?? payload?.error ?? "Could not check the selected tree group.");
  }

  return { uri: payload.uri, cid: payload.cid, rkey, record: payload.value };
}

async function incrementDatasetRecordCount(
  body: Extract<MutationBody, { operation: "incrementDatasetRecordCount" }>,
  did: string,
  cookie: string | null,
): Promise<DatasetRecordResult> {
  const current = await getDatasetRecordFromPds(did, body.rkey);
  const currentCount = typeof current.record.recordCount === "number" && Number.isFinite(current.record.recordCount)
    ? current.record.recordCount
    : 0;
  const nextRecord = {
    ...current.record,
    $type: typeof current.record.$type === "string" ? current.record.$type : DATASET_COLLECTION,
    recordCount: currentCount + body.increment,
  };

  const result = await executeForwardableMutation<{ uri: string; cid: string }>({
    operation: "putRecord",
    collection: DATASET_COLLECTION,
    rkey: body.rkey,
    record: nextRecord,
    swapRecord: current.cid,
  }, did, cookie);

  return { ...result, rkey: body.rkey, record: nextRecord };
}

async function fetchPhotoBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let directUrl = transformPhotoUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHOTO_FETCH_TIMEOUT_MS);

  try {
    let response: Response;
    for (let redirectCount = 0; ; redirectCount++) {
      await assertFetchablePhotoUrl(directUrl);

      try {
        response = await fetch(directUrl, { signal: controller.signal, redirect: "manual" });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Photo link took too long to open.");
        }
        throw new Error("Could not open this photo link.");
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount >= MAX_PHOTO_REDIRECTS) throw new Error("Could not open this photo link.");
        try {
          directUrl = new URL(location, directUrl).toString();
        } catch {
          throw new Error("Could not open this photo link.");
        }
        continue;
      }

      break;
    }

    if (!response.ok) throw new Error("Could not open this photo link.");

    const contentLength = response.headers.get("content-length");
    const contentLengthBytes = contentLength ? Number(contentLength) : NaN;
    if (Number.isFinite(contentLengthBytes) && contentLengthBytes > MAX_URL_IMAGE_BYTES) {
      throw photoTooLargeError(contentLengthBytes);
    }

    const rawContentType = response.headers.get("content-type") ?? "";
    const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ACCEPTED_URL_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error("This photo link did not return a supported image. Use JPG, PNG, WebP, or HEIC.");
    }

    let bytes: Uint8Array;
    try {
      bytes = await readPhotoResponseBytes(response);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("This photo is too large")) throw error;
      throw error instanceof Error && error.message === "Photo link took too long to open."
        ? error
        : new Error("Could not open this photo link.");
    }

    if (bytes.byteLength === 0) throw new Error("This photo link returned an empty photo.");

    return { bytes, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

async function createMultimediaFromUrl(
  body: Extract<MutationBody, { operation: "createMultimediaFromUrl" }>,
  did: string,
  cookie: string | null,
): Promise<{ uri: string; cid: string; rkey: string; record: Record<string, unknown> }> {
  const { bytes, mimeType } = await fetchPhotoBytes(body.url);
  const uploadResult = await executeForwardableMutation<unknown>({
    operation: "uploadBlob",
    blobData: Buffer.from(bytes).toString("base64"),
    blobMimeType: mimeType,
  }, did, cookie);
  const file = getUploadedBlob(uploadResult, mimeType, bytes.byteLength);
  const record = omitUndefined({
    $type: MULTIMEDIA_COLLECTION,
    file,
    occurrenceRef: body.occurrenceRef,
    siteRef: body.siteRef,
    subjectPart: body.subjectPart,
    caption: body.caption,
    format: file.mimeType,
    createdAt: new Date().toISOString(),
  });
  const result = await executeForwardableMutation<{ uri: string; cid: string }>({
    operation: "createRecord",
    collection: MULTIMEDIA_COLLECTION,
    record,
  }, did, cookie);

  return { ...result, rkey: rkeyFromUri(result.uri), record };
}

/**
 * Thin proxy from app routes → auth.gainforest.app/api/atproto/mutation.
 *
 * The client sends mutation payloads to this route; the route validates the
 * local session and forwards the request to the auth server with the same
 * session cookie so the auth server can restore the publishing agent and save
 * on behalf of the user.
 */
export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headerList = await headers();
  const cookie = headerList.get("cookie");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isMutationBody(body)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.operation === "getDatasetRecord") {
    try {
      const result = await getDatasetRecordFromPds(session.did, body.rkey);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Could not check the selected tree group." }, { status: 502 });
    }
  }

  if (body.operation === "incrementDatasetRecordCount") {
    try {
      const result = await incrementDatasetRecordCount(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Tree group count could not be updated." }, { status: 502 });
    }
  }

  if (body.operation === "createMultimediaFromUrl") {
    try {
      const result = await createMultimediaFromUrl(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Photo could not be saved." }, { status: 502 });
    }
  }

  return forwardMutationResponse(body, session.did, cookie);
}
