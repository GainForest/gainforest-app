import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  REWILDING_MILESTONE_COLLECTION,
  REWILDING_MILESTONE_PLAN_COLLECTION,
  REWILDING_PAYOUT_MODE_COLLECTION,
  doneRewildingMilestoneIds,
  effectiveRewildingMilestonePlans,
  fetchRewildingMilestonePlanRecords,
  fetchRewildingMilestoneRecords,
  fetchRewildingPayoutModeRecords,
  invalidateRewildingMilestonePlansCache,
  invalidateRewildingMilestonesCache,
  invalidateRewildingPayoutModesCache,
  isCustomRewildingMilestoneId,
  isRewildingDueDate,
  isRewildingMilestoneId,
  isRewildingPayoutCustom,
  isRewildingPayoutUsd,
  newCustomRewildingMilestoneId,
  type RewildingMilestonePlanRecord,
  type RewildingMilestoneRecord,
  type RewildingPayoutModeRecord,
} from "@/app/_lib/rewilding-milestones";
import {
  REWILDING_ENROLLMENT_COLLECTION,
  REWILDING_GRANT_SLOTS,
  effectiveRewildingGrantees,
  fetchRewildingGranteeRecords,
  invalidateRewildingGranteesCache,
  type RewildingGranteeRecord,
} from "@/app/_lib/rewilding-grantees";

/**
 * Admin-side writers for Rewilding the Web grantee enrollment and milestone
 * confirmations, written to the GainForest moderation repo through the CGS
 * mutation proxy with the acting admin's session cookie so the audit log
 * names them.
 *
 * Grant documents are not written here — they are private and live in object
 * storage (see rewilding-documents.ts).
 */

export type RewildingMutationErrorCode =
  | "invalid_request"
  | "slots_full"
  | "save_failed"
  | "delete_failed";

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
  if (!did.startsWith("did:")) throw new RewildingMutationError("invalid_request", 400);
  if (isCustomRewildingMilestoneId(milestoneId)) {
    // A custom milestone can only be confirmed while it is part of the
    // grantee's plan — a removed or foreign id is refused.
    const plans = await fetchRewildingMilestonePlanRecords(repoDid);
    const current = effectiveRewildingMilestonePlans(plans).find(
      (record) => record.subjectDid === did && record.milestoneId === milestoneId,
    );
    if (!current || current.removed) throw new RewildingMutationError("invalid_request", 400);
  } else if (!isRewildingMilestoneId(milestoneId)) {
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
    milestoneId,
    done,
    createdAt,
  };
}

const MILESTONE_TITLE_MAX_CHARS = 200;
const MILESTONE_DESCRIPTION_MAX_CHARS = 2000;

export type RewildingMilestonePlanInput = {
  /** Omit to add a new custom milestone (the id is generated here). */
  milestoneId?: string | null;
  /** Milestone name. For a program milestone an override of the program
   *  copy — empty clears it back to the standard wording. Required for a
   *  custom milestone (unless removing it). */
  title?: string | null;
  /** Milestone description; same override/fallback rule as `title`. */
  description?: string | null;
  /** Calendar date (YYYY-MM-DD) or null/omitted for no due date. */
  dueDate?: string | null;
  /** Per-grantee custom payment in whole USD, or null/omitted for none. Zero
   *  is a real value (a milestone with no payment under a custom split);
   *  null leaves the handbook amount in place. */
  payoutUsd?: number | null;
  /** True retires a custom milestone. Refused for program milestones. */
  removed?: boolean;
};

/**
 * Write one grantee's plan for one milestone: the name, description and due
 * date on any milestone (program milestones fall back to program copy where
 * blank), or a custom milestone's creation or removal. Append-only and
 * idempotent — each event carries the milestone's full plan state, and
 * nothing is written when the effective state already matches.
 */
