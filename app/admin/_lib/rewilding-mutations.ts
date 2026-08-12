import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  REWILDING_MILESTONE_COLLECTION,
  doneRewildingMilestoneIds,
  fetchRewildingMilestoneRecords,
  invalidateRewildingMilestonesCache,
  isRewildingMilestoneId,
  type RewildingMilestoneId,
  type RewildingMilestoneRecord,
} from "@/app/_lib/rewilding-milestones";

/**
 * Admin-side writer for Rewilding the Web milestone confirmations, written to
 * the GainForest moderation repo through the CGS mutation proxy with the
 * acting admin's session cookie so the audit log names them.
 *
 * Grant documents are not written here — they are private and live in object
 * storage (see rewilding-documents.ts).
 */

export type RewildingMutationErrorCode = "invalid_request" | "save_failed" | "delete_failed";

export class RewildingMutationError extends Error {
  status: number;
  code: RewildingMutationErrorCode;

  constructor(code: RewildingMutationErrorCode, status: number) {
    super(code);
    this.name = "RewildingMutationError";
    this.status = status;
    this.code = code;
  }
}

type CgsMutationResult = { uri?: string; error?: string; message?: string };
type CgsPayload =
  | { operation: "createRecord"; collection: string; record: Record<string, unknown> }
  | { operation: "deleteRecord"; collection: string; rkey: string };

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
    throw new RewildingMutationError(failureCode, upstream.status || 502);
  }
  return data;
}

/**
 * Confirm or reopen one milestone for one grantee. Append-only and idempotent:
 * when the effective state already matches, no event is written.
 */
export async function setRewildingMilestone(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  milestoneId: string,
  done: boolean,
): Promise<RewildingMilestoneRecord> {
  const did = subjectDid.trim();
  if (!did.startsWith("did:") || !isRewildingMilestoneId(milestoneId)) {
    throw new RewildingMutationError("invalid_request", 400);
  }

  const existing = await fetchRewildingMilestoneRecords(repoDid);
  const alreadyDone = doneRewildingMilestoneIds(existing, did).has(milestoneId);
  if (alreadyDone === done) {
    const current = existing.find(
      (record) => record.subjectDid === did && record.milestoneId === milestoneId,
    );
    if (current) return current;
  }

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: REWILDING_MILESTONE_COLLECTION,
    record: {
      $type: REWILDING_MILESTONE_COLLECTION,
      subject: did,
      milestoneId,
      done,
      createdAt,
    },
  });
  if (!created.uri) throw new RewildingMutationError("save_failed", 502);

  invalidateRewildingMilestonesCache();
  return {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid: did,
    milestoneId: milestoneId as RewildingMilestoneId,
    done,
    createdAt,
  };
}
