import { fetchIndexedCertifiedProfileCards } from "@/app/_lib/indexer";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
  fetchInternalBadgeData,
} from "@/app/internal/badges/_lib/badge-records";

/**
 * Data for the /admin "Award endorsements" tab.
 *
 * An endorsement is an `app.certified.badge.award` the GainForest org signs in
 * its own repo against a badge definition typed `endorsement`. The award's
 * subject is the endorsed organization; it surfaces in the org's public
 * "Endorsements" profile tab (see `app/_lib/endorsements-given.ts`).
 *
 * The definition an award points at may live in *another* org's repo — the
 * platform's shared "Organization Endorsement" badge does (GainForest's five
 * existing endorsements all reference it). So awardable badges are resolved
 * the same way the profile tab resolves them: endorsement-typed definitions in
 * the org's own repo PLUS endorsement-typed definitions referenced by the
 * org's existing awards, fetched cross-repo.
 *
 * Awards are read straight from the org repo's PDS (fresher than the index,
 * and it skips the per-award profile resolution `fetchInternalBadgeData` would
 * do for the *whole* repo — GainForest signs hundreds of participation awards
 * that this tab doesn't care about). Profile cards for the endorsed orgs are
 * resolved in one batched indexer query instead.
 */

const ENDORSEMENT_BADGE_TYPE = "endorsement";
/** Existing awards reference a handful of definitions at most; cap the
 *  cross-repo lookups so a polluted repo can't fan out into dozens of fetches. */
const MAX_FOREIGN_DEFINITION_LOOKUPS = 20;

/** An endorsement-typed badge definition the admin can award. */
export type EndorsementBadgeOption = {
  uri: string;
  cid: string;
  rkey: string;
  title: string;
  iconUrl: string | null;
};

/** One endorsement already awarded, enriched with the endorsed org's card. */
export type EndorsementAwardRow = {
  rkey: string;
  badgeUri: string;
  badgeTitle: string | null;
  subjectDid: string;
  displayName: string | null;
  avatarUrl: string | null;
  note: string | null;
  createdAt: string | null;
};

export type AwardEndorsementsData = {
  /** True when the signed-in user is an owner/admin of the GainForest org. */
  allowed: boolean;
  definitions: EndorsementBadgeOption[];
  awards: EndorsementAwardRow[];
};

type ListedRecord = { uri?: unknown; value?: unknown };
type ListRecordsResponse = { records?: ListedRecord[]; cursor?: string };

/** An award parsed from the repo, before badge filtering + card enrichment. */
type RawAward = Omit<EndorsementAwardRow, "badgeTitle" | "displayName" | "avatarUrl">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The repo DID that owns an `at://did:.../collection/rkey` record. */
function didFromAtUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/(did:[^/]+)\//);
  return match ? match[1] : null;
}

function blobCid(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const ref = value.ref;
  if (typeof ref === "string") return ref;
  if (isRecord(ref) && typeof ref.$link === "string") return ref.$link;
  return null;
}

/** Award subjects come in two shapes: a bare DID and a StrongRef into the
 *  endorsed org's repo. Honor both (see the Ma Earth award data). */
function subjectDidOf(value: Record<string, unknown>): string | null {
  const subject = value.subject;
  if (!isRecord(subject)) return null;
  const bare = str(subject.did);
  if (bare?.startsWith("did:")) return bare;
  const uri = str(subject.uri);
  return uri ? didFromAtUri(uri) : null;
}

/** The definition titled "GainForest" drives the "Trusted by GainForest"
 *  emblem (title-mapped in the featured-badge index), so if it's ever typed
 *  `endorsement` it sorts first and becomes the default pick. */
function isGainForestTitle(title: string): boolean {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "") === "gainforest";
}

async function listAwardEntries(repoDid: string): Promise<ListedRecord[]> {
  const host = await resolvePdsHost(repoDid).catch(() => null);
  if (!host) return [];
  const entries: ListedRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ repo: repoDid, collection: BADGE_AWARD_COLLECTION, limit: "100" });
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

/** Fetch one badge definition from whichever repo hosts it; null unless it
 *  resolves to a valid `endorsement`-typed definition. */
