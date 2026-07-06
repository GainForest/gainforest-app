import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Minimal S3-compatible object storage client for the data-jobs ingest
 * pipeline (Cloudflare R2 in production, any S3 API works).
 *
 * Hand-rolled SigV4 keeps us dependency-free: header-signed requests for
 * server-side calls (metadata JSON, multipart create/complete/abort) and
 * query-presigned URLs for the browser (part uploads) and admins (downloads).
 *
 * Uploads never flow through the Next.js server — Vercel caps request bodies
 * at ~4.5MB, and batches are 5–10GB. The browser PUTs parts straight to the
 * bucket with presigned URLs.
 */

const SERVICE = "s3";
const UNSIGNED = "UNSIGNED-PAYLOAD";

export type S3Config = {
  endpoint: string; // e.g. https://<account>.r2.cloudflarestorage.com
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Read the storage config from env; null when the feature isn't configured. */
export function getS3Config(): S3Config | null {
  const endpoint = process.env.DATA_JOBS_S3_ENDPOINT?.trim();
  const bucket = process.env.DATA_JOBS_S3_BUCKET?.trim();
  const accessKeyId = process.env.DATA_JOBS_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.DATA_JOBS_S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    region: process.env.DATA_JOBS_S3_REGION?.trim() || "auto",
    accessKeyId,
    secretAccessKey,
  };
}

/* ────────────────────────────── SigV4 core ────────────────────────────── */

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), SERVICE), "aws4_request");
}

/** RFC 3986 encoding as AWS expects it (encodeURIComponent + !'()*). */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Encode an object key, preserving `/` between segments. */
function encodeKeyPath(key: string): string {
  return key.split("/").map(rfc3986).join("/");
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");
}

function amzTimestamp(now = new Date()): { amzDate: string; shortDate: string } {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, shortDate: amzDate.slice(0, 8) };
}

type SignedRequest = { url: string; headers: Record<string, string> };

