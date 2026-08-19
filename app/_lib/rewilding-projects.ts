import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
  fetchInternalBadgeData,
  type BadgeAwardRecord,
  type StrongRef,
} from "@/app/internal/badges/_lib/badge-records";
import { GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/moderation-repo";
import {
  effectiveRewildingGrantees,
  fetchRewildingGrantees,
  fetchRewildingGranteeRecords,
} from "@/app/_lib/rewilding-grantees";
import { cgsMutate } from "@/app/internal/badges/_lib/test-accounts";
import { resolvePdsHost } from "@/app/_lib/pds";

/**
 * Which projects are part of the "Rewilding the Web" grant.
 *
 * A grantee is an *account* holding one of the program's ten slots
 * (`rewilding-grantees.ts`). One grantee can own several projects, so being a
 * grantee is not the same as "this project is in the grant" — an admin picks,
 * per grantee, which of that account's projects the grant covers.
 *
 * That per-project selection is a badge award in the GainForest moderation
 * repo, exactly like the featured-projects marker (`featured-projects.ts`):
 * an `app.certified.badge.award` whose subject is the project record URI
 * `at://<granteeDid>/org.hypercerts.collection/<rkey>`, pointing at a
 * `rewilding-project` badge definition.
 *
 * The link to enrollment is enforced at read time, not by deleting records:
 * the effective set is the awarded project URIs whose owner DID is currently
 * an active grantee. Remove an account from the program and its projects drop
 * out of the shelf and lose the indicator automatically; re-add the account
 * and the same picks reappear. Nothing is cleaned up on removal, matching the
 * append-only, reversible model the rest of the rewilding system uses.
 */

const REWILDING_PROJECT_BADGE_TITLE = "rewilding-project";
const REWILDING_PROJECT_BADGE_DESCRIPTION =
  "Marks a project as part of the Rewilding the Web grant.";
const REWILDING_PROJECT_AWARD_NOTE = "Selected as part of the Rewilding the Web grant.";

export const REWILDING_PROJECTS_CACHE_TAG = "rewilding-projects";

function parseProjectUri(
  uri: string,
): { did: string; collection: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match || !match[1]?.startsWith("did:") || match[2] !== "org.hypercerts.collection") {
    return null;
  }
  return { did: match[1], collection: match[2], rkey: match[3] };
}

export function isProjectRecordUri(uri: string): boolean {
  return Boolean(parseProjectUri(uri));
}

/** Owner DID of a project record URI, or null if it is not one. */
export function projectUriOwnerDid(uri: string): string | null {
  return parseProjectUri(uri)?.did ?? null;
}

function findDefinition(
  definitions: { uri: string; cid: string; title: string }[],
): StrongRef | null {
  const match = definitions.find(
    (definition) => definition.title.trim().toLowerCase() === REWILDING_PROJECT_BADGE_TITLE,
  );
  return match ? { uri: match.uri, cid: match.cid } : null;
}

function matchingAwards(
  definition: StrongRef | null,
  awards: BadgeAwardRecord[],
): BadgeAwardRecord[] {
  if (!definition) return [];
  return awards.filter(
    (award) =>
      award.badge.uri === definition.uri &&
      award.subjectKind === "record" &&
      isProjectRecordUri(award.subjectLabel),
  );
}

async function readRewildingProjectAwards(repoDid: string): Promise<BadgeAwardRecord[]> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  return matchingAwards(findDefinition(data.definitions), data.awards);
}

/** Every project URI ever selected, newest selection first — before the
 *  active-grantee filter. Cached; the admin picker uses this to know which of
 *  a grantee's projects are currently ticked. */
const readCachedSelectedProjectUris = unstable_cache(
  async (repoDid: string) =>
    (await readRewildingProjectAwards(repoDid)).map((award) => award.subjectLabel),
  ["rewilding-project-uris-v1"],
  { revalidate: 300, tags: [REWILDING_PROJECTS_CACHE_TAG] },
);

/** Raw selected project URIs (not yet filtered by active enrollment). */
export function fetchSelectedRewildingProjectUris(
  repoDid: string = GAINFOREST_MODERATION_REPO_DID,
): Promise<string[]> {
  return readCachedSelectedProjectUris(repoDid);
}

/**
 * The project URIs that are effectively part of the grant right now: selected
 * *and* owned by an account that currently holds a grant slot. This is what
 * the public projects shelf and the per-project indicator read — so removing a
 * grantee cascades without any cleanup writes.
 */
export async function fetchRewildingProjectUris(
  repoDid: string = GAINFOREST_MODERATION_REPO_DID,
): Promise<string[]> {
  const [selected, granteeRecords] = await Promise.all([
    fetchSelectedRewildingProjectUris(repoDid).catch(() => []),
    fetchRewildingGrantees().catch(() => []),
  ]);
  const activeGranteeDids = new Set(
    effectiveRewildingGrantees(granteeRecords).map((record) => record.subjectDid),
  );
  return selected.filter((uri) => {
    const owner = projectUriOwnerDid(uri);
    return owner !== null && activeGranteeDids.has(owner);
  });
}

