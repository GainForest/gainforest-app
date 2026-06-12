import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { TREE_FUTURE_DATE_ERROR, isTreeDateInFuture } from "@/app/_lib/tree-date-validation";
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
  result?: FloraMeasurementFields & { $type?: string };
};

type UpdateMultimediaData = {
  caption?: string;
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
    };

type ForwardableMutationBody = Exclude<
  MutationBody,
  | { operation: "createMultimediaFromUrl" }
  | { operation: "createMultimediaFromFile" }
  | { operation: "getDatasetRecord" }
  | { operation: "getCertifiedLocationRecord" }
  | { operation: "incrementDatasetRecordCount" }
  | { operation: "createMeasurement" }
  | { operation: "updateMeasurement" }
  | { operation: "updateOccurrence" }
  | { operation: "updateMultimedia" }
  | { operation: "deleteOccurrenceCascade" }
  | { operation: "deleteTreeGroupCascade" }
  | { operation: "detachOccurrenceFromDataset" }
  | { operation: "attachExistingOccurrences" }
  | { operation: "appendExistingDataset" }
>;
type PdsSession = { did: string; accessJwt: string };
type DatasetRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
type CreatedRecord = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type PersistedOccurrence = { index: number; occurrenceUri: string; occurrenceRkey: string };

const MULTIMEDIA_COLLECTION = "app.gainforest.ac.multimedia";
const DATASET_COLLECTION = "app.gainforest.dwc.dataset";
const CERTIFIED_LOCATION_COLLECTION = "app.certified.location";
const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const MEASUREMENT_COLLECTION = "app.gainforest.dwc.measurement";
const FLORA_MEASUREMENT_TYPE = "app.gainforest.dwc.measurement#floraMeasurement";
const MAX_URL_IMAGE_BYTES = 4.5 * 1024 * 1024;
const PHOTO_FETCH_TIMEOUT_MS = 30_000;
const MAX_PHOTO_REDIRECTS = 5;
const APPEND_EXISTING_DATASET_MAX_ROWS = 10;
const ATTACH_EXISTING_TREE_GROUP_MAX_TREES = 50;
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

function hasFutureTreeEventDate(value: unknown): boolean {
  return typeof value === "string" && isTreeDateInFuture(value);
}

function getMutationFutureDateError(body: MutationBody): string | null {
  if ((body.operation === "createRecord" || body.operation === "putRecord") && body.collection === OCCURRENCE_COLLECTION) {
    return hasFutureTreeEventDate(body.record.eventDate) ? TREE_FUTURE_DATE_ERROR : null;
  }

  if (body.operation === "updateOccurrence") {
    return hasFutureTreeEventDate(body.data.eventDate) ? TREE_FUTURE_DATE_ERROR : null;
  }

  if (body.operation === "appendExistingDataset") {
    return body.rows.some((row) => hasFutureTreeEventDate(row.occurrence.eventDate)) ? TREE_FUTURE_DATE_ERROR : null;
  }

  return null;
}

