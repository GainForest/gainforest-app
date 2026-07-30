import { cachedAsync, invalidateCachedAsyncByPrefix } from "./async-cache";
import { GAINFOREST_MODERATION_REPO_DID } from "./indexer";
import { resolvePdsHost } from "./pds";

/**
 * A weekly leaderboard exclusion stored in the GainForest moderation account.
 * The account's observations remain public and eligible for best picture; this
 * record only changes the observation-count leaderboard for the named round.
 */
export const BIOBLITZ_EXCLUSION_COLLECTION = "app.gainforest.bioblitz.exclusion";

const EXCLUSION_CACHE_KEY = "bioblitz-exclusions:v1";
const EXCLUSION_CACHE_MS = 30_000;

export type BioblitzExclusionRecord = {
  rkey: string;
  uri: string;
  subjectDid: string;
  roundId: number;
  /** False is an append-only restoration event created by another steward. */
  excluded: boolean;
  createdAt: string;
};

export type BioblitzExclusionAdminRow = BioblitzExclusionRecord & {
  displayName: string | null;
  avatarUrl: string | null;
};

export type BioblitzExclusionsByRound = Map<number, Set<string>>;

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

/** Parse one public PDS record, ignoring malformed or unrelated values. */
export function parseBioblitzExclusionRecord(entry: unknown): BioblitzExclusionRecord | null {
  if (!isRecord(entry)) return null;
  const uri = nonEmptyString(entry.uri);
  const value = entry.value;
  if (!uri || !isRecord(value)) return null;

  const subjectDid = nonEmptyString(value.subject);
  const createdAt = nonEmptyString(value.createdAt);
  const roundId = value.roundId;
  if (
    !subjectDid?.startsWith("did:") ||
    !createdAt ||
    !Number.isSafeInteger(roundId) ||
    (roundId as number) < 1
  ) {
    return null;
  }

  return {
    rkey: uri.split("/").pop() ?? "",
    uri,
    subjectDid,
    roundId: roundId as number,
    // Records created before append-only restoration was introduced represent
    // exclusions, so an absent field remains backwards-compatible.
    excluded: typeof value.excluded === "boolean" ? value.excluded : true,
    createdAt,
  };
}

/** Read every weekly exclusion directly from the moderation account's PDS. */
export async function fetchBioblitzExclusionRecords(
  repoDid: string,
  signal?: AbortSignal,
): Promise<BioblitzExclusionRecord[]> {
  const host = await resolvePdsHost(repoDid, signal);
  if (!host) throw new Error("Could not resolve the BioBlitz moderation account.");

  const records: BioblitzExclusionRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; ; page += 1) {
    if (page >= 100) throw new Error("The BioBlitz exclusion list exceeded its safe read limit.");
    const params = new URLSearchParams({
      repo: repoDid,
      collection: BIOBLITZ_EXCLUSION_COLLECTION,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { cache: "no-store", signal },
    );
    if (!response.ok) throw new Error(`Could not load BioBlitz exclusions (${response.status}).`);

    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    if (!payload || !Array.isArray(payload.records)) {
      throw new Error("The BioBlitz exclusion list returned an invalid response.");
    }
    for (const entry of payload.records) {
      const record = parseBioblitzExclusionRecord(entry);
      if (record) records.push(record);
    }
    cursor = nonEmptyString(payload?.cursor) ?? undefined;
    if (!cursor) break;
  }

  return records.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
}

/** Public, briefly cached read used by every leaderboard calculation. */
export function fetchBioblitzExclusions(signal?: AbortSignal): Promise<BioblitzExclusionRecord[]> {
  return cachedAsync(
    EXCLUSION_CACHE_KEY,
    EXCLUSION_CACHE_MS,
    () => fetchBioblitzExclusionRecords(GAINFOREST_MODERATION_REPO_DID),
    signal,
  );
}

/** Uncached, fail-closed read used before irreversible winner awards. */
export function fetchBioblitzExclusionsStrict(signal?: AbortSignal): Promise<BioblitzExclusionRecord[]> {
  return fetchBioblitzExclusionRecords(GAINFOREST_MODERATION_REPO_DID, signal);
}

export function invalidateBioblitzExclusionsCache(): void {
  invalidateCachedAsyncByPrefix(EXCLUSION_CACHE_KEY);
}

/**
 * Resolve the append-only event stream to one current exclusion per account and
 * round. The newest event wins, so any group member can restore counting by
 * creating an `excluded: false` event without deleting another member's record.
 */
export function effectiveBioblitzExclusionRecords(
  records: readonly BioblitzExclusionRecord[],
): BioblitzExclusionRecord[] {
  const newestFirst = [...records].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
  const seen = new Set<string>();
  const active: BioblitzExclusionRecord[] = [];
  for (const record of newestFirst) {
    const key = `${record.roundId}:${record.subjectDid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (record.excluded) active.push(record);
  }
  return active;
}

/**
 * Resolve any historical/stale event rkey to the account/week that it names,
 * then return that pair's current active exclusion. This prevents a stale UI
 * from reporting a successful restoration while a concurrent exclusion wins.
 */
export function resolveActiveBioblitzExclusion(
  records: readonly BioblitzExclusionRecord[],
  rkey: string,
): BioblitzExclusionRecord | null {
  const requested = records.find((record) => record.rkey === rkey);
  if (!requested) return null;
  return effectiveBioblitzExclusionRecords(records).find(
    (record) =>
      record.subjectDid === requested.subjectDid && record.roundId === requested.roundId,
  ) ?? null;
}

/** Index the current weekly exclusion state for fast leaderboard checks. */
export function indexBioblitzExclusions(
  records: readonly BioblitzExclusionRecord[],
): BioblitzExclusionsByRound {
  const byRound: BioblitzExclusionsByRound = new Map();
  for (const record of effectiveBioblitzExclusionRecords(records)) {
    const dids = byRound.get(record.roundId) ?? new Set<string>();
    dids.add(record.subjectDid);
    byRound.set(record.roundId, dids);
  }
  return byRound;
}

export function isAccountExcludedFromBioblitzRound(
  exclusions: BioblitzExclusionsByRound,
  subjectDid: string,
  roundId: number | null,
): boolean {
  return roundId !== null && Boolean(exclusions.get(roundId)?.has(subjectDid));
}
