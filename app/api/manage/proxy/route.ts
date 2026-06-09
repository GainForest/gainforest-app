import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { resolvePdsHost } from "@/app/_lib/pds";
import { transformPhotoUrl } from "@/app/(manage)/manage/_lib/upload/url-transforms";

export const runtime = "nodejs";

type FloraMeasurementFields = {
  dbh?: string;
  totalHeight?: string;
  diameter?: string;
  basalDiameter?: string;
  canopyCoverPercent?: string;
};

type UpdateOccurrenceData = {
  scientificName?: string;
  vernacularName?: string;
  eventDate?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
  locality?: string;
  occurrenceRemarks?: string;
};

type AppendExistingDatasetOccurrenceInput = {
  scientificName: string;
  eventDate: string;
  basisOfRecord: string;
  decimalLatitude: string;
  decimalLongitude: string;
  occurrenceID?: string;
  occurrenceStatus?: string;
  geodeticDatum?: string;
  license?: string;
  vernacularName?: string;
  recordedBy?: string;
  locality?: string;
  country?: string;
  countryCode?: string;
  occurrenceRemarks?: string;
  habitat?: string;
  samplingProtocol?: string;
  kingdom?: string;
  projectRef?: string;
  siteRef?: string;
};

type AppendExistingDatasetRowInput = {
  occurrence: AppendExistingDatasetOccurrenceInput;
  floraMeasurement: FloraMeasurementFields | null;
};

type AppendExistingDatasetRowResult =
  | { index: number; state: "success"; occurrenceUri: string; photoCount: number }
  | { index: number; state: "partial"; occurrenceUri: string; photoCount: number; error: string }
  | { index: number; state: "error"; error: string };

type MutationBody =
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown>; swapRecord?: string }
  | { operation: "deleteRecord"; collection: string; rkey: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string }
  | { operation: "getDatasetRecord"; rkey: string }
  | { operation: "incrementDatasetRecordCount"; rkey: string; increment: number }
  | { operation: "createMeasurement"; occurrenceRef: string; flora: FloraMeasurementFields }
  | { operation: "updateOccurrence"; rkey: string; data: UpdateOccurrenceData; unset?: string[] }
  | { operation: "detachOccurrenceFromDataset"; rkey: string }
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
    };

type ForwardableMutationBody = Exclude<
  MutationBody,
  | { operation: "createMultimediaFromUrl" }
  | { operation: "getDatasetRecord" }
  | { operation: "incrementDatasetRecordCount" }
  | { operation: "createMeasurement" }
  | { operation: "updateOccurrence" }
  | { operation: "detachOccurrenceFromDataset" }
  | { operation: "appendExistingDataset" }
>;
type PdsSession = { did: string; accessJwt: string };
type DatasetRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
type CreatedRecord = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type PersistedOccurrence = { index: number; occurrenceUri: string; occurrenceRkey: string };

const MULTIMEDIA_COLLECTION = "app.gainforest.ac.multimedia";
const DATASET_COLLECTION = "app.gainforest.dwc.dataset";
const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const MEASUREMENT_COLLECTION = "app.gainforest.dwc.measurement";
const MAX_URL_IMAGE_BYTES = 4.5 * 1024 * 1024;
const PHOTO_FETCH_TIMEOUT_MS = 30_000;
const MAX_PHOTO_REDIRECTS = 5;
const APPEND_EXISTING_DATASET_MAX_ROWS = 10;
const LIST_RECORDS_PAGE_LIMIT = 100;
const MAX_DATASET_COUNT_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 50;
const TREE_GROUP_UNAVAILABLE_MESSAGE = "The selected tree group is no longer available. Choose another tree group and try again.";
const TREE_GROUP_DISAPPEARED_MESSAGE = "The selected tree group disappeared during upload. Remaining rows were not added.";
const ACCEPTED_URL_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

class TreeGroupUnavailableError extends Error {
  constructor(message = TREE_GROUP_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "TreeGroupUnavailableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return typeof value === "undefined" || typeof value === "string";
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return typeof value === "undefined" || (typeof value === "string" && value.trim().length > 0);
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

function isFloraMeasurementFields(value: unknown): value is FloraMeasurementFields {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value.dbh) &&
    isOptionalString(value.totalHeight) &&
    isOptionalString(value.diameter) &&
    isOptionalString(value.basalDiameter) &&
    isOptionalString(value.canopyCoverPercent)
  );
}

