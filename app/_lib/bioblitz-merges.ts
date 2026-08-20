import { cachedAsync, invalidateCachedAsyncByPrefix } from "./async-cache";
import { GAINFOREST_MODERATION_REPO_DID } from "./indexer";
import { resolvePdsHost } from "./pds";

/**
 * A duplicate-observation merge stored in the GainForest moderation account.
 *
 * When several photos of the same organism are submitted as separate
 * observations (e.g. a burst of near-identical snake pictures), a steward can
 * merge them: one observation — the canonical one — keeps counting toward the
 * BioBlitz round, and the listed duplicates stop counting. The underlying
 * records stay public and untouched; only the round tallies change, so a
 * merge automatically adjusts the collector's points and observation count.
 *
 * Like weekly exclusions, merges are an append-only event stream: any steward
 * can undo another steward's merge by appending a `merged: false` event for
 * the same round + canonical observation, preserving full history.
 */
export const BIOBLITZ_MERGE_COLLECTION = "app.gainforest.bioblitz.merge";

const MERGE_CACHE_KEY = "bioblitz-merges:v1";
const MERGE_CACHE_MS = 30_000;

export type BioblitzMergeRecord = {
  rkey: string;
  uri: string;
  /** The collector whose observations were merged. */
  subjectDid: string;
  roundId: number;
  /** The observation that keeps counting (AT-URI). */
  canonicalUri: string;
  /** The observations that stop counting (AT-URIs). */
  duplicateUris: string[];
  /** False is an append-only undo event created by another steward. */
  merged: boolean;
  createdAt: string;
};

/** Merged-away observation URIs per round, for fast leaderboard checks. */
export type BioblitzMergesByRound = Map<number, Set<string>>;

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

const OCCURRENCE_URI_RE = /^at:\/\/[^/]+\/app\.gainforest\.dwc\.occurrence\/[^/]+$/;

export function isOccurrenceUri(value: unknown): value is string {
  return typeof value === "string" && OCCURRENCE_URI_RE.test(value.trim());
}

/** Parse one public PDS record, ignoring malformed or unrelated values. */
export function parseBioblitzMergeRecord(entry: unknown): BioblitzMergeRecord | null {
  if (!isRecord(entry)) return null;
  const uri = nonEmptyString(entry.uri);
  const value = entry.value;
  if (!uri || !isRecord(value)) return null;

  const subjectDid = nonEmptyString(value.subject);
  const createdAt = nonEmptyString(value.createdAt);
  const canonical = nonEmptyString(value.canonical);
  const roundId = value.roundId;
  if (
    !subjectDid?.startsWith("did:") ||
    !createdAt ||
    !canonical ||
    !isOccurrenceUri(canonical) ||
    !Number.isSafeInteger(roundId) ||
    (roundId as number) < 1
  ) {
    return null;
  }

  const rawDuplicates = Array.isArray(value.duplicates) ? value.duplicates : [];
  const duplicateUris = [
    ...new Set(rawDuplicates.filter(isOccurrenceUri).map((entryUri) => entryUri.trim())),
  ].filter((entryUri) => entryUri !== canonical);
  const merged = typeof value.merged === "boolean" ? value.merged : true;
  // A merge event with nothing to merge is meaningless; an undo event may
  // legitimately repeat the duplicates for history, so it is not required to.
  if (merged && duplicateUris.length === 0) return null;

  return {
    rkey: uri.split("/").pop() ?? "",
    uri,
    subjectDid,
    roundId: roundId as number,
    canonicalUri: canonical,
    duplicateUris,
    merged,
    createdAt,
  };
}

/** Read every duplicate merge directly from the moderation account's PDS. */
export async function fetchBioblitzMergeRecords(
  repoDid: string,
  signal?: AbortSignal,
): Promise<BioblitzMergeRecord[]> {
  const host = await resolvePdsHost(repoDid, signal);
  if (!host) throw new Error("Could not resolve the BioBlitz moderation account.");

  const records: BioblitzMergeRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; ; page += 1) {
    if (page >= 100) throw new Error("The BioBlitz merge list exceeded its safe read limit.");
    const params = new URLSearchParams({
      repo: repoDid,
      collection: BIOBLITZ_MERGE_COLLECTION,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { cache: "no-store", signal },
    );
    if (!response.ok) throw new Error(`Could not load BioBlitz merges (${response.status}).`);

    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    if (!payload || !Array.isArray(payload.records)) {
      throw new Error("The BioBlitz merge list returned an invalid response.");
    }
    for (const entry of payload.records) {
      const record = parseBioblitzMergeRecord(entry);
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
export function fetchBioblitzMerges(signal?: AbortSignal): Promise<BioblitzMergeRecord[]> {
  return cachedAsync(
    MERGE_CACHE_KEY,
    MERGE_CACHE_MS,
    () => fetchBioblitzMergeRecords(GAINFOREST_MODERATION_REPO_DID),
    signal,
  );
}

/** Uncached, fail-closed read used before irreversible winner awards. */
export function fetchBioblitzMergesStrict(signal?: AbortSignal): Promise<BioblitzMergeRecord[]> {
  return fetchBioblitzMergeRecords(GAINFOREST_MODERATION_REPO_DID, signal);
}

export function invalidateBioblitzMergesCache(): void {
  invalidateCachedAsyncByPrefix(MERGE_CACHE_KEY);
}

/**
 * Resolve the append-only event stream to one current merge per round +
 * canonical observation. The newest event wins, so any steward can undo a
 * merge by appending a `merged: false` event without deleting history.
 */
export function effectiveBioblitzMergeRecords(
  records: readonly BioblitzMergeRecord[],
): BioblitzMergeRecord[] {
  const newestFirst = [...records].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
  const seen = new Set<string>();
  const active: BioblitzMergeRecord[] = [];
  for (const record of newestFirst) {
    const key = `${record.roundId}:${record.canonicalUri}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (record.merged) active.push(record);
  }
  return active;
}

/**
 * Resolve any historical/stale event rkey to the round + canonical that it
 * names, then return that pair's current active merge. This prevents a stale
 * UI from reporting a successful undo while a concurrent merge wins.
 */
export function resolveActiveBioblitzMerge(
  records: readonly BioblitzMergeRecord[],
  rkey: string,
): BioblitzMergeRecord | null {
  const requested = records.find((record) => record.rkey === rkey);
  if (!requested) return null;
  return (
    effectiveBioblitzMergeRecords(records).find(
      (record) =>
        record.canonicalUri === requested.canonicalUri && record.roundId === requested.roundId,
    ) ?? null
  );
}

/** Index the current merge state for fast leaderboard checks. */
export function indexBioblitzMerges(
  records: readonly BioblitzMergeRecord[],
): BioblitzMergesByRound {
  const byRound: BioblitzMergesByRound = new Map();
  for (const record of effectiveBioblitzMergeRecords(records)) {
    const uris = byRound.get(record.roundId) ?? new Set<string>();
    for (const uri of record.duplicateUris) uris.add(uri);
    byRound.set(record.roundId, uris);
  }
  return byRound;
}

/** True when this observation was merged away for the named round: it stays
 *  public but no longer contributes to that round's counts or points. */
export function isObservationMergedAway(
  merges: BioblitzMergesByRound,
  uri: string | null | undefined,
  roundId: number | null,
): boolean {
  return roundId !== null && Boolean(uri && merges.get(roundId)?.has(uri));
}
