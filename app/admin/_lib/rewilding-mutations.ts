import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  REWILDING_MILESTONE_COLLECTION,
  REWILDING_MILESTONE_PLAN_COLLECTION,
  doneRewildingMilestoneIds,
  effectiveRewildingMilestonePlans,
  fetchRewildingMilestonePlanRecords,
  fetchRewildingMilestoneRecords,
  invalidateRewildingMilestonePlansCache,
  invalidateRewildingMilestonesCache,
  isCustomRewildingMilestoneId,
  isRewildingDueDate,
  isRewildingMilestoneId,
  newCustomRewildingMilestoneId,
  type RewildingMilestonePlanRecord,
  type RewildingMilestoneRecord,
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

export type RewildingMilestonePlanInput = {
  /** Omit to add a new custom milestone (the id is generated here). */
  milestoneId?: string | null;
  /** Custom milestone name. Ignored for program milestones. */
  title?: string | null;
  /** Calendar date (YYYY-MM-DD) or null/omitted for no due date. */
  dueDate?: string | null;
  /** True retires a custom milestone. Refused for program milestones. */
  removed?: boolean;
};

/**
 * Write one grantee's plan for one milestone: the due date on a program
 * milestone, or a custom milestone's name + due date (or its removal).
 * Append-only and idempotent — each event carries the milestone's full plan
 * state, and nothing is written when the effective state already matches.
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

  const requestedId = typeof input.milestoneId === "string" ? input.milestoneId.trim() : "";
  const isProgram = isRewildingMilestoneId(requestedId);
  const isExistingCustom = isCustomRewildingMilestoneId(requestedId);
  const isNew = requestedId === "";
  if (!isProgram && !isExistingCustom && !isNew) {
    throw new RewildingMutationError("invalid_request", 400);
  }
  // Program milestones are the contract's shared structure — a grantee's plan
  // can date them, never delete them.
  const removed = input.removed === true;
  if (isProgram && removed) throw new RewildingMutationError("invalid_request", 400);

  const title = isProgram ? null : (input.title ?? "").trim() || null;
  if (!isProgram && !removed) {
    if (!title || title.length > MILESTONE_TITLE_MAX_CHARS) {
      throw new RewildingMutationError("invalid_request", 400);
    }
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
    const matchesAlready = isProgram
      ? (current?.dueDate ?? null) === dueDate
      : current !== undefined &&
        current.removed === removed &&
        (current.dueDate ?? null) === dueDate &&
        (removed || current.title === title);
    if (matchesAlready && current) return current;
    // A program milestone with no plan yet and no due date to set: nothing to write.
    if (isProgram && !current && dueDate === null) {
      return {
        rkey: "",
        uri: "",
        subjectDid: did,
        milestoneId,
        title: null,
        dueDate: null,
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
      ...(dueDate ? { dueDate } : {}),
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
    dueDate,
    removed,
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