const UPDATE_OCCURRENCE_UNSET_FIELDS = new Set([
  "vernacularName",
  "locality",
  "occurrenceRemarks",
]);

function isUpdateOccurrenceData(value: unknown): value is UpdateOccurrenceData {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value.scientificName) &&
    isOptionalString(value.vernacularName) &&
    isOptionalString(value.eventDate) &&
    isOptionalString(value.decimalLatitude) &&
    isOptionalString(value.decimalLongitude) &&
    isOptionalString(value.locality) &&
    isOptionalString(value.occurrenceRemarks)
  );
}

function isUpdateOccurrenceUnset(value: unknown): value is string[] | undefined {
  return typeof value === "undefined" || (
    Array.isArray(value) && value.every((field) => typeof field === "string" && UPDATE_OCCURRENCE_UNSET_FIELDS.has(field))
  );
}

function isAppendExistingDatasetOccurrenceInput(value: unknown): value is AppendExistingDatasetOccurrenceInput {
  if (!isRecord(value)) return false;
  return (
    typeof value.scientificName === "string" &&
    typeof value.eventDate === "string" &&
    typeof value.decimalLatitude === "string" &&
    typeof value.decimalLongitude === "string" &&
    typeof value.basisOfRecord === "string" &&
    isOptionalString(value.vernacularName) &&
    isOptionalString(value.recordedBy) &&
    isOptionalString(value.locality) &&
    isOptionalString(value.country) &&
    isOptionalString(value.countryCode) &&
    isOptionalString(value.occurrenceRemarks) &&
    isOptionalString(value.habitat) &&
    isOptionalString(value.samplingProtocol) &&
    isOptionalString(value.kingdom) &&
    isOptionalString(value.occurrenceID) &&
    isOptionalString(value.occurrenceStatus) &&
    isOptionalString(value.geodeticDatum) &&
    isOptionalString(value.license) &&
    isOptionalString(value.projectRef) &&
    isOptionalNonEmptyString(value.siteRef)
  );
}

