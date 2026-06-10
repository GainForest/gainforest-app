import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getE2EEnv } from "./env";
import { readDisposableAccountMetadata } from "./disposable-email";

export const E2E_PDS_COLLECTIONS = {
  claimActivity: "org.hypercerts.claim.activity",
  certifiedLocation: "app.certified.location",
  occurrence: "app.gainforest.dwc.occurrence",
  audioRecording: "app.gainforest.ac.audio",
} as const;

export const createdRecordsPath = "e2e/.auth/created-records.jsonl";

export type PdsRepoRecord = {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
};

type PdsReadAccount = {
  did: string;
  serviceEndpoint: string;
  source: "disposable-email" | "static-env";
};

type ParsedAtUri = {
  did: string;
  collection: string;
  rkey: string;
};

type ListedCreatedRecord = {
  uri: string;
  cid?: string;
  title?: string;
  collection?: string;
  createdAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPdsRepoRecord(value: unknown): value is PdsRepoRecord {
  return isObject(value) && typeof value.uri === "string" && typeof value.cid === "string" && isObject(value.value);
}

function isListRecordsResponse(value: unknown): value is { records: PdsRepoRecord[]; cursor?: string } {
  return isObject(value) && Array.isArray(value.records) && value.records.every(isPdsRepoRecord);
}

function parseJsonText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const body = parseJsonText(await response.text());

  if (!response.ok) {
    const message = isObject(body) && typeof body.message === "string" ? body.message : `${response.status} ${response.statusText}`;
    throw new Error(`PDS request failed: ${message}`);
  }

  return body;
}

async function fetchJsonOrNull(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return parseJsonText(await response.text());
  } catch {
    return null;
  }
}

function normalizeServiceEndpoint(endpoint: string): string {
  return endpoint.replace(/\/$/, "");
}

function serviceTypeMatches(value: unknown): boolean {
  if (typeof value === "string") return value === "AtprotoPersonalDataServer";
  return Array.isArray(value) && value.some((entry) => entry === "AtprotoPersonalDataServer");
}

function getServiceEndpointFromDidDocument(value: unknown): string | null {
  if (!isObject(value) || !Array.isArray(value.service)) return null;

  for (const service of value.service) {
    if (!isObject(service)) continue;
    const endpoint = service.serviceEndpoint;
    if (typeof endpoint === "string" && serviceTypeMatches(service.type)) return normalizeServiceEndpoint(endpoint);
  }

  return null;
}

async function resolveDid(handle: string): Promise<string> {
  const search = new URLSearchParams({ handle });
  const value = await fetchJson(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?${search.toString()}`);
  if (!isObject(value) || typeof value.did !== "string") {
    throw new Error(`Could not resolve DID for E2E handle ${handle}.`);
  }
  return value.did;
}

async function resolveServiceEndpoint(did: string, fallbackPdsDomain: string | null): Promise<string> {
  if (did.startsWith("did:plc:")) {
    const endpoint = getServiceEndpointFromDidDocument(await fetchJsonOrNull(`https://plc.directory/${encodeURIComponent(did)}`));
    if (endpoint) return endpoint;
  }

  if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replace(/:/g, "/");
    const endpoint = getServiceEndpointFromDidDocument(await fetchJsonOrNull(`https://${host}/.well-known/did.json`));
    if (endpoint) return endpoint;
  }

  if (!fallbackPdsDomain) throw new Error(`Could not resolve a PDS endpoint for ${did}.`);
  return normalizeServiceEndpoint(fallbackPdsDomain.startsWith("http") ? fallbackPdsDomain : `https://${fallbackPdsDomain}`);
}

