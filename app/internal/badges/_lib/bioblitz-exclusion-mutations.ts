import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  BIOBLITZ_EXCLUSION_COLLECTION,
  effectiveBioblitzExclusionRecords,
  fetchBioblitzExclusionRecords,
  invalidateBioblitzExclusionsCache,
  resolveActiveBioblitzExclusion,
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
type CgsPayload = {
  operation: "createRecord";
  collection: string;
  record: Record<string, unknown>;
};

async function cgsMutate(
  repo: string,
  cookie: string | null,
  payload: CgsPayload,
  failureCode: "save_failed" | "delete_failed" = "save_failed",
): Promise<CgsMutationResult> {
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
    throw new BioblitzExclusionMutationError(failureCode, upstream.status || 502);
  }
  return data;
}

function validRoundId(roundId: number): boolean {
  return bioblitzRounds(Date.now(), 1).some((round) => round.id === roundId);
}

async function enrichRows(records: BioblitzExclusionRecord[]): Promise<BioblitzExclusionAdminRow[]> {
  const unique = effectiveBioblitzExclusionRecords(records);
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
  const active = effectiveBioblitzExclusionRecords(existing).find(
    (record) => record.subjectDid === did && record.roundId === roundId,
  );
  if (active) return (await enrichRows([active]))[0]!;
  assertRoundIsMutable(roundId);

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BIOBLITZ_EXCLUSION_COLLECTION,
    record: {
      $type: BIOBLITZ_EXCLUSION_COLLECTION,
      subject: did,
      roundId,
      excluded: true,
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
    excluded: true,
    createdAt,
  };
  return (await enrichRows([record]))[0]!;
}

/**
 * Restore counting for the selected account/week. This appends an inclusion
 * event instead of deleting the original record, so a plain group member can
 * reverse an exclusion created by any other member while preserving history.
 */
export async function removeBioblitzExclusion(
  repoDid: string,
  cookie: string | null,
  rkey: string,
): Promise<void> {
  const trimmed = rkey.trim();
  if (!trimmed) throw new BioblitzExclusionMutationError("invalid_request", 400);

  const records = await fetchBioblitzExclusionRecords(repoDid);
  const target = resolveActiveBioblitzExclusion(records, trimmed);
  if (!target) return;
  assertRoundIsMutable(target.roundId);

  await cgsMutate(
    repoDid,
    cookie,
    {
      operation: "createRecord",
      collection: BIOBLITZ_EXCLUSION_COLLECTION,
      record: {
        $type: BIOBLITZ_EXCLUSION_COLLECTION,
        subject: target.subjectDid,
        roundId: target.roundId,
        excluded: false,
        createdAt: new Date().toISOString(),
      },
    },
    "delete_failed",
  );
  invalidateBioblitzExclusionsCache();
}