function isAppendExistingDatasetRowInput(value: unknown): value is AppendExistingDatasetRowInput {
  return (
    isRecord(value) &&
    isAppendExistingDatasetOccurrenceInput(value.occurrence) &&
    (value.floraMeasurement === null || isFloraMeasurementFields(value.floraMeasurement))
  );
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
  if (body.operation === "createMeasurement") {
    return typeof body.occurrenceRef === "string" && body.occurrenceRef.length > 0 && isFloraMeasurementFields(body.flora);
  }
  if (body.operation === "updateOccurrence") {
    return (
      typeof body.rkey === "string" &&
      body.rkey.length > 0 &&
      isUpdateOccurrenceData(body.data) &&
      isUpdateOccurrenceUnset(body.unset)
    );
  }
  if (body.operation === "detachOccurrenceFromDataset") {
    return typeof body.rkey === "string" && body.rkey.length > 0;
  }
  if (body.operation === "appendExistingDataset") {
    return (
      typeof body.datasetRkey === "string" &&
      body.datasetRkey.length > 0 &&
      Array.isArray(body.rows) &&
      body.rows.every(isAppendExistingDatasetRowInput) &&
      (typeof body.establishmentMeans === "string" || body.establishmentMeans === null || typeof body.establishmentMeans === "undefined")
    );
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

async function getPdsBaseUrl(did: string): Promise<string> {
  const configuredPdsUrl = getConfiguredPdsUrl();
  if (configuredPdsUrl) return configuredPdsUrl;
  const host = await resolvePdsHost(did);
  if (!host) throw new Error("Could not reach your saved tree information.");
  return `https://${host}`;
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

async function executeForwardableMutation<T>(body: ForwardableMutationBody, did: string, cookie: string | null, fallbackMessage = "Could not save your changes."): Promise<T> {
  const response = await forwardMutationResponse(body, did, cookie);
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.message ?? payload?.error ?? fallbackMessage);
  }
  return payload;
}

async function fetchRepoRecord(options: {
  did: string;
  collection: string;
  rkey: string;
  missingMessage: string;
}): Promise<DatasetRecordResult> {
  const { did, collection, rkey, missingMessage } = options;
  const pdsBaseUrl = await getPdsBaseUrl(did);
  const params = new URLSearchParams({ repo: did, collection, rkey });
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

  if (response.status === 404) {
    throw new TreeGroupUnavailableError(missingMessage);
  }

  if (!response.ok || !payload || typeof payload.uri !== "string" || typeof payload.cid !== "string" || !isRecord(payload.value)) {
    throw new Error(missingMessage);
  }

  return { uri: payload.uri, cid: payload.cid, rkey, record: payload.value };
}

async function getDatasetRecordFromPds(did: string, rkey: string): Promise<DatasetRecordResult> {
  const result = await fetchRepoRecord({
    did,
    collection: DATASET_COLLECTION,
    rkey,
    missingMessage: "Could not check the selected tree group.",
  });
  if (typeof result.record.name !== "string") {
    throw new Error("Could not check the selected tree group.");
  }
  return result;
}

function buildTreeDynamicProperties(datasetRef?: string): string {
  return JSON.stringify({
    dataType: "measuredTree",
    source: "bumicerts",
    ...(datasetRef ? { datasetRef } : {}),
  });
}

function makeOccurrenceId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `tree-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function isUnavailableLikeError(error: unknown): boolean {
  if (error instanceof TreeGroupUnavailableError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /not\s*found|could not find|no record/i.test(message) && /tree group|record|not\s*found/i.test(message);
}

function isRetryableCountError(error: unknown): boolean {
  if (error instanceof TreeGroupUnavailableError || isUnavailableLikeError(error)) return false;
  return true;
}

function buildRetryDelayMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * BASE_RETRY_DELAY_MS);
  return BASE_RETRY_DELAY_MS * 2 ** attempt + jitter;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMeasurementRecord(occurrenceRef: string, flora: FloraMeasurementFields): Record<string, unknown> {
  const basalDiameter = flora.basalDiameter ?? flora.diameter;
  return omitUndefined({
    $type: MEASUREMENT_COLLECTION,
    occurrenceRef,
    result: omitUndefined({
      $type: "app.gainforest.dwc.measurement#floraMeasurement",
      dbh: flora.dbh,
      totalHeight: flora.totalHeight,
      basalDiameter,
      canopyCoverPercent: flora.canopyCoverPercent,
    }),
    createdAt: new Date().toISOString(),
  });
}

function buildOccurrenceRecord(input: AppendExistingDatasetOccurrenceInput & {
  datasetRef?: string;
  dynamicProperties?: string;
  establishmentMeans?: string;
}): Record<string, unknown> {
  return omitUndefined({
    $type: OCCURRENCE_COLLECTION,
    scientificName: input.scientificName,
    eventDate: input.eventDate,
    decimalLatitude: input.decimalLatitude,
    decimalLongitude: input.decimalLongitude,
    basisOfRecord: input.basisOfRecord ?? "HumanObservation",
    occurrenceID: input.occurrenceID ?? makeOccurrenceId(),
    occurrenceStatus: input.occurrenceStatus ?? "present",
    geodeticDatum: input.geodeticDatum ?? "EPSG:4326",
    license: input.license ?? "CC-BY-4.0",
    kingdom: input.kingdom ?? "Plantae",
    vernacularName: input.vernacularName,
    recordedBy: input.recordedBy,
    locality: input.locality,
    country: input.country,
    countryCode: input.countryCode,
    occurrenceRemarks: input.occurrenceRemarks,
    habitat: input.habitat,
    samplingProtocol: input.samplingProtocol,
    projectRef: input.projectRef,
    siteRef: input.siteRef,
    establishmentMeans: input.establishmentMeans,
    datasetRef: input.datasetRef,
    dynamicProperties: input.dynamicProperties,
    createdAt: new Date().toISOString(),
  });
}

async function createMeasurement(body: Extract<MutationBody, { operation: "createMeasurement" }>, did: string, cookie: string | null): Promise<CreatedRecord> {
  const record = buildMeasurementRecord(body.occurrenceRef, body.flora);
  const result = await executeForwardableMutation<{ uri: string; cid: string }>({
    operation: "createRecord",
    collection: MEASUREMENT_COLLECTION,
    record,
  }, did, cookie, "Measurement could not be saved.").catch(() => {
    throw new Error("Measurement could not be saved.");
  });

  return { ...result, rkey: rkeyFromUri(result.uri), record };
}

async function createOccurrenceRecord(options: {
  did: string;
  cookie: string | null;
  occurrenceInput: AppendExistingDatasetOccurrenceInput & {
    datasetRef: string;
    dynamicProperties: string;
    establishmentMeans?: string;
  };
}): Promise<CreatedRecord> {
  const record = buildOccurrenceRecord(options.occurrenceInput);
  const result = await executeForwardableMutation<{ uri: string; cid: string }>({
    operation: "createRecord",
    collection: OCCURRENCE_COLLECTION,
    record,
  }, options.did, options.cookie, "Tree information could not be saved.").catch(() => {
    throw new Error("Tree information could not be saved.");
  });

  return { ...result, rkey: rkeyFromUri(result.uri), record };
}

async function createMeasurementRecord(options: {
  did: string;
  cookie: string | null;
  occurrenceUri: string;
  floraMeasurement: FloraMeasurementFields;
}): Promise<CreatedRecord> {
  return createMeasurement({
    operation: "createMeasurement",
    occurrenceRef: options.occurrenceUri,
    flora: options.floraMeasurement,
  }, options.did, options.cookie);
}

function getOccurrenceDatasetRef(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.datasetRef === "string" ? value.datasetRef : null;
}

async function listRepoRecords(options: {
  did: string;
  collection: string;
  cursor?: string;
}): Promise<{ records: { uri: string; cid?: string; value: unknown }[]; cursor?: string }> {
  const pdsBaseUrl = await getPdsBaseUrl(options.did);
  const params = new URLSearchParams({
    repo: options.did,
    collection: options.collection,
    limit: String(LIST_RECORDS_PAGE_LIMIT),
  });
  if (options.cursor) params.set("cursor", options.cursor);

  const response = await fetch(`${pdsBaseUrl}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    records?: unknown;
    cursor?: unknown;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || !payload || !Array.isArray(payload.records)) {
    throw new Error("Could not count trees in this tree group.");
  }

  return {
    records: payload.records.filter((item): item is { uri: string; cid?: string; value: unknown } => (
      isRecord(item) && typeof item.uri === "string" && "value" in item
    )),
    cursor: typeof payload.cursor === "string" ? payload.cursor : undefined,
  };
}

