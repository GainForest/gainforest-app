/**
 * Rewilding the Web grantee enrollment.
 *
 * The program accepts exactly ten organizations. Which ones are in is an
 * explicit decision a GainForest admin makes in the admin panel — not
 * something inferred from applications or badges. Each decision is an
 * append-only event in the moderation repo (`active: true` enrolls,
 * `active: false` removes), newest per subject wins, same model as milestone
 * confirmations: any admin can reverse another's decision without deleting
 * their record, and the history stays.
 *
 * Enrollment is also the access switch: /grants/my-grant and
 * /grants/my-recorders open up to a signed-in user exactly when their DID has
 * an active enrollment here (GainForest admins can always preview).
 */

import { cachedAsync, invalidateCachedAsyncByPrefix } from "./async-cache";
import { GAINFOREST_MODERATION_REPO_DID } from "./moderation-repo";
import { listModerationRecords } from "./rewilding-milestones";

/**
 * Enrollment events. Written from the admin panel only.
 *
 * Namespaced `app.gainforest.grant.<program>.<record>`: GainForest grants
 * first, the program second, so a future program gets its own branch instead
 * of another top-level name.
 */
export const REWILDING_ENROLLMENT_COLLECTION = "app.gainforest.grant.rewilding.enrollment";

/** The program's capacity: ten organizations, per the Program Handbook. */
export const REWILDING_GRANT_SLOTS = 10;

const GRANTEE_CACHE_KEY = "rewilding-grantees:v1";
const CACHE_MS = 30_000;

export type RewildingGranteeRecord = {
  rkey: string;
  uri: string;
  subjectDid: string;
  /** False is an append-only removal event created by another steward. */
  active: boolean;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Parse one public PDS enrollment event, ignoring malformed values. */
export function parseRewildingGranteeRecord(entry: unknown): RewildingGranteeRecord | null {
  if (!isRecord(entry)) return null;
  const uri = nonEmptyString(entry.uri);
  const value = entry.value;
  if (!uri || !isRecord(value)) return null;

  const subjectDid = nonEmptyString(value.subject);
  const createdAt = nonEmptyString(value.createdAt);
  if (!subjectDid?.startsWith("did:") || !createdAt) return null;

  return {
    rkey: uri.split("/").pop() ?? "",
    uri,
    subjectDid,
    active: typeof value.active === "boolean" ? value.active : true,
    createdAt,
  };
}

/** Read every enrollment event directly from the moderation account's PDS. */
export async function fetchRewildingGranteeRecords(
  repoDid: string = GAINFOREST_MODERATION_REPO_DID,
  signal?: AbortSignal,
): Promise<RewildingGranteeRecord[]> {
  const entries = await listModerationRecords(repoDid, REWILDING_ENROLLMENT_COLLECTION, signal);
  return entries
    .flatMap((entry) => {
      const record = parseRewildingGranteeRecord(entry);
      return record ? [record] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri));
}

/** Briefly cached read for page renders and the access gate. */
export function fetchRewildingGrantees(signal?: AbortSignal): Promise<RewildingGranteeRecord[]> {
  return cachedAsync(GRANTEE_CACHE_KEY, CACHE_MS, () => fetchRewildingGranteeRecords(), signal);
}

export function invalidateRewildingGranteesCache(): void {
  invalidateCachedAsyncByPrefix(GRANTEE_CACHE_KEY);
}

/**
 * The organizations currently in the program: newest event per subject wins,
 * only active enrollments, oldest enrollment first (slot order — the first
 * organization accepted holds slot 1).
 */
export function effectiveRewildingGrantees(
  records: readonly RewildingGranteeRecord[],
): RewildingGranteeRecord[] {
  const newestFirst = [...records].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
  const seen = new Set<string>();
  const active: RewildingGranteeRecord[] = [];
  for (const record of newestFirst) {
    if (seen.has(record.subjectDid)) continue;
    seen.add(record.subjectDid);
    if (record.active) active.push(record);
  }
  return active.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.uri.localeCompare(b.uri));
}

/** True when this DID currently holds one of the ten grant slots. The gate
 *  the grantee dashboard pages check; fails closed on any error. */
export async function isRewildingGrantee(did: string | null, signal?: AbortSignal): Promise<boolean> {
  if (!did) return false;
  const records = await fetchRewildingGrantees(signal).catch(() => []);
  return effectiveRewildingGrantees(records).some((record) => record.subjectDid === did);
}
