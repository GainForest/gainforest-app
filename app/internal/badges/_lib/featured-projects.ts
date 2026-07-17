import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import { resolvePdsHost } from "@/app/_lib/pds";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
  fetchInternalBadgeData,
  type BadgeAwardRecord,
  type StrongRef,
} from "./badge-records";
import { cgsMutate } from "./test-accounts";

export const FEATURED_PROJECTS_CACHE_TAG = "featured-projects";
const FEATURED_PROJECT_BADGE_TITLE = "featured-project";
const FEATURED_PROJECT_BADGE_DESCRIPTION = "Marks a project for the featured projects shelf on GainForest.";
const FEATURED_PROJECT_AWARD_NOTE = "Featured in the GainForest projects marketplace.";
export const MAX_FEATURED_PROJECTS = 3;

export class FeaturedProjectMutationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FeaturedProjectMutationError";
    this.status = status;
  }
}

function parseProjectUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match || !match[1]?.startsWith("did:") || match[2] !== "org.hypercerts.collection") return null;
  return { did: match[1], collection: match[2], rkey: match[3] };
}

export function isProjectRecordUri(uri: string): boolean {
  return Boolean(parseProjectUri(uri));
}

function findDefinition(definitions: { uri: string; cid: string; title: string }[]): StrongRef | null {
  const match = definitions.find((definition) => definition.title.trim().toLowerCase() === FEATURED_PROJECT_BADGE_TITLE);
  return match ? { uri: match.uri, cid: match.cid } : null;
}

function matchingAwards(definition: StrongRef | null, awards: BadgeAwardRecord[]): BadgeAwardRecord[] {
  if (!definition) return [];
  return awards.filter(
    (award) => award.badge.uri === definition.uri
      && award.subjectKind === "record"
      && isProjectRecordUri(award.subjectLabel),
  );
}

async function readFeaturedProjectAwards(repoDid: string): Promise<BadgeAwardRecord[]> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  return matchingAwards(findDefinition(data.definitions), data.awards);
}

const readCachedFeaturedProjectUris = unstable_cache(
  async (repoDid: string) => (await readFeaturedProjectAwards(repoDid)).map((award) => award.subjectLabel),
  ["featured-project-uris-v1"],
  { revalidate: 300, tags: [FEATURED_PROJECTS_CACHE_TAG] },
);

/** Featured project record URIs, newest selection first. */
export async function fetchFeaturedProjectUris(repoDid: string): Promise<string[]> {
  return readCachedFeaturedProjectUris(repoDid);
}

async function fetchRecordCid(uri: string): Promise<string> {
  const parsed = parseProjectUri(uri);
  if (!parsed) throw new FeaturedProjectMutationError("A valid project is required.", 400);
  const host = await resolvePdsHost(parsed.did).catch(() => null);
  if (!host) throw new FeaturedProjectMutationError("Could not find where this project is stored.", 502);
  const params = new URLSearchParams({ repo: parsed.did, collection: parsed.collection, rkey: parsed.rkey });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as { cid?: unknown } | null;
  const cid = typeof payload?.cid === "string" && payload.cid.trim() ? payload.cid.trim() : null;
  if (!response.ok || !cid) throw new FeaturedProjectMutationError("Could not load this project.", response.ok ? 502 : response.status);
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
      title: FEATURED_PROJECT_BADGE_TITLE,
      badgeType: "system",
      description: FEATURED_PROJECT_BADGE_DESCRIPTION,
      createdAt: new Date().toISOString(),
    },
  });
  if (!created.uri || !created.cid) throw new FeaturedProjectMutationError("Could not create the featured-project marker.", 502);
  return { uri: created.uri, cid: created.cid };
}

export async function featureProject(repoDid: string, cookie: string | null, subjectUri: string): Promise<void> {
  if (!isProjectRecordUri(subjectUri)) throw new FeaturedProjectMutationError("A valid project is required.", 400);
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  let definition = findDefinition(data.definitions);
  const awards = matchingAwards(definition, data.awards);
  if (awards.some((award) => award.subjectLabel === subjectUri)) return;
  if (awards.length >= MAX_FEATURED_PROJECTS) {
    throw new FeaturedProjectMutationError("Only three projects can be featured at a time.", 409);
  }

  const cid = await fetchRecordCid(subjectUri);
  definition = definition ?? (await ensureDefinition(repoDid, cookie));
  await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_AWARD_COLLECTION,
    record: {
      $type: BADGE_AWARD_COLLECTION,
      badge: { uri: definition.uri, cid: definition.cid },
      subject: { $type: "com.atproto.repo.strongRef", uri: subjectUri, cid },
      note: FEATURED_PROJECT_AWARD_NOTE,
      createdAt: new Date().toISOString(),
    },
  });
  revalidateTag(FEATURED_PROJECTS_CACHE_TAG, "max");
}

export async function unfeatureProject(repoDid: string, cookie: string | null, subjectUri: string): Promise<void> {
  if (!isProjectRecordUri(subjectUri)) throw new FeaturedProjectMutationError("A valid project is required.", 400);
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  const definition = findDefinition(data.definitions);
  const awards = matchingAwards(definition, data.awards).filter((award) => award.subjectLabel === subjectUri);
  for (const award of awards) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: BADGE_AWARD_COLLECTION,
      rkey: award.rkey,
    });
  }
  revalidateTag(FEATURED_PROJECTS_CACHE_TAG, "max");
}