async function countDatasetOccurrences(options: { did: string; datasetUri: string }): Promise<number> {
  let cursor: string | undefined;
  let count = 0;

  do {
    const response = await listRepoRecords({
      did: options.did,
      collection: OCCURRENCE_COLLECTION,
      cursor,
    });

    for (const record of response.records) {
      if (getOccurrenceDatasetRef(record.value) === options.datasetUri) {
        count += 1;
      }
    }

    cursor = response.cursor;
  } while (cursor);

  return count;
}

async function updateDatasetRecordCount(options: {
  did: string;
  cookie: string | null;
  datasetRkey: string;
  incrementBy: number;
}): Promise<DatasetRecordResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_DATASET_COUNT_ATTEMPTS; attempt += 1) {
    const current = await getDatasetRecordFromPds(options.did, options.datasetRkey).catch((error) => {
      if (error instanceof TreeGroupUnavailableError || isUnavailableLikeError(error)) {
        throw new TreeGroupUnavailableError();
      }
      throw error;
    });
    const storedCount = typeof current.record.recordCount === "number" && Number.isFinite(current.record.recordCount)
      ? current.record.recordCount
      : null;
    const nextRecordCount = storedCount !== null
      ? storedCount + options.incrementBy
      : await countDatasetOccurrences({ did: options.did, datasetUri: current.uri });
    const nextRecord = {
      ...current.record,
      $type: typeof current.record.$type === "string" ? current.record.$type : DATASET_COLLECTION,
      recordCount: nextRecordCount,
    };

    try {
      const result = await executeForwardableMutation<{ uri: string; cid: string }>({
        operation: "putRecord",
        collection: DATASET_COLLECTION,
        rkey: options.datasetRkey,
        record: nextRecord,
        swapRecord: current.cid,
      }, options.did, options.cookie, "Tree group count could not be updated.");

      return { ...result, rkey: options.datasetRkey, record: nextRecord };
    } catch (error) {
      if (isUnavailableLikeError(error)) {
        throw new TreeGroupUnavailableError();
      }

      lastError = error;
      const isLastAttempt = attempt === MAX_DATASET_COUNT_ATTEMPTS - 1;
      if (isLastAttempt || !isRetryableCountError(error)) break;
      await delay(buildRetryDelayMs(attempt));
    }
  }

  throw new Error("Tree group count could not be updated.");
}

