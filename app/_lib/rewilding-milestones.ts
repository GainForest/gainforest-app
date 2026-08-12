/**
 * Rewilding the Web grant state: milestone confirmations and grant documents.
 *
 * Both live in the GainForest moderation account's repo, written through the
 * CGS mutation proxy by admin-group members from the admin panel — a grantee
 * never writes these. Milestones follow the same append-only event model as
 * BioBlitz exclusions (`app.gainforest.bioblitz.exclusion`): the newest event
 * per grantee + milestone wins, so any group member can reverse another
 * member's confirmation without deleting their record. Documents (the signed
 * grant contract etc.) are one record per uploaded file, with the file itself
 * stored as a blob on the moderation account's PDS.
 *
 * The program structure (M1–M4 gating three payment tranches of a USD 1,000
 * grant) mirrors the Rewilding the Web Program Handbook (Linear doc
 * `program-handbook-ed23eb2f3242`).
 */

import { cachedAsync, invalidateCachedAsyncByPrefix } from "./async-cache";
import { GAINFOREST_MODERATION_REPO_DID } from "./moderation-repo";
import { resolvePdsHost } from "./pds";

/** Milestone confirmation events. Written from the admin panel only. */
export const REWILDING_MILESTONE_COLLECTION = "app.gainforest.rewilding.milestone";
/** Grant documents (contract etc.). Written from the admin panel only. */
export const REWILDING_DOCUMENT_COLLECTION = "app.gainforest.rewilding.document";

/** Program constants from the handbook. */
export const REWILDING_GRANT_AMOUNT_USD = 1000;
export const REWILDING_AUDIO_TARGET_MINUTES = 7000;

export type RewildingMilestoneId = "m1" | "m2" | "m3" | "m4";

export const REWILDING_MILESTONE_IDS: readonly RewildingMilestoneId[] = ["m1", "m2", "m3", "m4"];

export function isRewildingMilestoneId(value: unknown): value is RewildingMilestoneId {
  return typeof value === "string" && (REWILDING_MILESTONE_IDS as readonly string[]).includes(value);
}

export type RewildingMilestoneDefinition = {
  id: RewildingMilestoneId;
  /** Short program code, e.g. "M2". Shown as-is; not translated. */
  code: string;
  title: string;
  description: string;
  /** The payment tranche this milestone releases, when it gates one. M3 shares
   *  M2's tranche, so M2 carries no payout of its own. */
  payout?: { tranche: number; amountUsd: number };
  /** Milestones about the devices link through to the recorder inventory. */
  isRecorderInventory?: boolean;
};

/**
 * The four contract milestones, verbatim from the Program Handbook. Titles and
 * descriptions are program copy every grantee sees in their contract, so they
 * are data, not UI strings to translate ad hoc.
 */
export const REWILDING_MILESTONES: readonly RewildingMilestoneDefinition[] = [
  {
    id: "m1",
    code: "M1",
    title: "Contract signed",
    description: "Agreement in place; first payment released.",
    payout: { tranche: 1, amountUsd: 333 },
  },
  {
    id: "m2",
    code: "M2",
    title: "AudioMoth deployed",
    description: "Sensors placed in the field and actively recording.",
    isRecorderInventory: true,
  },
  {
    id: "m3",
    code: "M3",
    title: "First data uploaded",
    description: "Recordings uploaded to GainForest.app.",
    // Tranche 2 releases when M2 *and* M3 are confirmed — the handbook hangs
    // the payout on the pair, so it is shown on the later of the two.
    payout: { tranche: 2, amountUsd: 333 },
  },
  {
    id: "m4",
    code: "M4",
    title: "Project complete",
    description: "Data labelled and at least one public update posted on Bumicerts.",
    payout: { tranche: 3, amountUsd: 334 },
  },
];

const MILESTONE_CACHE_KEY = "rewilding-milestones:v1";
const DOCUMENT_CACHE_KEY = "rewilding-documents:v1";
const CACHE_MS = 30_000;

export type RewildingMilestoneRecord = {
  rkey: string;
  uri: string;
  subjectDid: string;
  milestoneId: RewildingMilestoneId;
  /** False is an append-only reopen event created by another steward. */
  done: boolean;
  createdAt: string;
};

export type RewildingDocumentRecord = {
  rkey: string;
  uri: string;
  subjectDid: string;
  /** Human name shown in lists, e.g. "Grant contract". */
  title: string;
  /** Original file name, e.g. "contract-signed.pdf". */
  fileName: string;
  /** CID of the file blob on the moderation account's PDS. */
  fileCid: string;
  fileMimeType: string | null;
  createdAt: string;
};