export function invalidateRewildingProjectsCache(): void {
  revalidateTag(REWILDING_PROJECTS_CACHE_TAG, { expire: 0 });
}

export class RewildingProjectMutationError extends Error {
  status: number;
  code: "invalid_project" | "not_a_grantee" | "save_failed";

  constructor(code: "invalid_project" | "not_a_grantee" | "save_failed", status: number) {
    super(code);
    this.name = "RewildingProjectMutationError";
    this.status = status;
    this.code = code;
  }
}

/** Confirm the project's owner currently holds a grant slot. A project can
 *  only be tied to the grant while its owner is an active grantee — the same
 *  rule the read model enforces, applied up front on write so we never award a
 *  marker that would immediately be filtered out. */
async function assertOwnerIsActiveGrantee(ownerDid: string): Promise<void> {
  const granteeRecords = await fetchRewildingGranteeRecords().catch(() => []);
  const active = effectiveRewildingGrantees(granteeRecords).some(
    (record) => record.subjectDid === ownerDid,
  );
  if (!active) throw new RewildingProjectMutationError("not_a_grantee", 409);
}

/** Resolve a project record's current CID (required to award a strongRef). */
async function fetchRecordCid(uri: string): Promise<string> {
  const parsed = parseProjectUri(uri);
  if (!parsed) throw new RewildingProjectMutationError("invalid_project", 400);
  const host = await resolvePdsHost(parsed.did).catch(() => null);
  if (!host) throw new RewildingProjectMutationError("save_failed", 502);
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  const response = await fetch(
    `https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
    { cache: "no-store" },
  );
  const payload = (await response.json().catch(() => null)) as { cid?: unknown } | null;
  const cid = typeof payload?.cid === "string" && payload.cid.trim() ? payload.cid.trim() : null;
  if (!response.ok || !cid) {
    throw new RewildingProjectMutationError("save_failed", response.ok ? 502 : response.status);
  }
  return cid;
}

async function ensureDefinition(repoDid: string, cookie: string | null): Promise<StrongRef> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: false });
  const existing = findDefinition(data.definitions);
  if (existing) return existing;
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_DEFINITION_COLLECTION,
    record: {
      $type: BADGE_DEFINITION_COLLECTION,
      title: REWILDING_PROJECT_BADGE_TITLE,
      badgeType: "system",
      description: REWILDING_PROJECT_BADGE_DESCRIPTION,
      createdAt: new Date().toISOString(),
    },
  });
  if (!created.uri || !created.cid) throw new RewildingProjectMutationError("save_failed", 502);
  return { uri: created.uri, cid: created.cid };
}

/** Tie a project to the grant. Idempotent; refuses projects whose owner is not
 *  an active grantee. */
export async function addRewildingProject(
  repoDid: string,
  cookie: string | null,
  subjectUri: string,
): Promise<void> {
  const parsed = parseProjectUri(subjectUri);
  if (!parsed) throw new RewildingProjectMutationError("invalid_project", 400);
  await assertOwnerIsActiveGrantee(parsed.did);
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  let definition = findDefinition(data.definitions);
  const awards = matchingAwards(definition, data.awards);
  if (awards.some((award) => award.subjectLabel === subjectUri)) return;
  const cid = await fetchRecordCid(subjectUri);
  definition = definition ?? (await ensureDefinition(repoDid, cookie));
  await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_AWARD_COLLECTION,
    record: {
      $type: BADGE_AWARD_COLLECTION,
      badge: { uri: definition.uri, cid: definition.cid },
      subject: { $type: "com.atproto.repo.strongRef", uri: subjectUri, cid },
      note: REWILDING_PROJECT_AWARD_NOTE,
      createdAt: new Date().toISOString(),
    },
  });
  invalidateRewildingProjectsCache();
}

/** Drop a project from the grant. Idempotent; removes every matching award. */
export async function removeRewildingProject(
  repoDid: string,
  cookie: string | null,
  subjectUri: string,
): Promise<void> {
  if (!isProjectRecordUri(subjectUri)) {
    throw new RewildingProjectMutationError("invalid_project", 400);
  }
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  const definition = findDefinition(data.definitions);
  const awards = matchingAwards(definition, data.awards).filter(
    (award) => award.subjectLabel === subjectUri,
  );
  for (const award of awards) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: BADGE_AWARD_COLLECTION,
      rkey: award.rkey,
    });
  }
  invalidateRewildingProjectsCache();
}

export {
  REWILDING_PROJECT_BADGE_TITLE,
  REWILDING_PROJECT_BADGE_DESCRIPTION,
  REWILDING_PROJECT_AWARD_NOTE,
};