async function incrementDatasetRecordCount(
  body: Extract<MutationBody, { operation: "incrementDatasetRecordCount" }>,
  did: string,
  cookie: string | null,
): Promise<DatasetRecordResult> {
  return updateDatasetRecordCount({
    did,
    cookie,
    datasetRkey: body.rkey,
    incrementBy: body.increment,
  });
}

async function deleteStoredRecord(options: {
  did: string;
  cookie: string | null;
  collection: string;
  rkey: string;
}): Promise<void> {
  await executeForwardableMutation({
    operation: "deleteRecord",
    collection: options.collection,
    rkey: options.rkey,
  }, options.did, options.cookie, "Cleanup could not finish automatically.").catch(() => {
    throw new Error("Cleanup could not finish automatically.");
  });
}

async function detachOccurrenceFromDatasetByRkey(options: {
  did: string;
  cookie: string | null;
  rkey: string;
}): Promise<CreatedRecord> {
  const current = await fetchRepoRecord({
    did: options.did,
    collection: OCCURRENCE_COLLECTION,
    rkey: options.rkey,
    missingMessage: "Could not check the saved tree.",
  });
  const nextRecord: Record<string, unknown> = {
    ...current.record,
    $type: typeof current.record.$type === "string" ? current.record.$type : OCCURRENCE_COLLECTION,
    dynamicProperties: buildTreeDynamicProperties(),
  };
  delete nextRecord.datasetRef;

  try {
    const result = await executeForwardableMutation<{ uri: string; cid: string }>({
      operation: "putRecord",
      collection: OCCURRENCE_COLLECTION,
      rkey: options.rkey,
      record: nextRecord,
      swapRecord: current.cid,
    }, options.did, options.cookie, "The tree was saved, but it could not be moved out of the tree group automatically.");

    return { ...result, rkey: options.rkey, record: nextRecord };
  } catch {
    throw new Error("The tree was saved, but it could not be moved out of the tree group automatically.");
  }
}

function assertCoordinatePair(data: UpdateOccurrenceData): void {
  const hasLat = data.decimalLatitude !== undefined;
  const hasLon = data.decimalLongitude !== undefined;
  if (hasLat !== hasLon) {
    throw new Error("Enter both latitude and longitude, or leave both unchanged.");
  }
  if (!hasLat || !hasLon) return;

  const lat = Number(data.decimalLatitude);
  const lon = Number(data.decimalLongitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error("Enter a valid latitude and longitude.");
  }
}

