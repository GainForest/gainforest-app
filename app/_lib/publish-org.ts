import "server-only";
import { resolvePdsHost } from "./pds";
import { resolveInternalBadgeRepoDid } from "@/app/internal/badges/_lib/access";
import { BADGE_AWARD_COLLECTION, BADGE_DEFINITION_COLLECTION } from "@/app/internal/badges/_lib/badge-records";

/**
 * Self-serve "Publish" for organizations and personal accounts.
 *
 * The public explore pages only list accounts holding a featured badge (see
 * `fetchFeaturedBadgeIndex`). Publishing awards the dedicated "Published on
 * GainForest" badge to the account, so everything it created (projects, certs,
 * observations, its org card) becomes visible on /projects, /organizations,
 * etc. The badge is deliberately DISTINCT from the "GainForest" badge: a
 * published org gains visibility but does not read "Trusted by GainForest"
 * and does not match the GainForest source chip — those stay hand-awarded
 * endorsement/participation signals.
 *
 * The award (and, first time only, the badge definition) must live in the
 * GAINFOREST repo, which the publishing user is not a member of — so the
 * server writes through the Certified Group Service with an owner-issued API
 * key (`GAINFOREST_CGS_API_KEY`, scopes
 * `repo:app.certified.badge.award?action=create` and
 * `repo:app.certified.badge.definition?action=create`). Per the CGS API-key
 * rules the target group travels on the querystring.
 */

/** The GainForest repo hosting the badge family (built-in trusted issuer). */
const FALLBACK_GAINFOREST_REPO_DID = "did:plc:yjck2sybksyigp3zvbq7bfki";
/** Must match the `published` entry in the indexer's FEATURED_BADGES list. */
const PUBLISH_BADGE_TITLE = "Published on GainForest";
const PUBLISH_BADGE_DESCRIPTION = "Organization published its work on the GainForest explore pages.";
const MAX_AWARD_PAGES = 40;

export class PublishOrgError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PublishOrgError";
    this.status = status;
  }
}

function cgsBaseUrl(): string {
  return (process.env.GAINFOREST_CGS_URL?.trim() || "https://dev.groups.certified.app").replace(/\/$/, "");
}

function cgsApiKey(): string | null {
  return process.env.GAINFOREST_CGS_API_KEY?.trim() || null;
}

/** True when the server is configured to write publish awards. */
export function publishingConfigured(): boolean {
  return Boolean(cgsApiKey());
}

async function gainforestRepoDid(): Promise<string> {
  const configured = await resolveInternalBadgeRepoDid().catch(() => null);
  return configured ?? FALLBACK_GAINFOREST_REPO_DID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type ListedRecord = { uri?: unknown; cid?: unknown; value?: unknown };
type ListRecordsResponse = { records?: ListedRecord[]; cursor?: unknown };

async function listRepoRecords(repoDid: string, collection: string, maxPages: number): Promise<ListedRecord[]> {
  const host = await resolvePdsHost(repoDid);
  if (!host) throw new PublishOrgError("The publishing service is unreachable right now. Please try again later.", 502);
  const entries: ListedRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ repo: repoDid, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) break;
    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    if (Array.isArray(payload?.records)) entries.push(...payload.records);
    cursor = str(payload?.cursor) ?? undefined;
    if (!cursor) break;
  }
  return entries;
}

/** The "Published on GainForest" badge definition in the GainForest repo —
 *  the badge whose award makes an account featured on the explore pages.
 *  Null when it hasn't been created yet (the first publish creates it). */
async function findPublishBadgeDefinition(repoDid: string): Promise<{ uri: string; cid: string } | null> {
  const definitions = await listRepoRecords(repoDid, BADGE_DEFINITION_COLLECTION, 5);
  for (const entry of definitions) {
    const uri = str(entry.uri);
    const cid = str(entry.cid);
    if (!uri || !cid || !isRecord(entry.value)) continue;
    if (str(entry.value.title)?.toLowerCase() === PUBLISH_BADGE_TITLE.toLowerCase()) return { uri, cid };
  }
  return null;
}

