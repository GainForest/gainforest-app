/**
 * Rewilding the Web grant state: milestone confirmations.
 *
 * These live in the GainForest moderation account's repo, written through the
 * CGS mutation proxy by admin-group members from the admin panel — a grantee
 * never writes them. They follow the same append-only event model as BioBlitz
 * exclusions (`app.gainforest.bioblitz.exclusion`): the newest event per
 * grantee + milestone wins, so any group member can reverse another member's
 * confirmation without deleting their record.
 *
 * Grant documents are deliberately NOT here. Everything in this repo is
 * world-readable, and a grant contract is private — those live in private
 * object storage instead (app/admin/_lib/rewilding-documents.ts).
 *
 * The program structure (M1–M4 gating three payment tranches of a USD 1,000
 * grant) mirrors the Rewilding the Web Program Handbook (Linear doc
 * `program-handbook-ed23eb2f3242`).
 */

import { cachedAsync, invalidateCachedAsyncByPrefix } from "./async-cache";
import { GAINFOREST_MODERATION_REPO_DID } from "./moderation-repo";
import { resolvePdsHost } from "./pds";

/**
 * Milestone confirmation events. Written from the admin panel only.
 *
 * Namespaced `app.gainforest.grant.<program>.<record>`: GainForest grants
 * first, the program second, so a future program gets its own branch instead
 * of another top-level name.
 */
export const REWILDING_MILESTONE_COLLECTION = "app.gainforest.grant.rewilding.milestone";

/**
 * Per-grantee milestone plan events: a due date, name or description set on
 * a program milestone, or a custom milestone an admin added for one grantee
 * only. Written from the admin panel only; newest event per grantee +
 * milestone wins, and a `removed: true` event retires a custom milestone
 * without deleting history. A program milestone with no override falls back
 * to the translated program copy, so an untouched plan reads exactly like
 * the handbook.
 */
export const REWILDING_MILESTONE_PLAN_COLLECTION = "app.gainforest.grant.rewilding.milestonePlan";

/** Program constants from the handbook. */
export const REWILDING_GRANT_AMOUNT_USD = 1000;
export const REWILDING_AUDIO_TARGET_MINUTES = 7000;
/** The grant period runs September to the end of November 2026. Together
 *  these set the pace a grantee needs to keep: the recording target has to be
 *  met inside this window. The end is inclusive of the whole final day. */
export const REWILDING_GRANT_START_ISO = "2026-09-01T00:00:00.000Z";
export const REWILDING_GRANT_END_ISO = "2026-11-30T23:59:59.999Z";

export type RewildingMilestoneId = "m1" | "m2" | "m3" | "m4";

export const REWILDING_MILESTONE_IDS: readonly RewildingMilestoneId[] = ["m1", "m2", "m3", "m4"];

export function isRewildingMilestoneId(value: unknown): value is RewildingMilestoneId {
  return typeof value === "string" && (REWILDING_MILESTONE_IDS as readonly string[]).includes(value);
}

/**
 * Custom milestones get server-generated ids in their own namespace (a "c"
 * prefix), so they can never collide with the program's "m*" ids and a
 * malformed id from an older or newer writer is simply ignored.
 */
export function isCustomRewildingMilestoneId(value: unknown): value is string {
  return typeof value === "string" && /^c[a-z0-9]{4,40}$/.test(value);
}

/** Any milestone id this program understands: a program milestone or a
 *  per-grantee custom one. */
export function isKnownRewildingMilestoneId(value: unknown): value is string {
  return isRewildingMilestoneId(value) || isCustomRewildingMilestoneId(value);
}

export function newCustomRewildingMilestoneId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Due dates are calendar dates (YYYY-MM-DD), not moments — the admin picks
 *  a day, and every viewer sees that same day regardless of timezone. */
export function isRewildingDueDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export type RewildingMilestoneDefinition = {
  id: RewildingMilestoneId;
  /** Short program code, e.g. "M2". Shown as-is; not translated. */
  code: string;
  /** The payment tranche this milestone releases, when it gates one. M3 shares
   *  M2's tranche, so M2 carries no payout of its own. */
  payout?: { tranche: number; amountUsd: number };
  /** Milestones about the devices link through to the recorder inventory. */
  isRecorderInventory?: boolean;
};

/**
 * The four contract milestones from the Program Handbook — the structure
 * only. Each milestone's name and description is UI copy and lives in
 * messages under `common.rewildingProgram.milestones.<id>`, so a grantee
 * reads their contract steps in their own language.
 */