async function updateOccurrenceByRkey(
  body: Extract<MutationBody, { operation: "updateOccurrence" }>,
  did: string,
  cookie: string | null,
): Promise<CreatedRecord> {
  assertCoordinatePair(body.data);
  const current = await fetchRepoRecord({
    did,
    collection: OCCURRENCE_COLLECTION,
    rkey: body.rkey,
    missingMessage: "Could not check the saved tree.",
  });
  const nextRecord: Record<string, unknown> = {
    ...current.record,
    ...body.data,
    $type: typeof current.record.$type === "string" ? current.record.$type : OCCURRENCE_COLLECTION,
    basisOfRecord: typeof current.record.basisOfRecord === "string" ? current.record.basisOfRecord : "HumanObservation",
    createdAt: typeof current.record.createdAt === "string" ? current.record.createdAt : new Date().toISOString(),
  };

  for (const field of body.unset ?? []) {
    delete nextRecord[field];
  }

  if (typeof nextRecord.scientificName !== "string" || nextRecord.scientificName.trim().length === 0) {
    throw new Error("Scientific name is required.");
  }
  if (typeof nextRecord.eventDate !== "string" || nextRecord.eventDate.trim().length === 0) {
    throw new Error("Event date is required.");
  }
  if (typeof nextRecord.decimalLatitude === "number") nextRecord.decimalLatitude = String(nextRecord.decimalLatitude);
  if (typeof nextRecord.decimalLongitude === "number") nextRecord.decimalLongitude = String(nextRecord.decimalLongitude);

  try {
    const result = await executeForwardableMutation<{ uri: string; cid: string }>({
      operation: "putRecord",
      collection: OCCURRENCE_COLLECTION,
      rkey: body.rkey,
      record: nextRecord,
      swapRecord: current.cid,
    }, did, cookie, "Tree could not be saved.");

    return { ...result, rkey: body.rkey, record: nextRecord };
  } catch {
    throw new Error("Tree could not be saved.");
  }
}

async function rollbackCreatedRecords(options: {
  did: string;
  cookie: string | null;
  measurementRkey: string | null;
  occurrenceRkey: string;
}): Promise<{ ok: boolean; error: string | null; occurrenceStillExists: boolean }> {
  if (options.measurementRkey) {
    try {
      await deleteStoredRecord({
        did: options.did,
        cookie: options.cookie,
        collection: MEASUREMENT_COLLECTION,
        rkey: options.measurementRkey,
      });
    } catch {
      return {
        ok: false,
        error: "Automatic cleanup could not remove the measurement.",
        occurrenceStillExists: true,
      };
    }
  }

  try {
    await deleteStoredRecord({
      did: options.did,
      cookie: options.cookie,
      collection: OCCURRENCE_COLLECTION,
      rkey: options.occurrenceRkey,
    });
    return { ok: true, error: null, occurrenceStillExists: false };
  } catch {
    return {
      ok: false,
      error: "Automatic cleanup could not remove the tree.",
      occurrenceStillExists: true,
    };
  }
}

function mergeErrorMessages(current: string, next: string): string {
  return current.includes(next) ? current : `${current} ${next}`;
}

function upsertPersistedPartialResult(options: {
  results: AppendExistingDatasetRowResult[];
  occurrence: PersistedOccurrence;
  error: string;
}): void {
  const existingIndex = options.results.findIndex((item) => item.index === options.occurrence.index);
  const nextPartial = {
    index: options.occurrence.index,
    state: "partial" as const,
    occurrenceUri: options.occurrence.occurrenceUri,
    photoCount: 0,
    error: options.error,
  };

  if (existingIndex === -1) {
    options.results.push(nextPartial);
    return;
  }

  const existing = options.results[existingIndex];
  if (!existing || existing.state === "error") {
    options.results[existingIndex] = nextPartial;
    return;
  }

  options.results[existingIndex] = {
    ...nextPartial,
    error: existing.state === "partial" ? mergeErrorMessages(existing.error, options.error) : options.error,
  };
}

async function detachTrackedOccurrences(options: {
  did: string;
  cookie: string | null;
  occurrences: PersistedOccurrence[];
  results: AppendExistingDatasetRowResult[];
}): Promise<void> {
  for (const occurrence of options.occurrences) {
    try {
      await detachOccurrenceFromDatasetByRkey({
        did: options.did,
        cookie: options.cookie,
        rkey: occurrence.occurrenceRkey,
      });
      upsertPersistedPartialResult({
        results: options.results,
        occurrence,
        error: "The selected tree group disappeared during upload, so this tree was kept without that group. Review this tree before retrying.",
      });
    } catch {
      upsertPersistedPartialResult({
        results: options.results,
        occurrence,
        error: "The selected tree group disappeared during upload and this tree could not be moved out of that group automatically. Review this tree before retrying.",
      });
    }
  }
}