/** One CGS write with the owner-issued API key. Returns the created record's
 *  uri/cid. The target group must be on the querystring (API-key rule). */
async function cgsCreateRecord(
  key: string,
  repoDid: string,
  collection: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  const url = `${cgsBaseUrl()}/xrpc/app.certified.group.repo.createRecord?repo=${encodeURIComponent(repoDid)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({ repo: repoDid, collection, record }),
    cache: "no-store",
  }).catch(() => null);

  if (!response) throw new PublishOrgError("The publishing service is unreachable right now. Please try again later.", 502);
  const payload = (await response.json().catch(() => null)) as { uri?: unknown; cid?: unknown; error?: unknown; message?: unknown } | null;
  const uri = str(payload?.uri);
  const cid = str(payload?.cid);
  if (!response.ok || !uri || !cid) {
    console.warn("[publish-org] CGS createRecord failed", {
      status: response.status,
      collection,
      upstream: str(payload?.message) ?? str(payload?.error),
    });
    throw new PublishOrgError("Publishing didn’t go through. Please try again later.", 502);
  }
  return { uri, cid };
}

function awardSubjectDid(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const subject = value.subject;
  if (!isRecord(subject)) return null;
  return str(subject.did);
}

function awardBadgeUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const badge = value.badge;
  if (!isRecord(badge)) return null;
  return str(badge.uri);
}

/** True when the GainForest repo already carries a GainForest-badge award for
 *  this account (published, or manually endorsed with the same badge). */
export async function isPublished(subjectDid: string): Promise<boolean> {
  const repoDid = await gainforestRepoDid();
  const definition = await findPublishBadgeDefinition(repoDid);
  if (!definition) return false;
  const awards = await listRepoRecords(repoDid, BADGE_AWARD_COLLECTION, MAX_AWARD_PAGES);
  return awards.some((entry) => awardBadgeUri(entry.value) === definition.uri && awardSubjectDid(entry.value) === subjectDid);
}

/** Award the "Published on GainForest" badge to `subjectDid` through CGS.
 *  Creates the badge definition on first use. Idempotent: if the account
 *  already holds the badge, this is a no-op. */
export async function publishAccount(subjectDid: string): Promise<void> {
  const key = cgsApiKey();
  if (!key) throw new PublishOrgError("Publishing isn’t available right now. Please try again later.", 503);

  const repoDid = await gainforestRepoDid();
  let definition = await findPublishBadgeDefinition(repoDid);
  if (definition) {
    const definitionUri = definition.uri;
    const awards = await listRepoRecords(repoDid, BADGE_AWARD_COLLECTION, MAX_AWARD_PAGES);
    const already = awards.some((entry) => awardBadgeUri(entry.value) === definitionUri && awardSubjectDid(entry.value) === subjectDid);
    if (already) return;
  } else {
    // First publish ever: create the dedicated definition. Its title is what
    // the indexer's featured-badge index keys on (`published`).
    definition = await cgsCreateRecord(key, repoDid, BADGE_DEFINITION_COLLECTION, {
      $type: BADGE_DEFINITION_COLLECTION,
      title: PUBLISH_BADGE_TITLE,
      badgeType: "participation",
      description: PUBLISH_BADGE_DESCRIPTION,
      allowedIssuers: [{ $type: "app.certified.defs#did", did: repoDid }],
      createdAt: new Date().toISOString(),
    });
  }

  await cgsCreateRecord(key, repoDid, BADGE_AWARD_COLLECTION, {
    $type: BADGE_AWARD_COLLECTION,
    badge: { uri: definition.uri, cid: definition.cid },
    subject: { $type: "app.certified.defs#did", did: subjectDid },
    note: "Published from the GainForest app",
    createdAt: new Date().toISOString(),
  });
}