async function fetchForeignEndorsementDefinition(uri: string): Promise<EndorsementBadgeOption | null> {
  const ownerDid = didFromAtUri(uri);
  const rkey = uri.split("/").pop();
  if (!ownerDid || !rkey) return null;
  const host = await resolvePdsHost(ownerDid).catch(() => null);
  if (!host) return null;
  const params = new URLSearchParams({ repo: ownerDid, collection: BADGE_DEFINITION_COLLECTION, rkey });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as { cid?: unknown; value?: unknown } | null;
  const cid = str(payload?.cid);
  const value = payload?.value;
  if (!cid || !isRecord(value)) return null;
  if (str(value.badgeType)?.toLowerCase() !== ENDORSEMENT_BADGE_TYPE) return null;
  const title = str(value.title);
  if (!title) return null;
  const iconRef = blobCid(value.icon);
  return {
    uri,
    cid,
    rkey,
    title,
    iconUrl: iconRef ? await resolveBlobUrl(ownerDid, iconRef).catch(() => null) : null,
  };
}

/** The endorsement badge definitions this org can award (own-repo + shared
 *  cross-repo ones its awards already reference) plus every award signed
 *  against one of them, newest first. */
export async function fetchEndorsementAwarding(
  repoDid: string,
): Promise<Pick<AwardEndorsementsData, "definitions" | "awards">> {
  const [data, entries] = await Promise.all([
    fetchInternalBadgeData(repoDid, { includeAwards: false }),
    listAwardEntries(repoDid),
  ]);

  const ownDefinitions: EndorsementBadgeOption[] = data.definitions
    .filter((definition) => definition.badgeType.trim().toLowerCase() === ENDORSEMENT_BADGE_TYPE)
    .map((definition) => ({
      uri: definition.uri,
      cid: definition.cid,
      rkey: definition.rkey,
      title: definition.title,
      iconUrl: definition.iconUrl,
    }));

  const rawAwards: RawAward[] = [];
  for (const entry of entries) {
    const uri = str(entry.uri);
    const value = entry.value;
    if (!uri || !isRecord(value)) continue;
    const badgeUri = isRecord(value.badge) ? str(value.badge.uri) : null;
    if (!badgeUri) continue;
    const subjectDid = subjectDidOf(value);
    if (!subjectDid) continue;
    rawAwards.push({
      rkey: uri.split("/").pop() ?? "",
      badgeUri,
      subjectDid,
      note: str(value.note),
      createdAt: str(value.createdAt),
    });
  }

  // Shared endorsement badges hosted in other repos (e.g. the platform's
  // "Organization Endorsement" definition) — discovered through the org's own
  // existing awards, exactly like the public "Endorsements" tab resolves them.
  const foreignUris = Array.from(
    new Set(
      rawAwards
        .map((award) => award.badgeUri)
        .filter((uri) => uri.includes(`/${BADGE_DEFINITION_COLLECTION}/`) && didFromAtUri(uri) !== repoDid),
    ),
  ).slice(0, MAX_FOREIGN_DEFINITION_LOOKUPS);
  const foreignDefinitions = (await Promise.all(foreignUris.map(fetchForeignEndorsementDefinition))).filter(
    (definition): definition is EndorsementBadgeOption => Boolean(definition),
  );

  const usage = new Map<string, number>();
  for (const award of rawAwards) usage.set(award.badgeUri, (usage.get(award.badgeUri) ?? 0) + 1);
  const definitions = [...ownDefinitions, ...foreignDefinitions].sort(
    (a, b) =>
      Number(isGainForestTitle(b.title)) - Number(isGainForestTitle(a.title)) ||
      (usage.get(b.uri) ?? 0) - (usage.get(a.uri) ?? 0) ||
      a.title.localeCompare(b.title),
  );
  if (definitions.length === 0) return { definitions: [], awards: [] };

  const titleByUri = new Map(definitions.map((definition) => [definition.uri, definition.title]));
  const awards: EndorsementAwardRow[] = rawAwards
    .filter((award) => titleByUri.has(award.badgeUri))
    .map((award) => ({
      ...award,
      badgeTitle: titleByUri.get(award.badgeUri) ?? null,
      displayName: null,
      avatarUrl: null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const dids = Array.from(new Set(awards.map((award) => award.subjectDid)));
  const cards = await fetchIndexedCertifiedProfileCards(dids).catch(
    () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
  );
  for (const award of awards) {
    const card = cards.get(award.subjectDid);
    award.displayName = card?.displayName?.trim() || null;
    award.avatarUrl = card?.avatarUrl ?? null;
  }

  return { definitions, awards };
}