function makeRowError(index: number, error: string): AppendExistingDatasetRowResult {
  return { index, state: "error", error };
}

function pushRemainingRowsUnavailableErrors(options: {
  results: AppendExistingDatasetRowResult[];
  startIndex: number;
  totalRows: number;
}): void {
  for (let remainingIndex = options.startIndex; remainingIndex < options.totalRows; remainingIndex += 1) {
    options.results.push(makeRowError(remainingIndex, TREE_GROUP_DISAPPEARED_MESSAGE));
  }
}

function appendRollbackMessage(base: string, rollbackError: string | null): string {
  return rollbackError ? `${base} ${rollbackError}` : base;
}

async function appendExistingDataset(
  body: Extract<MutationBody, { operation: "appendExistingDataset" }>,
  did: string,
  cookie: string | null,
): Promise<{
  datasetUri: string;
  datasetRkey: string;
  datasetBecameUnavailable: boolean;
  results: AppendExistingDatasetRowResult[];
}> {
  if (body.rows.length === 0) {
    throw new Error("Choose at least one tree to save.");
  }
  if (body.rows.length > APPEND_EXISTING_DATASET_MAX_ROWS) {
    throw new Error("Too many trees were sent at once. Try again with a smaller file.");
  }

  const datasetRecord = await getDatasetRecordFromPds(did, body.datasetRkey).catch((error) => {
    if (error instanceof TreeGroupUnavailableError || isUnavailableLikeError(error)) {
      throw new TreeGroupUnavailableError();
    }
    throw new Error("Could not check the selected tree group.");
  });
  const results: AppendExistingDatasetRowResult[] = [];
  const persistedOccurrences: PersistedOccurrence[] = [];
  let datasetBecameUnavailable = false;

  for (const [rowIndex, row] of body.rows.entries()) {
    const occurrenceInput = {
      ...row.occurrence,
      ...(body.establishmentMeans ? { establishmentMeans: body.establishmentMeans } : {}),
      datasetRef: datasetRecord.uri,
      dynamicProperties: buildTreeDynamicProperties(datasetRecord.uri),
    };

    let occurrence: CreatedRecord | null = null;
    let measurementRkey: string | null = null;

    try {
      occurrence = await createOccurrenceRecord({
        did,
        cookie,
        occurrenceInput,
      });

      if (row.floraMeasurement) {
        const measurement = await createMeasurementRecord({
          did,
          cookie,
          occurrenceUri: occurrence.uri,
          floraMeasurement: row.floraMeasurement,
        });
        measurementRkey = measurement.rkey;
      }

      await updateDatasetRecordCount({
        did,
        cookie,
        datasetRkey: body.datasetRkey,
        incrementBy: 1,
      });

      persistedOccurrences.push({
        index: rowIndex,
        occurrenceUri: occurrence.uri,
        occurrenceRkey: occurrence.rkey,
      });
      results.push({
        index: rowIndex,
        state: "success",
        occurrenceUri: occurrence.uri,
        photoCount: 0,
      });
    } catch (error) {
      if (occurrence === null) {
        results.push(makeRowError(rowIndex, error instanceof Error ? error.message : "Tree could not be saved."));
        continue;
      }

      const treeGroupUnavailable = error instanceof TreeGroupUnavailableError || isUnavailableLikeError(error);
      if (treeGroupUnavailable) {
        datasetBecameUnavailable = true;
      }

      const rollback = await rollbackCreatedRecords({
        did,
        cookie,
        measurementRkey,
        occurrenceRkey: occurrence.rkey,
      });

      if (rollback.ok) {
        if (treeGroupUnavailable) {
          await detachTrackedOccurrences({
            did,
            cookie,
            occurrences: persistedOccurrences,
            results,
          });
          results.push(makeRowError(rowIndex, TREE_GROUP_UNAVAILABLE_MESSAGE));
          pushRemainingRowsUnavailableErrors({
            results,
            startIndex: rowIndex + 1,
            totalRows: body.rows.length,
          });
          break;
        }

        results.push(makeRowError(rowIndex, error instanceof Error ? error.message : "Tree could not be saved."));
        continue;
      }

      const currentOccurrence: PersistedOccurrence = {
        index: rowIndex,
        occurrenceUri: occurrence.uri,
        occurrenceRkey: occurrence.rkey,
      };

      if (rollback.occurrenceStillExists) {
        if (treeGroupUnavailable) {
          await detachTrackedOccurrences({
            did,
            cookie,
            occurrences: persistedOccurrences,
            results,
          });

          try {
            await detachOccurrenceFromDatasetByRkey({ did, cookie, rkey: occurrence.rkey });
            results.push({
              index: rowIndex,
              state: "partial",
              occurrenceUri: occurrence.uri,
              photoCount: 0,
              error: appendRollbackMessage(
                "The selected tree group disappeared during upload, so this tree was kept without that group. Review this tree before retrying.",
                rollback.error,
              ),
            });
          } catch {
            results.push({
              index: rowIndex,
              state: "partial",
              occurrenceUri: occurrence.uri,
              photoCount: 0,
              error: appendRollbackMessage(
                "The selected tree group disappeared during upload and this tree could not be moved out of that group automatically. Review this tree before retrying.",
                rollback.error,
              ),
            });
          }

          pushRemainingRowsUnavailableErrors({
            results,
            startIndex: rowIndex + 1,
            totalRows: body.rows.length,
          });
          break;
        }

        persistedOccurrences.push(currentOccurrence);

        try {
          await updateDatasetRecordCount({
            did,
            cookie,
            datasetRkey: body.datasetRkey,
            incrementBy: 1,
          });
          results.push({
            index: rowIndex,
            state: "partial",
            occurrenceUri: occurrence.uri,
            photoCount: 0,
            error: appendRollbackMessage(
              "The tree was saved, but its measurement could not be saved and automatic cleanup could not finish. Review this tree before retrying.",
              rollback.error,
            ),
          });
        } catch (countError) {
          if (countError instanceof TreeGroupUnavailableError || isUnavailableLikeError(countError)) {
            datasetBecameUnavailable = true;
            await detachTrackedOccurrences({
              did,
              cookie,
              occurrences: persistedOccurrences,
              results,
            });
            upsertPersistedPartialResult({
              results,
              occurrence: currentOccurrence,
              error: appendRollbackMessage(
                "The selected tree group disappeared during upload, so this tree was kept without that group. Review this tree before retrying.",
                rollback.error,
              ),
            });
            pushRemainingRowsUnavailableErrors({
              results,
              startIndex: rowIndex + 1,
              totalRows: body.rows.length,
            });
            break;
          }

          results.push({
            index: rowIndex,
            state: "partial",
            occurrenceUri: occurrence.uri,
            photoCount: 0,
            error: appendRollbackMessage(
              "The tree was saved, but cleanup and the tree group count could not be finished automatically. Review this tree before retrying.",
              rollback.error,
            ),
          });
        }
        continue;
      }

      results.push(makeRowError(rowIndex, appendRollbackMessage(
        "The tree could not be saved, and cleanup could not finish automatically.",
        rollback.error,
      )));
    }
  }

  return {
    datasetUri: datasetRecord.uri,
    datasetRkey: body.datasetRkey,
    datasetBecameUnavailable,
    results,
  };
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
  }, did, cookie, "Photo could not be saved.");
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
  }, did, cookie, "Photo could not be saved.");

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
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
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

  if (body.operation === "createMeasurement") {
    try {
      const result = await createMeasurement(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Measurement could not be saved." }, { status: 502 });
    }
  }

  if (body.operation === "updateOccurrence") {
    try {
      const result = await updateOccurrenceByRkey(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Tree could not be saved." }, { status: 502 });
    }
  }

  if (body.operation === "detachOccurrenceFromDataset") {
    try {
      const result = await detachOccurrenceFromDatasetByRkey({
        did: session.did,
        cookie,
        rkey: body.rkey,
      });
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "The tree could not be updated." }, { status: 502 });
    }
  }

  if (body.operation === "appendExistingDataset") {
    try {
      const result = await appendExistingDataset(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Trees could not be saved to the selected tree group." }, { status: 502 });
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