function assertTreeEventDateIsNotFuture(value: unknown): void {
  if (hasFutureTreeEventDate(value)) throw new Error(TREE_FUTURE_DATE_ERROR);
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

const UPDATE_OCCURRENCE_DATA_FIELDS = new Set([
  "scientificName",
  "vernacularName",
  "eventDate",
  "recordedBy",
  "decimalLatitude",
  "decimalLongitude",
  "locality",
  "country",
  "habitat",
  "establishmentMeans",
  "occurrenceRemarks",
]);

const UPDATE_OCCURRENCE_UNSET_FIELDS = new Set([
  "vernacularName",
  "recordedBy",
  "locality",
  "country",
  "habitat",
  "establishmentMeans",
  "occurrenceRemarks",
  "fieldNotes",
]);

const UPDATE_MULTIMEDIA_DATA_FIELDS = new Set([
  "caption",
]);

const UPDATE_MULTIMEDIA_UNSET_FIELDS = new Set([
  "caption",
]);

const UPDATE_MEASUREMENT_DATA_FIELDS = new Set([
  "result",
]);

const UPDATE_FLORA_MEASUREMENT_RESULT_FIELDS = new Set([
  "$type",
  "dbh",
  "totalHeight",
  "basalDiameter",
  "canopyCoverPercent",
]);

const UPDATE_FLORA_MEASUREMENT_RESULT_UNSET_FIELDS = new Set([
  "dbh",
  "totalHeight",
  "basalDiameter",
  "canopyCoverPercent",
]);

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isUpdateOccurrenceData(value: unknown): value is UpdateOccurrenceData {
  if (!isRecord(value) || !hasOnlyKeys(value, UPDATE_OCCURRENCE_DATA_FIELDS)) return false;
  return (
    isOptionalString(value.scientificName) &&
    isOptionalString(value.vernacularName) &&
    isOptionalString(value.eventDate) &&
    isOptionalString(value.recordedBy) &&
    isOptionalString(value.decimalLatitude) &&
    isOptionalString(value.decimalLongitude) &&
    isOptionalString(value.locality) &&
    isOptionalString(value.country) &&
    isOptionalString(value.habitat) &&
    isOptionalString(value.establishmentMeans) &&
    isOptionalString(value.occurrenceRemarks)
  );
}

function isFloraMeasurementResultPatch(value: unknown): value is FloraMeasurementFields & { $type?: string } {
  if (!isRecord(value) || !hasOnlyKeys(value, UPDATE_FLORA_MEASUREMENT_RESULT_FIELDS)) return false;
  return (
    (typeof value.$type === "undefined" || value.$type === FLORA_MEASUREMENT_TYPE) &&
    isOptionalString(value.dbh) &&
    isOptionalString(value.totalHeight) &&
    isOptionalString(value.basalDiameter) &&
    isOptionalString(value.canopyCoverPercent)
  );
}

function isUpdateMeasurementData(value: unknown): value is UpdateMeasurementData {
  if (!isRecord(value) || !hasOnlyKeys(value, UPDATE_MEASUREMENT_DATA_FIELDS)) return false;
  return typeof value.result === "undefined" || isFloraMeasurementResultPatch(value.result);
}

function isUpdateMultimediaData(value: unknown): value is UpdateMultimediaData {
  if (!isRecord(value) || !hasOnlyKeys(value, UPDATE_MULTIMEDIA_DATA_FIELDS)) return false;
  return isOptionalString(value.caption);
}

function isStringUnsetList(value: unknown, allowed: Set<string>): value is string[] | undefined {
  return typeof value === "undefined" || (
    Array.isArray(value) && value.every((field) => typeof field === "string" && allowed.has(field))
  );
}

function isUpdateOccurrenceUnset(value: unknown): value is string[] | undefined {
  return isStringUnsetList(value, UPDATE_OCCURRENCE_UNSET_FIELDS);
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
  if (body.operation === "createMultimediaFromFile") {
    return (
      typeof body.blobData === "string" &&
      typeof body.blobMimeType === "string" &&
      typeof body.occurrenceRef === "string" &&
      isOptionalString(body.siteRef) &&
      typeof body.subjectPart === "string" &&
      body.subjectPart.trim().length > 0 &&
      isOptionalString(body.caption)
    );
  }
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
  if (body.operation === "getCertifiedLocationRecord") return typeof body.rkey === "string" && body.rkey.length > 0;
  if (body.operation === "incrementDatasetRecordCount") {
    return typeof body.rkey === "string" && body.rkey.length > 0 && typeof body.increment === "number" && Number.isInteger(body.increment) && body.increment >= 0;
  }
  if (body.operation === "createMeasurement") {
    return typeof body.occurrenceRef === "string" && body.occurrenceRef.length > 0 && isFloraMeasurementFields(body.flora);
  }
  if (body.operation === "updateMeasurement") {
    return (
      typeof body.rkey === "string" &&
      body.rkey.length > 0 &&
      isUpdateMeasurementData(body.data) &&
      isStringUnsetList(body.unset, new Set()) &&
      isStringUnsetList(body.resultUnset, UPDATE_FLORA_MEASUREMENT_RESULT_UNSET_FIELDS)
    );
  }
  if (body.operation === "updateOccurrence") {
    return (
      typeof body.rkey === "string" &&
      body.rkey.length > 0 &&
      isUpdateOccurrenceData(body.data) &&
      isUpdateOccurrenceUnset(body.unset)
    );
  }
  if (body.operation === "updateMultimedia") {
    return (
      typeof body.rkey === "string" &&
      body.rkey.length > 0 &&
      isUpdateMultimediaData(body.data) &&
      isStringUnsetList(body.unset, UPDATE_MULTIMEDIA_UNSET_FIELDS)
    );
  }
  if (body.operation === "deleteOccurrenceCascade") {
    return typeof body.rkey === "string" && body.rkey.length > 0;
  }
  if (body.operation === "deleteTreeGroupCascade") {
    return typeof body.datasetRkey === "string" && body.datasetRkey.length > 0;
  }
  if (body.operation === "detachOccurrenceFromDataset") {
    return typeof body.rkey === "string" && body.rkey.length > 0;
  }
  if (body.operation === "attachExistingOccurrences") {
    return (
      typeof body.datasetRkey === "string" &&
      body.datasetRkey.length > 0 &&
      Array.isArray(body.occurrenceRkeys) &&
      body.occurrenceRkeys.length > 0 &&
      body.occurrenceRkeys.length <= ATTACH_EXISTING_TREE_GROUP_MAX_TREES &&
      body.occurrenceRkeys.every((rkey) => typeof rkey === "string" && rkey.length > 0)
    );
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
  const configuredDid = process.env.E2E_TEST_DID?.trim();
  if (configuredPdsUrl && (!configuredDid || configuredDid === did)) return configuredPdsUrl;
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
  const futureDateError = getMutationFutureDateError(body);
  if (futureDateError) return Response.json({ error: futureDateError }, { status: 400 });

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

async function getCertifiedLocationRecordFromPds(did: string, rkey: string): Promise<DatasetRecordResult> {
  return fetchRepoRecord({
    did,
    collection: CERTIFIED_LOCATION_COLLECTION,
    rkey,
    missingMessage: "Could not check the selected site.",
  });
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
  assertTreeEventDateIsNotFuture(options.occurrenceInput.eventDate);
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
      ? Math.max(0, storedCount + options.incrementBy)
      : Math.max(0, await countDatasetOccurrences({ did: options.did, datasetUri: current.uri }));
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

function mergeTreeGroupDynamicProperties(value: unknown, datasetRef: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return buildTreeDynamicProperties(datasetRef);
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || Array.isArray(parsed)) return value;
    return JSON.stringify({ ...parsed, datasetRef });
  } catch {
    return value;
  }
}

async function attachExistingOccurrencesToDataset(
  body: Extract<MutationBody, { operation: "attachExistingOccurrences" }>,
  did: string,
  cookie: string | null,
): Promise<{
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
}> {
  const occurrenceRkeys = Array.from(new Set(body.occurrenceRkeys.filter(Boolean)));
  if (occurrenceRkeys.length === 0) throw new Error("Choose at least one tree to add.");
  if (occurrenceRkeys.length > ATTACH_EXISTING_TREE_GROUP_MAX_TREES) {
    throw new Error("Choose fewer trees and try again.");
  }

  const datasetRecord = await getDatasetRecordFromPds(did, body.datasetRkey).catch((error) => {
    if (error instanceof TreeGroupUnavailableError || isUnavailableLikeError(error)) {
      throw new TreeGroupUnavailableError();
    }
    throw new Error("Could not check the selected tree group.");
  });

  const results: Array<
    | { rkey: string; state: "success"; occurrenceUri: string }
    | { rkey: string; state: "skipped"; reason: string }
    | { rkey: string; state: "error"; error: string }
  > = [];
  let attachedCount = 0;

  for (const rkey of occurrenceRkeys) {
    try {
      const current = await fetchRepoRecord({
        did,
        collection: OCCURRENCE_COLLECTION,
        rkey,
        missingMessage: "Could not check one of the selected trees.",
      });

      if (getOccurrenceDatasetRef(current.record)) {
        results.push({ rkey, state: "skipped", reason: "This tree is already in a tree group." });
        continue;
      }

      const nextRecord: Record<string, unknown> = {
        ...current.record,
        $type: typeof current.record.$type === "string" ? current.record.$type : OCCURRENCE_COLLECTION,
        datasetRef: datasetRecord.uri,
        dynamicProperties: mergeTreeGroupDynamicProperties(current.record.dynamicProperties, datasetRecord.uri),
      };

      await executeForwardableMutation<{ uri: string; cid: string }>({
        operation: "putRecord",
        collection: OCCURRENCE_COLLECTION,
        rkey,
        record: nextRecord,
        swapRecord: current.cid,
      }, did, cookie, "Tree could not be added to the tree group.");

      attachedCount += 1;
      results.push({ rkey, state: "success", occurrenceUri: current.uri });
    } catch (error) {
      results.push({
        rkey,
        state: "error",
        error: error instanceof Error ? error.message : "Tree could not be added to the tree group.",
      });
    }
  }

  let datasetCountUpdated = true;
  let datasetCountError: string | null = null;
  if (attachedCount > 0) {
    try {
      await updateDatasetRecordCount({
        did,
        cookie,
        datasetRkey: body.datasetRkey,
        incrementBy: attachedCount,
      });
    } catch (error) {
      datasetCountUpdated = false;
      datasetCountError = error instanceof Error ? error.message : "Tree group count could not be updated.";
    }
  }

  return {
    datasetUri: datasetRecord.uri,
    datasetRkey: body.datasetRkey,
    attachedCount,
    skippedCount: results.filter((result) => result.state === "skipped").length,
    errorCount: results.filter((result) => result.state === "error").length,
    datasetCountUpdated,
    datasetCountError,
    results,
  };
}

function hasCoordinateValue(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === "string" && value.trim().length === 0);
}

function pickAllowedPatch(source: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) patch[key] = source[key];
  }
  return patch;
}