async function createStaticSessionAccount(): Promise<PdsReadAccount> {
  const env = getE2EEnv();
  let did = env.testDid;
  if (!did) {
    const serviceEndpoint = env.testPdsDomain
      ? normalizeServiceEndpoint(env.testPdsDomain.startsWith("http") ? env.testPdsDomain : `https://${env.testPdsDomain}`)
      : null;
    if (!serviceEndpoint) throw new Error("E2E_TEST_DID or E2E_TEST_PDS_DOMAIN is required for direct PDS checks.");
    const session = await fetchJson(`${serviceEndpoint}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: env.testHandle, password: env.testPassword }),
    });
    if (!isObject(session) || typeof session.did !== "string") {
      throw new Error("Direct PDS sign-in did not return the expected session.");
    }
    did = session.did;
    return { did, serviceEndpoint, source: "static-env" };
  }

  return { did, serviceEndpoint: await resolveServiceEndpoint(did, env.testPdsDomain), source: "static-env" };
}

async function getDefaultReadAccount(): Promise<PdsReadAccount> {
  const disposable = readDisposableAccountMetadata();
  if (disposable?.did) {
    return {
      did: disposable.did,
      serviceEndpoint: disposable.serviceEndpoint
        ? normalizeServiceEndpoint(disposable.serviceEndpoint)
        : await resolveServiceEndpoint(disposable.did, getE2EEnv().testPdsDomain),
      source: "disposable-email",
    };
  }

  return createStaticSessionAccount();
}

export function parseAtUri(uri: string): ParsedAtUri {
  if (!uri.startsWith("at://")) throw new Error(`Expected AT URI, got ${uri}`);
  const [did, collection, rkey] = uri.slice("at://".length).split("/");
  if (!did || !collection || !rkey) throw new Error(`AT URI has unexpected format: ${uri}`);
  return { did, collection, rkey };
}

async function listPdsRecords(collection: string): Promise<PdsRepoRecord[]> {
  const account = await getDefaultReadAccount();
  const records: PdsRepoRecord[] = [];
  let cursor: string | undefined;

  do {
    const search = new URLSearchParams({ repo: account.did, collection, limit: "100" });
    if (cursor) search.set("cursor", cursor);

    const value = await fetchJson(`${account.serviceEndpoint}/xrpc/com.atproto.repo.listRecords?${search.toString()}`);
    if (!isListRecordsResponse(value)) {
      throw new Error(`Direct PDS list response for ${collection} had an unexpected shape.`);
    }

    records.push(...value.records);
    cursor = value.cursor;
  } while (cursor);

  return records;
}

export async function getPdsRecord(uri: string): Promise<PdsRepoRecord> {
  const account = await getDefaultReadAccount();
  const parsed = parseAtUri(uri);
  if (parsed.did !== account.did) {
    throw new Error(`Refusing to read a record for ${parsed.did} while checking ${account.did}.`);
  }

  const search = new URLSearchParams({ repo: account.did, collection: parsed.collection, rkey: parsed.rkey });
  const value = await fetchJson(`${account.serviceEndpoint}/xrpc/com.atproto.repo.getRecord?${search.toString()}`);

  if (!isPdsRepoRecord(value)) {
    throw new Error(`Direct PDS get response for ${uri} had an unexpected shape.`);
  }
  return value;
}

export async function waitForClaimActivityByTitle(title: string): Promise<PdsRepoRecord> {
  const deadline = Date.now() + 60_000;
  let latestCount = 0;

  while (Date.now() <= deadline) {
    const records = await listPdsRecords(E2E_PDS_COLLECTIONS.claimActivity);
    latestCount = records.length;
    const match = records.find((record) => record.value.title === title);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Timed out waiting for direct PDS record titled ${title}. Last count: ${latestCount}.`);
}

export async function waitForCertifiedLocationByName(name: string): Promise<PdsRepoRecord> {
  const deadline = Date.now() + 60_000;
  let latestCount = 0;

  while (Date.now() <= deadline) {
    const records = await listPdsRecords(E2E_PDS_COLLECTIONS.certifiedLocation);
    latestCount = records.length;
    const match = records.find((record) => record.value.name === name);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Timed out waiting for direct PDS location named ${name}. Last count: ${latestCount}.`);
}

export async function waitForOccurrenceByScientificName(scientificName: string): Promise<PdsRepoRecord> {
  const deadline = Date.now() + 60_000;
  let latestCount = 0;

  while (Date.now() <= deadline) {
    const records = await listPdsRecords(E2E_PDS_COLLECTIONS.occurrence);
    latestCount = records.length;
    const match = records.find((record) => record.value.scientificName === scientificName);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Timed out waiting for direct PDS sighting named ${scientificName}. Last count: ${latestCount}.`);
}

export async function waitForAudioRecordingByName(name: string): Promise<PdsRepoRecord> {
  const deadline = Date.now() + 60_000;
  let latestCount = 0;

  while (Date.now() <= deadline) {
    const records = await listPdsRecords(E2E_PDS_COLLECTIONS.audioRecording);
    latestCount = records.length;
    const match = records.find((record) => record.value.name === name);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Timed out waiting for direct PDS audio recording named ${name}. Last count: ${latestCount}.`);
}

export async function waitForPdsRecordDeleted(uri: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  const parsed = parseAtUri(uri);
  let latestCount = 0;

  while (Date.now() <= deadline) {
    const records = await listPdsRecords(parsed.collection);
    latestCount = records.length;
    if (!records.some((record) => record.uri === uri)) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Timed out waiting for direct PDS record deletion for ${uri}. Last count: ${latestCount}.`);
}

export function getRecordArray(record: PdsRepoRecord, key: string): Record<string, unknown>[] {
  const value = record.value[key];
  return Array.isArray(value) ? value.filter(isObject) : [];
}

export function trackCreatedPdsRecord(record: PdsRepoRecord): void {
  const parsed = parseAtUri(record.uri);
  const entry: ListedCreatedRecord = {
    uri: record.uri,
    cid: record.cid,
    collection: parsed.collection,
    title: typeof record.value.title === "string" ? record.value.title : undefined,
    createdAt: new Date().toISOString(),
  };
  mkdirSync(dirname(createdRecordsPath), { recursive: true });
  appendFileSync(createdRecordsPath, `${JSON.stringify(entry)}\n`);
}

function readTrackedCreatedRecords(): ListedCreatedRecord[] {
  if (!existsSync(createdRecordsPath)) return [];
  return readFileSync(createdRecordsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ListedCreatedRecord)
    .filter((entry) => typeof entry.uri === "string");
}

export async function cleanupCreatedPdsRecords(): Promise<{ deleted: number; failed: number; skipped: number }> {
  const tracked = readTrackedCreatedRecords();

  if (readDisposableAccountMetadata()) {
    // Current policy: disposable accounts are kept for inspection unless the user
    // explicitly asks otherwise. Do not delete the account or its records here.
    if (tracked.length > 0) {
      mkdirSync(dirname(createdRecordsPath), { recursive: true });
      writeFileSync(createdRecordsPath, "");
    }
    return { deleted: 0, failed: 0, skipped: tracked.length };
  }

  // Static handle smoke tests should not create records in the current suite.
  // If older local runs left tracking data behind, clear the file but do not
  // mutate the configured account unexpectedly.
  if (tracked.length > 0) {
    mkdirSync(dirname(createdRecordsPath), { recursive: true });
    writeFileSync(createdRecordsPath, "");
  }

  return { deleted: 0, failed: 0, skipped: tracked.length };
}
