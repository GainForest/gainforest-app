import { fetchIndexedCertifiedProfileCards } from "@/app/_lib/indexer";
import { resolvePdsHost } from "@/app/_lib/pds";
import { BADGE_AWARD_COLLECTION, fetchInternalBadgeData } from "@/app/internal/badges/_lib/badge-records";

/**
 * Data for the /admin "Award endorsements" tab.
 *
 * An endorsement is an `app.certified.badge.award` the GainForest org signs in
 * its own repo against a badge definition typed `endorsement`. The award's
 * subject is the endorsed organization; it lights up across the app as
 * "Trusted by GainForest" and in the org's "Endorsements given" tab.
 *
 * Awards are read straight from the org repo's PDS (fresher than the index,
 * and it skips the per-award profile resolution `fetchInternalBadgeData` would
 * do for the *whole* repo — GainForest signs hundreds of participation awards
 * that this tab doesn't care about). Profile cards for the endorsed orgs are
 * resolved in one batched indexer query instead.
 */

const ENDORSEMENT_BADGE_TYPE = "endorsement";

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
 *  emblem (title-mapped in the featured-badge index), so it sorts first and
 *  becomes the default pick in the award form. */
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

/** The endorsement badge definitions in the org repo plus every award signed
 *  against one of them, newest first. */
export async function fetchEndorsementAwarding(
  repoDid: string,
): Promise<Pick<AwardEndorsementsData, "definitions" | "awards">> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: false });
  const definitions: EndorsementBadgeOption[] = data.definitions
    .filter((definition) => definition.badgeType.trim().toLowerCase() === ENDORSEMENT_BADGE_TYPE)
    .map((definition) => ({
      uri: definition.uri,
      cid: definition.cid,
      rkey: definition.rkey,
      title: definition.title,
      iconUrl: definition.iconUrl,
    }))
    .sort((a, b) => Number(isGainForestTitle(b.title)) - Number(isGainForestTitle(a.title)));
  if (definitions.length === 0) return { definitions: [], awards: [] };

  const titleByUri = new Map(definitions.map((definition) => [definition.uri, definition.title]));
  const awards: EndorsementAwardRow[] = [];
  for (const entry of await listAwardEntries(repoDid)) {
    const uri = str(entry.uri);
    const value = entry.value;
    if (!uri || !isRecord(value)) continue;
    const badgeUri = isRecord(value.badge) ? str(value.badge.uri) : null;
    if (!badgeUri || !titleByUri.has(badgeUri)) continue;
    const subjectDid = subjectDidOf(value);
    if (!subjectDid) continue;
    awards.push({
      rkey: uri.split("/").pop() ?? "",
      badgeUri,
      badgeTitle: titleByUri.get(badgeUri) ?? null,
      subjectDid,
      displayName: null,
      avatarUrl: null,
      note: str(value.note),
      createdAt: str(value.createdAt),
    });
  }
  awards.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

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
