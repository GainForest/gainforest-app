import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { bioblitzRounds, roundStatus } from "@/app/_lib/bioblitz";
import {
  BIOBLITZ_MERGE_COLLECTION,
  effectiveBioblitzMergeRecords,
  fetchBioblitzMergeRecords,
  invalidateBioblitzMergesCache,
  isOccurrenceUri,
  resolveActiveBioblitzMerge,
  type BioblitzMergeRecord,
} from "@/app/_lib/bioblitz-merges";

export type BioblitzMergeMutationErrorCode =
  | "invalid_request"
  | "round_finalized"
  | "save_failed"
  | "delete_failed";

export class BioblitzMergeMutationError extends Error {
  status: number;
  code: BioblitzMergeMutationErrorCode;

  constructor(code: BioblitzMergeMutationErrorCode, status: number) {
    super(code);
    this.name = "BioblitzMergeMutationError";
    this.status = status;
    this.code = code;
  }
}

type CgsMutationResult = { uri?: string; error?: string; message?: string };

async function cgsMutate(
  repo: string,
  cookie: string | null,
  record: Record<string, unknown>,
  failureCode: "save_failed" | "delete_failed",
): Promise<CgsMutationResult> {
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      operation: "createRecord",
      collection: BIOBLITZ_MERGE_COLLECTION,
      record,
      repo,
    }),
    cache: "no-store",
  });
  const data = (await upstream.json().catch(() => null)) as CgsMutationResult | null;
  if (!upstream.ok || !data || data.error) {
    throw new BioblitzMergeMutationError(failureCode, upstream.status || 502);
  }
  return data;
}

function assertRoundIsMutable(roundId: number): void {
  const round = bioblitzRounds(Date.now(), 1).find((entry) => entry.id === roundId);
  if (!round || roundStatus(round) === "ended") {
    throw new BioblitzMergeMutationError("round_finalized", 409);
  }
}

/** The DID an occurrence AT-URI belongs to. */
function occurrenceRepoDid(uri: string): string | null {
  const match = /^at:\/\/([^/]+)\//.exec(uri);
  return match?.[1] ?? null;
}

export type BioblitzMergeInput = {
  subjectDid: string;
  roundId: number;
  canonicalUri: string;
  duplicateUris: string[];
};

/**
 * Merge one collector's duplicate observations into a single counting
 * observation for a round. Idempotent by round + canonical: re-merging with
 * more duplicates appends a newer event whose list supersedes the older one.
 */
export async function addBioblitzMerge(
  repoDid: string,
  cookie: string | null,
  input: BioblitzMergeInput,
): Promise<BioblitzMergeRecord> {
  const subjectDid = input.subjectDid?.trim();
  const canonicalUri = input.canonicalUri?.trim();
  const duplicateUris = [
    ...new Set(
      (Array.isArray(input.duplicateUris) ? input.duplicateUris : [])
        .filter((uri): uri is string => typeof uri === "string")
        .map((uri) => uri.trim()),
    ),
  ].filter((uri) => uri !== canonicalUri);

  if (
    !subjectDid?.startsWith("did:") ||
    !Number.isSafeInteger(input.roundId) ||
    !isOccurrenceUri(canonicalUri) ||
    duplicateUris.length === 0 ||
    !duplicateUris.every(isOccurrenceUri)
  ) {
    throw new BioblitzMergeMutationError("invalid_request", 400);
  }
  // Every merged observation must belong to the named collector: a merge is a
  // per-collector points correction, never a cross-account moderation tool.
  if (
    [canonicalUri, ...duplicateUris].some((uri) => occurrenceRepoDid(uri) !== subjectDid)
  ) {
    throw new BioblitzMergeMutationError("invalid_request", 400);
  }
  assertRoundIsMutable(input.roundId);

  const existing = await fetchBioblitzMergeRecords(repoDid);
  const active = effectiveBioblitzMergeRecords(existing).find(
    (record) => record.roundId === input.roundId && record.canonicalUri === canonicalUri,
  );
  // Same merge already in place — return it rather than appending a copy.
  if (
    active &&
    active.duplicateUris.length === duplicateUris.length &&
    duplicateUris.every((uri) => active.duplicateUris.includes(uri))
  ) {
    return active;
  }

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(
    repoDid,
    cookie,
    {
      $type: BIOBLITZ_MERGE_COLLECTION,
      subject: subjectDid,
      roundId: input.roundId,
      canonical: canonicalUri,
      duplicates: duplicateUris,
      merged: true,
      createdAt,
    },
    "save_failed",
  );
  if (!created.uri) throw new BioblitzMergeMutationError("save_failed", 502);

  invalidateBioblitzMergesCache();
  return {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid,
    roundId: input.roundId,
    canonicalUri,
    duplicateUris,
    merged: true,
    createdAt,
  };
}

/**
 * Undo a merge so every observation counts individually again. This appends
 * an undo event instead of deleting the original record, so any steward can
 * reverse another steward's merge while preserving history.
 */
export async function removeBioblitzMerge(
  repoDid: string,
  cookie: string | null,
  rkey: string,
): Promise<void> {
  const trimmed = rkey.trim();
  if (!trimmed) throw new BioblitzMergeMutationError("invalid_request", 400);

  const records = await fetchBioblitzMergeRecords(repoDid);
  const target = resolveActiveBioblitzMerge(records, trimmed);
  if (!target) return;
  assertRoundIsMutable(target.roundId);

  await cgsMutate(
    repoDid,
    cookie,
    {
      $type: BIOBLITZ_MERGE_COLLECTION,
      subject: target.subjectDid,
      roundId: target.roundId,
      canonical: target.canonicalUri,
      duplicates: target.duplicateUris,
      merged: false,
      createdAt: new Date().toISOString(),
    },
    "delete_failed",
  );
  invalidateBioblitzMergesCache();
}