export async function setRewildingMilestonePlan(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  input: RewildingMilestonePlanInput,
): Promise<RewildingMilestonePlanRecord> {
  const did = subjectDid.trim();
  if (!did.startsWith("did:")) throw new RewildingMutationError("invalid_request", 400);

  const dueDate = input.dueDate ?? null;
  if (dueDate !== null && !isRewildingDueDate(dueDate)) {
    throw new RewildingMutationError("invalid_request", 400);
  }

  // A removed custom milestone releases nothing, so any payment on it is
  // dropped rather than stored on the tombstone.
  const payoutUsd = input.removed === true ? null : input.payoutUsd ?? null;
  if (payoutUsd !== null && !isRewildingPayoutUsd(payoutUsd)) {
    throw new RewildingMutationError("invalid_request", 400);
  }

  const requestedId = typeof input.milestoneId === "string" ? input.milestoneId.trim() : "";
  const isProgram = isRewildingMilestoneId(requestedId);
  const isExistingCustom = isCustomRewildingMilestoneId(requestedId);
  const isNew = requestedId === "";
  if (!isProgram && !isExistingCustom && !isNew) {
    throw new RewildingMutationError("invalid_request", 400);
  }
  // Program milestones are the contract's shared structure — a grantee's plan
  // can rename, describe and date them, never delete them.
  const removed = input.removed === true;
  if (isProgram && removed) throw new RewildingMutationError("invalid_request", 400);

  const title = (input.title ?? "").trim() || null;
  const description = (input.description ?? "").trim() || null;
  if (title && title.length > MILESTONE_TITLE_MAX_CHARS) {
    throw new RewildingMutationError("invalid_request", 400);
  }
  if (description && description.length > MILESTONE_DESCRIPTION_MAX_CHARS) {
    throw new RewildingMutationError("invalid_request", 400);
  }
  // A custom milestone must carry a name (program milestones fall back to
  // program copy, custom ones have nothing to fall back to).
  if (!isProgram && !removed && !title) {
    throw new RewildingMutationError("invalid_request", 400);
  }

  const existing = await fetchRewildingMilestonePlanRecords(repoDid);
  if (isExistingCustom) {
    // Editing or removing something that was never part of this grantee's
    // plan is a caller bug, not a no-op.
    const known = existing.some(
      (record) => record.subjectDid === did && record.milestoneId === requestedId,
    );
    if (!known) throw new RewildingMutationError("invalid_request", 400);
  }

  const milestoneId = isNew ? newCustomRewildingMilestoneId() : requestedId;
  if (!isNew) {
    const current = effectiveRewildingMilestonePlans(existing).find(
      (record) => record.subjectDid === did && record.milestoneId === milestoneId,
    );
    const matchesAlready =
      current !== undefined &&
      current.removed === removed &&
      (current.dueDate ?? null) === dueDate &&
      (removed ||
        (current.title === title &&
          current.description === description &&
          (current.payoutUsd ?? null) === payoutUsd));
    if (matchesAlready && current) return current;
    // A program milestone with no plan yet and nothing to set: nothing to write.
    if (
      isProgram &&
      !current &&
      dueDate === null &&
      title === null &&
      description === null &&
      payoutUsd === null
    ) {
      return {
        rkey: "",
        uri: "",
        subjectDid: did,
        milestoneId,
        title: null,
        description: null,
        dueDate: null,
        payoutUsd: null,
        removed: false,
        createdAt: new Date().toISOString(),
      };
    }
  }

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: REWILDING_MILESTONE_PLAN_COLLECTION,
    record: {
      $type: REWILDING_MILESTONE_PLAN_COLLECTION,
      subject: did,
      milestoneId,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(dueDate ? { dueDate } : {}),
      // Written even when zero: an explicit 0 is a milestone the admin chose to
      // leave unpaid under a custom split, distinct from no override at all.
      ...(payoutUsd !== null ? { payoutUsd } : {}),
      ...(removed ? { removed: true } : {}),
      createdAt,
    },
  });
  if (!created.uri) throw new RewildingMutationError("save_failed", 502);

  invalidateRewildingMilestonePlansCache();
  return {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid: did,
    milestoneId,
    title,
    description,
    dueDate,
    payoutUsd,
    removed,
    createdAt,
  };
}

/**
 * Switch one grantee between the standard handbook payout split and a custom
 * one. Append-only and idempotent, mirroring milestone confirmations: the
 * newest event per grantee wins, and nothing is written when the effective
 * mode already matches. The per-milestone amounts themselves live on the
 * milestone-plan records; this only decides whether they take effect.
 */
export async function setRewildingPayoutMode(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  custom: boolean,
): Promise<RewildingPayoutModeRecord> {
  const did = subjectDid.trim();
  if (!did.startsWith("did:")) throw new RewildingMutationError("invalid_request", 400);

  const existing = await fetchRewildingPayoutModeRecords(repoDid);
  if (isRewildingPayoutCustom(existing, did) === custom) {
    const current = existing.find((record) => record.subjectDid === did);
    if (current) return current;
    // No event yet and the caller wants the default (handbook) mode: that is
    // already the effective state, so there is nothing to write.
    if (!custom) {
      return {
        rkey: "",
        uri: "",
        subjectDid: did,
        custom: false,
        createdAt: new Date().toISOString(),
      };
    }
  }

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: REWILDING_PAYOUT_MODE_COLLECTION,
    record: {
      $type: REWILDING_PAYOUT_MODE_COLLECTION,
      subject: did,
      custom,
      createdAt,
    },
  });
  if (!created.uri) throw new RewildingMutationError("save_failed", 502);

  invalidateRewildingPayoutModesCache();
  return {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid: did,
    custom,
    createdAt,
  };
}

/**
 * Enroll an organization into (or remove it from) one of the program's ten
 * slots. Append-only and idempotent; enrolling past capacity is refused
 * server-side — the ten-organization limit is program policy, not UI
 * convenience.
 */
export async function setRewildingGrantee(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  active: boolean,
): Promise<RewildingGranteeRecord> {
  const did = subjectDid.trim();
  if (!did.startsWith("did:")) throw new RewildingMutationError("invalid_request", 400);

  const existing = await fetchRewildingGranteeRecords(repoDid);
  const enrolled = effectiveRewildingGrantees(existing);
  const current = enrolled.find((record) => record.subjectDid === did);
  if (current && active) return current;
  if (!current && !active) {
    const latest = existing.find((record) => record.subjectDid === did);
    if (latest) return latest;
    throw new RewildingMutationError("invalid_request", 400);
  }
  if (active && enrolled.length >= REWILDING_GRANT_SLOTS) {
    throw new RewildingMutationError("slots_full", 409);
  }

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: REWILDING_ENROLLMENT_COLLECTION,
    record: {
      $type: REWILDING_ENROLLMENT_COLLECTION,
      subject: did,
      active,
      createdAt,
    },
  });
  if (!created.uri) throw new RewildingMutationError("save_failed", 502);

  invalidateRewildingGranteesCache();
  return {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    subjectDid: did,
    active,
    createdAt,
  };
}
