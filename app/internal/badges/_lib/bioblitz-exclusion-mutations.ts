import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  BIOBLITZ_EXCLUSION_COLLECTION,
  fetchBioblitzExclusionRecords,
  invalidateBioblitzExclusionsCache,
  type BioblitzExclusionAdminRow,
  type BioblitzExclusionRecord,
} from "@/app/_lib/bioblitz-exclusions";
import { bioblitzRounds, roundStatus } from "@/app/_lib/bioblitz";
import { fetchIndexedCertifiedProfileCards, GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/indexer";

export type BioblitzExclusionMutationErrorCode =
  | "invalid_request"
  | "account_not_found"
  | "round_finalized"
  | "save_failed"
  | "delete_failed";

export class BioblitzExclusionMutationError extends Error {
  status: number;
  code: BioblitzExclusionMutationErrorCode;

  constructor(code: BioblitzExclusionMutationErrorCode, status: number) {
    super(code);
    this.name = "BioblitzExclusionMutationError";
    this.status = status;
    this.code = code;
  }
}

type CgsMutationResult = { uri?: string; error?: string; message?: string };
type CgsPayload =
  | { operation: "createRecord"; collection: string; record: Record<string, unknown> }
  | { operation: "deleteRecord"; collection: string; rkey: string };

async function cgsMutate(repo: string, cookie: string | null, payload: CgsPayload): Promise<CgsMutationResult> {
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ ...payload, repo }),
    cache: "no-store",
  });
  const data = (await upstream.json().catch(() => null)) as CgsMutationResult | null;
  if (!upstream.ok || !data || data.error) {
    throw new BioblitzExclusionMutationError(
      payload.operation === "createRecord" ? "save_failed" : "delete_failed",
      upstream.status || 502,
    );
  }
  return data;
}

function validRoundId(roundId: number): boolean {
  return bioblitzRounds(Date.now(), 1).some((round) => round.id === roundId);
}

function uniqueRecords(records: BioblitzExclusionRecord[]): BioblitzExclusionRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.roundId}:${record.subjectDid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function enrichRows(records: BioblitzExclusionRecord[]): Promise<BioblitzExclusionAdminRow[]> {
  const unique = uniqueRecords(records);
  const profiles = await fetchIndexedCertifiedProfileCards(unique.map((record) => record.subjectDid)).catch(
    () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
  );
  return unique
    .map((record) => ({
      ...record,
      displayName: profiles.get(record.subjectDid)?.displayName ?? null,
      avatarUrl: profiles.get(record.subjectDid)?.avatarUrl ?? null,
    }))
    .sort(
      (a, b) =>
        b.roundId - a.roundId ||
        (a.displayName ?? "").localeCompare(b.displayName ?? "", undefined, { sensitivity: "base" }),
    );
}

/** Admin rows for every configured weekly exclusion. */
export async function fetchBioblitzExclusionRows(): Promise<BioblitzExclusionAdminRow[]> {
  const records = await fetchBioblitzExclusionRecords(GAINFOREST_MODERATION_REPO_DID);
  return enrichRows(records);
}

function assertRoundIsMutable(roundId: number): void {
  const round = bioblitzRounds(Date.now(), 1).find((entry) => entry.id === roundId);
  if (!round || roundStatus(round) === "ended") {
    throw new BioblitzExclusionMutationError("round_finalized", 409);
  }
}

/** Add one account exclusion for one generated round. Idempotent by round + account. */
export async function addBioblitzExclusion(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  roundId: number,
): Promise<BioblitzExclusionAdminRow> {
  const did = subjectDid.trim();
  if (!did.startsWith("did:")) {
    throw new BioblitzExclusionMutationError("account_not_found", 400);
  }
  if (!Number.isSafeInteger(roundId) || !validRoundId(roundId)) {
    throw new BioblitzExclusionMutationError("invalid_request", 400);
  }

  const existing = await fetchBioblitzExclusionRecords(repoDid);
  const duplicate = existing.find((record) => record.subjectDid === did && record.roundId === roundId);
  if (duplicate) return (await enrichRows([duplicate]))[0]!;
  assertRoundIsMutable(roundId);

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BIOBLITZ_EXCLUSION_COLLECTION,
    record: {
      $type: BIOBLITZ_EXCLUSION_COLLECTION,
      subject: did,
      roundId,
      createdAt,
    },
  });
  if (!created.uri) throw new BioblitzExclusionMutationError("save_failed", 502);

  invalidateBioblitzExclusionsCache();
  const record: BioblitzExclusionRecord = {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid: did,
    roundId,
    createdAt,
  };
  return (await enrichRows([record]))[0]!;
}

/** Remove the selected exclusion and any duplicate records for the same account/week. */
export async function removeBioblitzExclusion(
  repoDid: string,
  cookie: string | null,
  rkey: string,
): Promise<void> {
  const trimmed = rkey.trim();
  if (!trimmed) throw new BioblitzExclusionMutationError("invalid_request", 400);

  const records = await fetchBioblitzExclusionRecords(repoDid);
  const target = records.find((record) => record.rkey === trimmed);
  if (target) assertRoundIsMutable(target.roundId);
  const matching = target
    ? records.filter(
        (record) => record.subjectDid === target.subjectDid && record.roundId === target.roundId,
      )
    : [];

  for (const record of matching) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: BIOBLITZ_EXCLUSION_COLLECTION,
      rkey: record.rkey,
    });
  }
  invalidateBioblitzExclusionsCache();
}