export const REWILDING_MILESTONES: readonly RewildingMilestoneDefinition[] = [
  { id: "m1", code: "M1", payout: { tranche: 1, amountUsd: 333 } },
  { id: "m2", code: "M2", isRecorderInventory: true },
  {
    id: "m3",
    code: "M3",
    // Tranche 2 releases when M2 *and* M3 are confirmed — the handbook hangs
    // the payout on the pair, so it is shown on the later of the two.
    payout: { tranche: 2, amountUsd: 333 },
  },
  { id: "m4", code: "M4", payout: { tranche: 3, amountUsd: 334 } },
];

const MILESTONE_CACHE_KEY = "rewilding-milestones:v1";
const MILESTONE_PLAN_CACHE_KEY = "rewilding-milestone-plans:v1";
const CACHE_MS = 30_000;

export type RewildingMilestoneRecord = {
  rkey: string;
  uri: string;
  subjectDid: string;
  /** A program milestone id ("m1"…"m4") or a custom milestone id. */
  milestoneId: string;
  /** False is an append-only reopen event created by another steward. */
  done: boolean;
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
  if (!subjectDid?.startsWith("did:") || !createdAt || !isKnownRewildingMilestoneId(milestoneId)) {
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

/** Page through a collection on the moderation account's PDS. Shared with
 *  the other Rewilding record types (grantee enrollment). */
export async function listModerationRecords(
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

/** Briefly cached read for page renders. */
export function fetchRewildingMilestones(signal?: AbortSignal): Promise<RewildingMilestoneRecord[]> {
  return cachedAsync(MILESTONE_CACHE_KEY, CACHE_MS, () => fetchRewildingMilestoneRecords(), signal);
}

export function invalidateRewildingMilestonesCache(): void {
  invalidateCachedAsyncByPrefix(MILESTONE_CACHE_KEY);
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
): Set<string> {
  const done = new Set<string>();
  for (const record of effectiveRewildingMilestones(records)) {
    if (record.subjectDid === subjectDid && record.done) done.add(record.milestoneId);
  }
  return done;
}

/* ------------------------------------------------------------------------ *
 * Milestone plans: per-grantee due dates and custom milestones.
 * ------------------------------------------------------------------------ */

export type RewildingMilestonePlanRecord = {
  rkey: string;
  uri: string;
  subjectDid: string;
  /** A program milestone id or a custom milestone id. */
  milestoneId: string;
  /** Admin-written name. For a program milestone this is a per-grantee
   *  override of the translated program copy; null falls back to it. For a
   *  custom milestone it is the name itself. */
  title: string | null;
  /** Admin-written description; same fallback rule as `title`. */
  description: string | null;
  /** Calendar date (YYYY-MM-DD) the milestone is due, or null for none. */
  dueDate: string | null;
  /** True retires a custom milestone (append-only tombstone). */
  removed: boolean;
  createdAt: string;
};

/** Parse one public PDS milestone-plan event, ignoring malformed values. */
export function parseRewildingMilestonePlanRecord(
  entry: unknown,
): RewildingMilestonePlanRecord | null {
  if (!isRecord(entry)) return null;
  const uri = nonEmptyString(entry.uri);
  const value = entry.value;
  if (!uri || !isRecord(value)) return null;

  const subjectDid = nonEmptyString(value.subject);
  const createdAt = nonEmptyString(value.createdAt);
  const milestoneId = value.milestoneId;
  if (!subjectDid?.startsWith("did:") || !createdAt || !isKnownRewildingMilestoneId(milestoneId)) {
    return null;
  }
  // A custom milestone without a name cannot be rendered; only its
  // tombstone may omit the title. Program milestones fall back to program
  // copy, so an absent title is fine there.
  const title = nonEmptyString(value.title);
  const removed = value.removed === true;
  if (isCustomRewildingMilestoneId(milestoneId) && !title && !removed) return null;

  return {
    rkey: uri.split("/").pop() ?? "",
    uri,
    subjectDid,
    milestoneId,
    title,
    description: nonEmptyString(value.description),
    dueDate: isRewildingDueDate(value.dueDate) ? value.dueDate : null,
    removed,
    createdAt,
  };
}

/** Read every milestone-plan event directly from the moderation account's PDS. */
export async function fetchRewildingMilestonePlanRecords(
  repoDid: string = GAINFOREST_MODERATION_REPO_DID,
  signal?: AbortSignal,
): Promise<RewildingMilestonePlanRecord[]> {
  const entries = await listModerationRecords(repoDid, REWILDING_MILESTONE_PLAN_COLLECTION, signal);
  return entries
    .flatMap((entry) => {
      const record = parseRewildingMilestonePlanRecord(entry);
      return record ? [record] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri));
}

/** Briefly cached read for page renders. */
export function fetchRewildingMilestonePlans(
  signal?: AbortSignal,
): Promise<RewildingMilestonePlanRecord[]> {
  return cachedAsync(MILESTONE_PLAN_CACHE_KEY, CACHE_MS, () => fetchRewildingMilestonePlanRecords(), signal);
}

export function invalidateRewildingMilestonePlansCache(): void {
  invalidateCachedAsyncByPrefix(MILESTONE_PLAN_CACHE_KEY);
}

/**
 * Resolve the append-only plan stream to the current plan per grantee +
 * milestone. The newest event wins, exactly like milestone confirmations.
 */
export function effectiveRewildingMilestonePlans(
  records: readonly RewildingMilestonePlanRecord[],
): RewildingMilestonePlanRecord[] {
  const newestFirst = [...records].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
  const seen = new Set<string>();
  const current: RewildingMilestonePlanRecord[] = [];
  for (const record of newestFirst) {
    const key = `${record.subjectDid}:${record.milestoneId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.push(record);
  }
  return current;
}

/**
 * One grantee's full milestone list with the plan applied: the shared
 * program milestones (M1–M4, in program order, carrying any per-grantee due
 * date) followed by that grantee's custom milestones in the order they were
 * first added — an edit updates a custom milestone in place rather than
 * moving it to the end.
 */
export type ResolvedRewildingMilestone = {
  id: string;
  /** Short code shown on the row. Program milestones keep "M1"…"M4"; custom
   *  milestones continue the numbering ("M5", "M6", …) in plan order. */
  code: string;
  /** Admin-written name: an override for a program milestone (null falls
   *  back to translated program copy), the name itself for a custom one. */
  title: string | null;
  /** Admin-written description; same fallback rule as `title`. */
  description: string | null;
  /** Calendar date (YYYY-MM-DD) this milestone is due, or null. */
  dueDate: string | null;
  isCustom: boolean;
  payout: { tranche: number; amountUsd: number } | null;
  isRecorderInventory: boolean;
};

export function resolveRewildingMilestonePlan(
  planRecords: readonly RewildingMilestonePlanRecord[],
  subjectDid: string,
): ResolvedRewildingMilestone[] {
  const current = effectiveRewildingMilestonePlans(planRecords).filter(
    (record) => record.subjectDid === subjectDid,
  );
  const byId = new Map(current.map((record) => [record.milestoneId, record]));

  const program: ResolvedRewildingMilestone[] = REWILDING_MILESTONES.map((definition) => ({
    id: definition.id,
    code: definition.code,
    title: byId.get(definition.id)?.title ?? null,
    description: byId.get(definition.id)?.description ?? null,
    dueDate: byId.get(definition.id)?.dueDate ?? null,
    isCustom: false,
    payout: definition.payout ?? null,
    isRecorderInventory: definition.isRecorderInventory ?? false,
  }));

  // Position comes from the oldest event per custom milestone — the moment it
  // was added — so renames and due-date changes never reorder the list.
  const firstSeen = new Map<string, string>();
  for (const record of planRecords) {
    if (record.subjectDid !== subjectDid || !isCustomRewildingMilestoneId(record.milestoneId)) continue;
    const existing = firstSeen.get(record.milestoneId);
    if (!existing || record.createdAt < existing) firstSeen.set(record.milestoneId, record.createdAt);
  }

  const custom: ResolvedRewildingMilestone[] = current
    .filter((record) => isCustomRewildingMilestoneId(record.milestoneId) && !record.removed && record.title)
    .sort((a, b) => {
      const aFirst = firstSeen.get(a.milestoneId) ?? a.createdAt;
      const bFirst = firstSeen.get(b.milestoneId) ?? b.createdAt;
      return aFirst.localeCompare(bFirst) || a.milestoneId.localeCompare(b.milestoneId);
    })
    .map((record, index) => ({
      id: record.milestoneId,
      // Numbering continues after the program milestones and reflects the
      // current plan: removing a custom milestone renumbers the ones after it.
      code: `M${program.length + index + 1}`,
      title: record.title,
      description: record.description,
      dueDate: record.dueDate,
      isCustom: true,
      payout: null,
      isRecorderInventory: false,
    }));

  return [...program, ...custom];
}