type ListRecordsResponse = {
  records?: unknown[];
  cursor?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Parse one public PDS milestone event, ignoring malformed values. */
export function parseRewildingMilestoneRecord(entry: unknown): RewildingMilestoneRecord | null {
  if (!isRecord(entry)) return null;
  const uri = nonEmptyString(entry.uri);
  const value = entry.value;
  if (!uri || !isRecord(value)) return null;

  const subjectDid = nonEmptyString(value.subject);
  const createdAt = nonEmptyString(value.createdAt);
  const milestoneId = value.milestoneId;
  if (!subjectDid?.startsWith("did:") || !createdAt || !isRewildingMilestoneId(milestoneId)) {
    return null;
  }

  return {
    rkey: uri.split("/").pop() ?? "",
    uri,
    subjectDid,
    milestoneId,
    done: typeof value.done === "boolean" ? value.done : true,
    createdAt,
  };
}

/** Extract the blob CID from a PDS-serialised blob ref (`{ ref: { $link } }`). */
function blobCidFrom(value: unknown): { cid: string; mimeType: string | null } | null {
  if (!isRecord(value)) return null;
  const ref = value.ref;
  const cid =
    typeof ref === "string" ? ref : isRecord(ref) && typeof ref.$link === "string" ? ref.$link : null;
  if (!cid) return null;
  return { cid, mimeType: typeof value.mimeType === "string" ? value.mimeType : null };
}

/** Parse one public PDS document record, ignoring malformed values. */
export function parseRewildingDocumentRecord(entry: unknown): RewildingDocumentRecord | null {
  if (!isRecord(entry)) return null;
  const uri = nonEmptyString(entry.uri);
  const value = entry.value;
  if (!uri || !isRecord(value)) return null;

  const subjectDid = nonEmptyString(value.subject);
  const title = nonEmptyString(value.title);
  const createdAt = nonEmptyString(value.createdAt);
  const file = blobCidFrom(value.file);
  if (!subjectDid?.startsWith("did:") || !title || !createdAt || !file) return null;

  return {
    rkey: uri.split("/").pop() ?? "",
    uri,
    subjectDid,
    title,
    fileName: nonEmptyString(value.fileName) ?? title,
    fileCid: file.cid,
    fileMimeType: file.mimeType,
    createdAt,
  };
}

/** Page through a collection on the moderation account's PDS. */
async function listModerationRecords(
  repoDid: string,
  collection: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const host = await resolvePdsHost(repoDid, signal);
  if (!host) throw new Error("Could not resolve the GainForest moderation account.");

  const entries: unknown[] = [];
  let cursor: string | undefined;
  for (let page = 0; ; page += 1) {
    if (page >= 100) throw new Error(`The ${collection} list exceeded its safe read limit.`);
    const params = new URLSearchParams({ repo: repoDid, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { cache: "no-store", signal },
    );
    if (!response.ok) throw new Error(`Could not load ${collection} (${response.status}).`);

    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    if (!payload || !Array.isArray(payload.records)) {
      throw new Error(`The ${collection} list returned an invalid response.`);
    }
    entries.push(...payload.records);
    cursor = nonEmptyString(payload?.cursor) ?? undefined;
    if (!cursor) break;
  }
  return entries;
}

/** Read every milestone event directly from the moderation account's PDS. */
export async function fetchRewildingMilestoneRecords(
  repoDid: string = GAINFOREST_MODERATION_REPO_DID,
  signal?: AbortSignal,
): Promise<RewildingMilestoneRecord[]> {
  const entries = await listModerationRecords(repoDid, REWILDING_MILESTONE_COLLECTION, signal);
  return entries
    .flatMap((entry) => {
      const record = parseRewildingMilestoneRecord(entry);
      return record ? [record] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri));
}

/** Read every grant document record from the moderation account's PDS. */
export async function fetchRewildingDocumentRecords(
  repoDid: string = GAINFOREST_MODERATION_REPO_DID,
  signal?: AbortSignal,
): Promise<RewildingDocumentRecord[]> {
  const entries = await listModerationRecords(repoDid, REWILDING_DOCUMENT_COLLECTION, signal);
  return entries
    .flatMap((entry) => {
      const record = parseRewildingDocumentRecord(entry);
      return record ? [record] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri));
}

/** Briefly cached reads for page renders. */
export function fetchRewildingMilestones(signal?: AbortSignal): Promise<RewildingMilestoneRecord[]> {
  return cachedAsync(MILESTONE_CACHE_KEY, CACHE_MS, () => fetchRewildingMilestoneRecords(), signal);
}

export function fetchRewildingDocuments(signal?: AbortSignal): Promise<RewildingDocumentRecord[]> {
  return cachedAsync(DOCUMENT_CACHE_KEY, CACHE_MS, () => fetchRewildingDocumentRecords(), signal);
}

export function invalidateRewildingCaches(): void {
  invalidateCachedAsyncByPrefix(MILESTONE_CACHE_KEY);
  invalidateCachedAsyncByPrefix(DOCUMENT_CACHE_KEY);
}

/**
 * Resolve the append-only event stream to the current state per grantee +
 * milestone. The newest event wins, mirroring BioBlitz exclusions.
 */
export function effectiveRewildingMilestones(
  records: readonly RewildingMilestoneRecord[],
): RewildingMilestoneRecord[] {
  const newestFirst = [...records].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
  const seen = new Set<string>();
  const current: RewildingMilestoneRecord[] = [];
  for (const record of newestFirst) {
    const key = `${record.subjectDid}:${record.milestoneId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.push(record);
  }
  return current;
}

/** The milestone ids currently confirmed done for one grantee. */
export function doneRewildingMilestoneIds(
  records: readonly RewildingMilestoneRecord[],
  subjectDid: string,
): Set<RewildingMilestoneId> {
  const done = new Set<RewildingMilestoneId>();
  for (const record of effectiveRewildingMilestones(records)) {
    if (record.subjectDid === subjectDid && record.done) done.add(record.milestoneId);
  }
  return done;
}