/** Build a header-signed request for server→bucket calls. */
function signRequest(
  config: S3Config,
  method: string,
  key: string,
  query: Record<string, string>,
  body: Buffer | null,
  extraHeaders: Record<string, string> = {},
): SignedRequest {
  const { amzDate, shortDate } = amzTimestamp();
  const host = new URL(config.endpoint).host;
  const uri = key === "" ? `/${rfc3986(config.bucket)}` : `/${rfc3986(config.bucket)}/${encodeKeyPath(key)}`;
  const payloadHash = sha256Hex(body ?? "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const queryString = canonicalQuery(query);

  const canonicalRequest = [method, uri, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${shortDate}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(config.secretAccessKey, shortDate, config.region), stringToSign).toString("hex");

  const { host: _drop, ...sendHeaders } = headers;
  return {
    url: `${config.endpoint}${uri}${queryString ? `?${queryString}` : ""}`,
    headers: {
      ...sendHeaders,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** Build a query-presigned URL (browser part uploads, admin downloads). */
export function presignUrl(
  config: S3Config,
  method: string,
  key: string,
  query: Record<string, string>,
  expiresSeconds: number,
  now?: Date,
): string {
  const { amzDate, shortDate } = amzTimestamp(now);
  const host = new URL(config.endpoint).host;
  const uri = `/${rfc3986(config.bucket)}/${encodeKeyPath(key)}`;
  const scope = `${shortDate}/${config.region}/${SERVICE}/aws4_request`;

  const params: Record<string, string> = {
    ...query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const queryString = canonicalQuery(params);
  const canonicalRequest = [method, uri, queryString, `host:${host}\n`, "host", UNSIGNED].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(config.secretAccessKey, shortDate, config.region), stringToSign).toString("hex");

  return `${config.endpoint}${uri}?${queryString}&X-Amz-Signature=${signature}`;
}

async function s3Fetch(
  config: S3Config,
  method: string,
  key: string,
  query: Record<string, string> = {},
  body: Buffer | null = null,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const { url, headers } = signRequest(config, method, key, query, body, extraHeaders);
  return fetch(url, {
    method,
    headers,
    ...(body ? { body: new Uint8Array(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

/* ───────────────────────────── Object helpers ───────────────────────────── */

export async function putJson(config: S3Config, key: string, value: unknown): Promise<void> {
  const body = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  const response = await s3Fetch(config, "PUT", key, {}, body, { "content-type": "application/json" });
  if (!response.ok) throw new Error(`putJson ${key} failed (${response.status})`);
}

export async function getJson<T>(config: S3Config, key: string): Promise<T | null> {
  const response = await s3Fetch(config, "GET", key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`getJson ${key} failed (${response.status})`);
  return (await response.json()) as T;
}

export async function deleteObject(config: S3Config, key: string): Promise<void> {
  const response = await s3Fetch(config, "DELETE", key);
  if (!response.ok && response.status !== 404) throw new Error(`delete ${key} failed (${response.status})`);
}

export async function headObject(config: S3Config, key: string): Promise<{ sizeBytes: number } | null> {
  const response = await s3Fetch(config, "HEAD", key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`head ${key} failed (${response.status})`);
  return { sizeBytes: Number(response.headers.get("content-length") ?? 0) };
}

/** List object keys under a prefix (first page, up to `max`, sorted by key). */
export async function listKeys(config: S3Config, prefix: string, max = 1000): Promise<string[]> {
  const response = await s3Fetch(config, "GET", "", {
    "list-type": "2",
    prefix,
    "max-keys": String(Math.min(max, 1000)),
  });
  if (!response.ok) throw new Error(`list ${prefix} failed (${response.status})`);
  const xml = await response.text();
  const keys: string[] = [];
  for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
    keys.push(decodeXml(match[1]));
  }
  return keys;
}

/* ─────────────────────────── Multipart uploads ─────────────────────────── */

export async function createMultipartUpload(config: S3Config, key: string): Promise<string> {
  const response = await s3Fetch(config, "POST", key, { uploads: "" }, null, {
    "content-type": "application/zip",
  });
  if (!response.ok) throw new Error(`createMultipartUpload failed (${response.status})`);
  const xml = await response.text();
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
  if (!uploadId) throw new Error("createMultipartUpload: no UploadId in response");
  return decodeXml(uploadId);
}

/** Presign a single part PUT for the browser. Response must expose the ETag header via bucket CORS. */
export function presignUploadPart(
  config: S3Config,
  key: string,
  uploadId: string,
  partNumber: number,
  expiresSeconds = 3600,
): string {
  return presignUrl(config, "PUT", key, { partNumber: String(partNumber), uploadId }, expiresSeconds);
}

export async function completeMultipartUpload(
  config: S3Config,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const xmlBody = Buffer.from(
    `<CompleteMultipartUpload>${[...parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`)
      .join("")}</CompleteMultipartUpload>`,
    "utf8",
  );
  const response = await s3Fetch(config, "POST", key, { uploadId }, xmlBody, {
    "content-type": "application/xml",
  });
  const text = await response.text();
  // S3 returns 200 with an <Error> body on some failures — check both.
  if (!response.ok || text.includes("<Error>")) {
    throw new Error(`completeMultipartUpload failed (${response.status}): ${text.slice(0, 300)}`);
  }
}

export async function abortMultipartUpload(config: S3Config, key: string, uploadId: string): Promise<void> {
  const response = await s3Fetch(config, "DELETE", key, { uploadId });
  if (!response.ok && response.status !== 404) {
    throw new Error(`abortMultipartUpload failed (${response.status})`);
  }
}

/** Presigned GET for admins/agents to download or range-read the archive. */
export function presignDownload(config: S3Config, key: string, expiresSeconds = 3600, filename?: string): string {
  const query: Record<string, string> = filename
    ? { "response-content-disposition": `attachment; filename="${filename.replace(/[^\w.\- ]/g, "_")}"` }
    : {};
  return presignUrl(config, "GET", key, query, expiresSeconds);
}

/* ───────────────────────────────── utils ───────────────────────────────── */

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