function assertCoordinatePair(record: Record<string, unknown>): void {
  const hasLat = hasCoordinateValue(record.decimalLatitude);
  const hasLon = hasCoordinateValue(record.decimalLongitude);
  if (hasLat !== hasLon) {
    throw new Error("Enter both latitude and longitude.");
  }
  if (!hasLat || !hasLon) {
    throw new Error("Latitude and longitude are required.");
  }

  const lat = Number(record.decimalLatitude);
  const lon = Number(record.decimalLongitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error("Enter a valid latitude and longitude.");
  }
}

async function updateOccurrenceByRkey(
  body: Extract<MutationBody, { operation: "updateOccurrence" }>,
  did: string,
  cookie: string | null,
): Promise<CreatedRecord> {
  const current = await fetchRepoRecord({
    did,
    collection: OCCURRENCE_COLLECTION,
    rkey: body.rkey,
    missingMessage: "Could not check the saved tree.",
  });
  const nextRecord: Record<string, unknown> = {
    ...current.record,
    ...pickAllowedPatch(body.data, UPDATE_OCCURRENCE_DATA_FIELDS),
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
  assertTreeEventDateIsNotFuture(nextRecord.eventDate);
  if (typeof nextRecord.decimalLatitude === "number") nextRecord.decimalLatitude = String(nextRecord.decimalLatitude);
  if (typeof nextRecord.decimalLongitude === "number") nextRecord.decimalLongitude = String(nextRecord.decimalLongitude);
  assertCoordinatePair(nextRecord);

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

function mergeMeasurementResult(
  currentResult: unknown,
  patchResult: Record<string, unknown> | undefined,
  resultUnset: string[],
): unknown {
  if (!patchResult && resultUnset.length === 0) return currentResult ?? null;

  const nextResult: Record<string, unknown> = isRecord(currentResult) ? { ...currentResult } : {};
  if (patchResult) {
    Object.assign(nextResult, patchResult);
    if (typeof currentResult === "object" && currentResult !== null && isRecord(currentResult) && typeof currentResult.$type === "string" && typeof nextResult.$type !== "string") {
      nextResult.$type = currentResult.$type;
    }
  }

  for (const field of resultUnset) {
    delete nextResult[field];
  }

  return Object.keys(nextResult).length > 0 ? nextResult : null;
}

async function updateMeasurementByRkey(
  body: Extract<MutationBody, { operation: "updateMeasurement" }>,
  did: string,
  cookie: string | null,
): Promise<CreatedRecord> {
  const current = await fetchRepoRecord({
    did,
    collection: MEASUREMENT_COLLECTION,
    rkey: body.rkey,
    missingMessage: "Could not check the measurement.",
  });
  const resultUnset = body.resultUnset ?? [];
  const nextRecord: Record<string, unknown> = {
    ...current.record,
    $type: typeof current.record.$type === "string" ? current.record.$type : MEASUREMENT_COLLECTION,
    createdAt: typeof current.record.createdAt === "string" ? current.record.createdAt : new Date().toISOString(),
  };

  if (body.data.result !== undefined || resultUnset.length > 0) {
    nextRecord.result = mergeMeasurementResult(current.record.result, body.data.result, resultUnset);
  }

  for (const field of body.unset ?? []) {
    delete nextRecord[field];
  }

  try {
    const result = await executeForwardableMutation<{ uri: string; cid: string }>({
      operation: "putRecord",
      collection: MEASUREMENT_COLLECTION,
      rkey: body.rkey,
      record: nextRecord,
      swapRecord: current.cid,
    }, did, cookie, "Measurement could not be saved.");

    return { ...result, rkey: body.rkey, record: nextRecord };
  } catch {
    throw new Error("Measurement could not be saved.");
  }
}

async function updateMultimediaByRkey(
  body: Extract<MutationBody, { operation: "updateMultimedia" }>,
  did: string,
  cookie: string | null,
): Promise<CreatedRecord> {
  const current = await fetchRepoRecord({
    did,
    collection: MULTIMEDIA_COLLECTION,
    rkey: body.rkey,
    missingMessage: "Could not check the photo.",
  });
  const nextRecord: Record<string, unknown> = {
    ...current.record,
    ...pickAllowedPatch(body.data, UPDATE_MULTIMEDIA_DATA_FIELDS),
    $type: typeof current.record.$type === "string" ? current.record.$type : MULTIMEDIA_COLLECTION,
    createdAt: typeof current.record.createdAt === "string" ? current.record.createdAt : new Date().toISOString(),
  };

  for (const field of body.unset ?? []) {
    delete nextRecord[field];
  }

  try {
    const result = await executeForwardableMutation<{ uri: string; cid: string }>({
      operation: "putRecord",
      collection: MULTIMEDIA_COLLECTION,
      rkey: body.rkey,
      record: nextRecord,
      swapRecord: current.cid,
    }, did, cookie, "Photo could not be saved.");

    return { ...result, rkey: body.rkey, record: nextRecord };
  } catch {
    throw new Error("Photo could not be saved.");
  }
}

function recordOccurrenceRef(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.occurrenceRef === "string" ? value.occurrenceRef : null;
}

async function listLinkedRecordRkeys(options: {
  did: string;
  collection: string;
  occurrenceUri: string;
}): Promise<string[]> {
  const rkeys: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await listRepoRecords({
      did: options.did,
      collection: options.collection,
      cursor,
    });

    for (const record of page.records) {
      if (recordOccurrenceRef(record.value) === options.occurrenceUri) {
        rkeys.push(rkeyFromUri(record.uri));
      }
    }

    cursor = page.cursor;
  } while (cursor);

  return rkeys.filter(Boolean);
}

async function listDatasetOccurrenceRefs(options: {
  did: string;
  datasetUri: string;
}): Promise<Array<{ rkey: string; uri: string }>> {
  const trees: Array<{ rkey: string; uri: string }> = [];
  let cursor: string | undefined;

  do {
    const page = await listRepoRecords({
      did: options.did,
      collection: OCCURRENCE_COLLECTION,
      cursor,
    });

    for (const record of page.records) {
      if (getOccurrenceDatasetRef(record.value) !== options.datasetUri) continue;
      const rkey = rkeyFromUri(record.uri);
      if (rkey) trees.push({ rkey, uri: record.uri });
    }

    cursor = page.cursor;
  } while (cursor);

  return trees;
}

function pushUniqueError(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

async function deleteTreeGroupCascadeByRkey(
  body: Extract<MutationBody, { operation: "deleteTreeGroupCascade" }>,
  did: string,
  cookie: string | null,
): Promise<{
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
}> {
  const treeGroup = await getDatasetRecordFromPds(did, body.datasetRkey).catch((error) => {
    if (error instanceof TreeGroupUnavailableError || isUnavailableLikeError(error)) {
      throw new TreeGroupUnavailableError("The selected tree group is no longer available.");
    }
    throw new Error("Could not check the selected tree group.");
  });

  const linkedTrees = await listDatasetOccurrenceRefs({ did, datasetUri: treeGroup.uri }).catch(() => {
    throw new Error("Could not check trees in this tree group.");
  });

  const deletedTreeRkeys: string[] = [];
  const deletedTreeUris: string[] = [];
  const deletedMeasurementRkeys: string[] = [];
  const deletedMultimediaRkeys: string[] = [];
  const errors: string[] = [];
  let failedTreeCount = 0;
  let cleanupErrorCount = 0;

  for (const tree of linkedTrees) {
    let measurementRkeys: string[];
    let multimediaRkeys: string[];

    try {
      [measurementRkeys, multimediaRkeys] = await Promise.all([
        listLinkedRecordRkeys({ did, collection: MEASUREMENT_COLLECTION, occurrenceUri: tree.uri }),
        listLinkedRecordRkeys({ did, collection: MULTIMEDIA_COLLECTION, occurrenceUri: tree.uri }),
      ]);
    } catch {
      failedTreeCount += 1;
      pushUniqueError(errors, "Could not check linked photos and measurements for one tree.");
      continue;
    }

    try {
      await deleteStoredRecord({
        did,
        cookie,
        collection: OCCURRENCE_COLLECTION,
        rkey: tree.rkey,
      });
      deletedTreeRkeys.push(tree.rkey);
      deletedTreeUris.push(tree.uri);
    } catch {
      failedTreeCount += 1;
      pushUniqueError(errors, "A tree in this tree group could not be deleted.");
      continue;
    }

    for (const rkey of measurementRkeys) {
      try {
        await deleteStoredRecord({ did, cookie, collection: MEASUREMENT_COLLECTION, rkey });
        deletedMeasurementRkeys.push(rkey);
      } catch {
        cleanupErrorCount += 1;
        pushUniqueError(errors, "Some linked measurements could not be deleted.");
      }
    }

    for (const rkey of multimediaRkeys) {
      try {
        await deleteStoredRecord({ did, cookie, collection: MULTIMEDIA_COLLECTION, rkey });
        deletedMultimediaRkeys.push(rkey);
      } catch {
        cleanupErrorCount += 1;
        pushUniqueError(errors, "Some linked photos could not be deleted.");
      }
    }
  }

  let treeGroupDeleted = false;
  let treeGroupDeleteError: string | null = null;

  if (failedTreeCount === 0) {
    try {
      await deleteStoredRecord({
        did,
        cookie,
        collection: DATASET_COLLECTION,
        rkey: body.datasetRkey,
      });
      treeGroupDeleted = true;
    } catch {
      treeGroupDeleteError = "Tree group could not be deleted.";
      pushUniqueError(errors, treeGroupDeleteError);
    }
  } else {
    treeGroupDeleteError = "The tree group was kept because not all trees could be deleted.";
    pushUniqueError(errors, treeGroupDeleteError);
  }

  return {
    treeGroupRkey: body.datasetRkey,
    treeGroupUri: treeGroup.uri,
    foundTreeCount: linkedTrees.length,
    deletedTreeRkeys,
    deletedTreeUris,
    deletedMeasurementRkeys,
    deletedMultimediaRkeys,
    failedTreeCount,
    cleanupErrorCount,
    treeGroupDeleted,
    treeGroupDeleteError,
    errors,
  };
}

async function deleteOccurrenceCascadeByRkey(
  body: Extract<MutationBody, { operation: "deleteOccurrenceCascade" }>,
  did: string,
  cookie: string | null,
): Promise<{
  deletedOccurrenceRkey: string;
  deletedMeasurementRkeys: string[];
  deletedMultimediaRkeys: string[];
  treeGroupCountUpdated: boolean;
  treeGroupCountError: string | null;
  cleanupError: string | null;
}> {
  const current = await fetchRepoRecord({
    did,
    collection: OCCURRENCE_COLLECTION,
    rkey: body.rkey,
    missingMessage: "Could not check the saved tree.",
  });
  const occurrenceUri = current.uri;
  const datasetRef = getOccurrenceDatasetRef(current.record);
  const datasetRkey = datasetRef ? rkeyFromUri(datasetRef) : null;

  const [measurementRkeys, multimediaRkeys] = await Promise.all([
    listLinkedRecordRkeys({ did, collection: MEASUREMENT_COLLECTION, occurrenceUri }),
    listLinkedRecordRkeys({ did, collection: MULTIMEDIA_COLLECTION, occurrenceUri }),
  ]).catch(() => {
    throw new Error("Could not check linked photos and measurements.");
  });

  await deleteStoredRecord({
    did,
    cookie,
    collection: OCCURRENCE_COLLECTION,
    rkey: body.rkey,
  }).catch(() => {
    throw new Error("Tree could not be deleted.");
  });

  const deletedMeasurementRkeys: string[] = [];
  const deletedMultimediaRkeys: string[] = [];
  let linkedCleanupFailed = false;

  for (const rkey of measurementRkeys) {
    try {
      await deleteStoredRecord({ did, cookie, collection: MEASUREMENT_COLLECTION, rkey });
      deletedMeasurementRkeys.push(rkey);
    } catch {
      linkedCleanupFailed = true;
    }
  }

  for (const rkey of multimediaRkeys) {
    try {
      await deleteStoredRecord({ did, cookie, collection: MULTIMEDIA_COLLECTION, rkey });
      deletedMultimediaRkeys.push(rkey);
    } catch {
      linkedCleanupFailed = true;
    }
  }

  let treeGroupCountUpdated = true;
  let treeGroupCountError: string | null = null;
  if (datasetRkey) {
    try {
      await updateDatasetRecordCount({
        did,
        cookie,
        datasetRkey,
        incrementBy: -1,
      });
    } catch (error) {
      treeGroupCountUpdated = false;
      treeGroupCountError = error instanceof Error ? error.message : "Tree group count could not be updated.";
    }
  }

  return {
    deletedOccurrenceRkey: body.rkey,
    deletedMeasurementRkeys,
    deletedMultimediaRkeys,
    treeGroupCountUpdated,
    treeGroupCountError,
    cleanupError: linkedCleanupFailed ? "Some linked photos or measurements could not be removed automatically." : null,
  };
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

function normalizeAcceptedPhotoMimeType(mimeType: string): string {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ACCEPTED_URL_IMAGE_MIME_TYPES.has(normalized)) {
    throw new Error("Use a JPG, PNG, WebP, or HEIC photo.");
  }
  return normalized;
}

function decodeUploadedPhotoBytes(blobData: string, blobMimeType: string): { bytes: Buffer; mimeType: string } {
  const mimeType = normalizeAcceptedPhotoMimeType(blobMimeType);
  const bytes = Buffer.from(blobData, "base64");
  if (bytes.byteLength === 0) throw new Error("Choose a photo to upload.");
  if (bytes.byteLength > MAX_URL_IMAGE_BYTES) throw photoTooLargeError(bytes.byteLength);
  return { bytes, mimeType };
}

async function createMultimediaFromPhotoBytes(
  input: {
    bytes: Uint8Array;
    mimeType: string;
    occurrenceRef: string;
    siteRef?: string;
    subjectPart: string;
    caption?: string;
  },
  did: string,
  cookie: string | null,
): Promise<{ uri: string; cid: string; rkey: string; record: Record<string, unknown> }> {
  const uploadResult = await executeForwardableMutation<unknown>({
    operation: "uploadBlob",
    blobData: Buffer.from(input.bytes).toString("base64"),
    blobMimeType: input.mimeType,
  }, did, cookie, "Photo could not be saved.");
  const file = getUploadedBlob(uploadResult, input.mimeType, input.bytes.byteLength);
  const record = omitUndefined({
    $type: MULTIMEDIA_COLLECTION,
    file,
    occurrenceRef: input.occurrenceRef,
    siteRef: input.siteRef,
    subjectPart: input.subjectPart,
    caption: input.caption,
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

async function createMultimediaFromFile(
  body: Extract<MutationBody, { operation: "createMultimediaFromFile" }>,
  did: string,
  cookie: string | null,
): Promise<{ uri: string; cid: string; rkey: string; record: Record<string, unknown> }> {
  const { bytes, mimeType } = decodeUploadedPhotoBytes(body.blobData, body.blobMimeType);
  return createMultimediaFromPhotoBytes({
    bytes,
    mimeType,
    occurrenceRef: body.occurrenceRef,
    siteRef: body.siteRef,
    subjectPart: body.subjectPart,
    caption: body.caption,
  }, did, cookie);
}

async function createMultimediaFromUrl(
  body: Extract<MutationBody, { operation: "createMultimediaFromUrl" }>,
  did: string,
  cookie: string | null,
): Promise<{ uri: string; cid: string; rkey: string; record: Record<string, unknown> }> {
  const { bytes, mimeType } = await fetchPhotoBytes(body.url);
  return createMultimediaFromPhotoBytes({
    bytes,
    mimeType,
    occurrenceRef: body.occurrenceRef,
    siteRef: body.siteRef,
    subjectPart: body.subjectPart,
    caption: body.caption,
  }, did, cookie);
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

  const futureDateError = getMutationFutureDateError(body);
  if (futureDateError) {
    return Response.json({ error: futureDateError }, { status: 400 });
  }

  if (body.operation === "getDatasetRecord") {
    try {
      const result = await getDatasetRecordFromPds(session.did, body.rkey);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Could not check the selected tree group." }, { status: 502 });
    }
  }

  if (body.operation === "getCertifiedLocationRecord") {
    try {
      const result = await getCertifiedLocationRecordFromPds(session.did, body.rkey);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Could not check the selected site." }, { status: 502 });
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

  if (body.operation === "updateMeasurement") {
    try {
      const result = await updateMeasurementByRkey(body, session.did, cookie);
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

  if (body.operation === "updateMultimedia") {
    try {
      const result = await updateMultimediaByRkey(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Photo could not be saved." }, { status: 502 });
    }
  }

  if (body.operation === "deleteOccurrenceCascade") {
    try {
      const result = await deleteOccurrenceCascadeByRkey(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Tree could not be deleted." }, { status: 502 });
    }
  }

  if (body.operation === "deleteTreeGroupCascade") {
    try {
      const result = await deleteTreeGroupCascadeByRkey(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Tree group could not be deleted." }, { status: 502 });
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

  if (body.operation === "attachExistingOccurrences") {
    try {
      const result = await attachExistingOccurrencesToDataset(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Trees could not be added to the selected tree group." }, { status: 502 });
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

  if (body.operation === "createMultimediaFromFile") {
    try {
      const result = await createMultimediaFromFile(body, session.did, cookie);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Photo could not be saved." }, { status: 502 });
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
