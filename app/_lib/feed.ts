/**
 * Activity feed — server-side assembly of a global, Bluesky-style "everything
 * happening on GainForest" timeline for the new /feed sidebar tab.
 *
 * Merges four public record streams into one newest-first stream:
 *   - projects      (org.hypercerts.collection, type "project")
 *   - observations  (app.gainforest.dwc.occurrence)
 *   - organizations (app.certified.actor.organization)
 *   - donations     (org.hypercerts.fundingReceipt — completed USD/USDC gifts)
 *
 * Certs (org.hypercerts.claim.activity) are deliberately folded into projects
 * rather than shown as their own rows — a project owns exactly one Cert and is
 * its canonical surface, matching the /certs → /projects merge elsewhere.
 *
 * Inspired by simocracy-v2's `lib/landing-feed.ts`, which merges proposals,
 * comments, decisions, actions, and sims into a single chronological feed.
 *
 * The feed is a TRUE newest-first merge across all kinds (no per-kind quota) —
 * each row is placed purely by its createdAt — and pages with a compound
 * `(createdAt, id)` cursor so "load more" walks strictly older items. Each
 * stream is queried with `createdAt <= cursor` and re-merged in memory, which
 * keeps global chronological order even when one stream is far denser than the
 * others (independent per-stream cursors would interleave out of order).
 */

import { cachedAsync } from "./async-cache";
import { indexerQuery } from "./indexer";
import { normaliseRef } from "./pds";
import { FACILITATOR_DID, accountHref, localObservationHref, localProjectHref } from "./urls";

/** The kinds of activity a feed row represents.
 *
 *  Note: Certs (org.hypercerts.claim.activity) are intentionally NOT a feed
 *  kind. A project owns exactly one Cert and the project surface carries the
 *  full Cert experience, so — exactly like /certs → /projects and the cert
 *  detail page redirecting to its project — the feed shows Certs as Projects
 *  instead of as their own rows. */
export type ActivityFeedKind =
  | "project"
  | "observation"
  | "organization"
  | "donation";

/** Normalized, serializable feed row — ready to ship to the client. */
export interface ActivityFeedItem {
  /** Stable unique id for React keys (record URI, possibly suffixed). */
  id: string;
  kind: ActivityFeedKind;
  /** ISO timestamp the row is ordered by (newest-first). */
  createdAt: string;
  /** Owner DID of the underlying record. */
  actorDid: string;
  /** Owner display name from the certified profile, when known. */
  actorName: string | null;
  /** PDS avatar blob ref for the owner; resolved client-side. */
  actorAvatarRef: string | null;
  /** Headline (project title, scientific name, cert title, org name, amount). */
  title: string | null;
  /** Body text (short description, habitat, donation summary). */
  text: string | null;
  /** In-app detail link for the row. */
  href: string;
  /** Already-resolved external image URL (projects / observations). */
  imageUrl: string | null;
  /** PDS image blob ref; resolved client-side when present. */
  imageRef: string | null;
  /** For donations: the funded project's title, when resolved. */
  targetTitle: string | null;
  /** For donations: the funded project's in-app detail href. */
  targetHref: string | null;
  /** For donations: the raw amount. */
  amount: number | null;
  /** For donations: the currency code (USD/USDC). */
  currency: string | null;
}

/** Which kinds the feed should include: a single kind, or the unified merge. */
export type ActivityFeedFilter = ActivityFeedKind | "all";

export interface ActivityFeedPage {
  items: ActivityFeedItem[];
  /** Opaque cursor for the next page; null when the feed is exhausted. */
  nextCursor: string | null;
  /** Whether a "load more" request could yield further rows. */
  hasMore: boolean;
}

/** Rows returned to the client per page. */
const PAGE_SIZE = 50;
/** Items fetched per stream per page. Must be >= PAGE_SIZE so the merged
 *  top-PAGE_SIZE is globally correct, with a little margin for boundary
 *  duplicate-timestamp rows that get filtered out by the compound cursor. A
 *  larger page means fewer round-trips when walking long same-owner runs. */
const STREAM_BATCH = PAGE_SIZE + 10;
const MAX_TEXT = 220;
const FEED_CACHE_MS = 60_000; // 60s in-process memo — fresh enough for "live".

// ── Compound (createdAt, id) cursor ──────────────────────────────────────────
// ISO timestamps alone aren't a stable key (records can share a millisecond),
// so the cursor pairs the row's timestamp with its id and pagination filters
// strictly-older rows in that total order.

type FeedCursor = { ts: string; id: string };

function encodeCursor(cursor: FeedCursor | null): string | null {
  if (!cursor) return null;
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<FeedCursor>;
    if (typeof parsed.ts === "string" && typeof parsed.id === "string") return { ts: parsed.ts, id: parsed.id };
  } catch {
    // fall through
  }
  return null;
}

function timeValue(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Newest-first total order: by time desc, then id desc as a stable tiebreak. */
function compareNewestFirst(a: ActivityFeedItem, b: ActivityFeedItem): number {
  const ta = timeValue(a.createdAt);
  const tb = timeValue(b.createdAt);
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** True when `item` sits strictly older than the cursor in the total order. */
function isStrictlyOlder(item: ActivityFeedItem, cursor: FeedCursor): boolean {
  const ti = timeValue(item.createdAt);
  const tc = timeValue(cursor.ts);
  if (ti !== tc) return ti < tc;
  return item.id < cursor.id;
}

// ── Certified profile helpers (mirrors the private helpers in indexer.ts) ────

type CertifiedProfileData = {
  displayName?: string | null;
  avatar?: { image?: { ref?: string | null } | null } | null;
} | null;

function profileName(profile?: CertifiedProfileData): string | null {
  return profile?.displayName?.trim() || null;
}

function profileAvatarRef(profile?: CertifiedProfileData): string | null {
  return normaliseRef(profile?.avatar?.image?.ref);
}

const CERTIFIED_PROFILE_DATA_FIELDS = `
  certifiedProfileData {
    displayName
    avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
  }
`;

function clampText(text: string | null | undefined, max = MAX_TEXT): string | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Parse `at://did/collection/rkey` into its did + rkey parts. */
function parseAtUri(uri: string): { did: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/[^/]+\/(.+)$/);
  if (!match) return null;
  return { did: match[1], rkey: match[2] };
}

// ── One combined query: newest STREAM_BATCH of each kind, before the cursor ──
//
// Each stream takes a typed `where` built in JS so we can fold the createdAt
// upper bound (the cursor) and a per-kind `first: 0` (to skip streams that a
// kind filter excludes) into the same static query.

const FEED_QUERY = `
  query ActivityFeed(
    $projectFirst: Int!
    $occurrenceFirst: Int!
    $orgFirst: Int!
    $receiptFirst: Int!
    $projectWhere: OrgHypercertsCollectionWhereInput
    $occurrenceWhere: AppGainforestDwcOccurrenceWhereInput
    $orgWhere: AppCertifiedActorOrganizationWhereInput
    $donationWhere: OrgHypercertsFundingReceiptWhereInput
  ) {
    projects: orgHypercertsCollection(
      first: $projectFirst
      where: $projectWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did rkey uri createdAt title shortDescription
        ${CERTIFIED_PROFILE_DATA_FIELDS}
        banner {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsLargeImage { image { ref } }
        }
        avatar {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallImage { image { ref } }
        }
      } }
    }

    occurrences: appGainforestDwcOccurrence(
      first: $occurrenceFirst
      where: $occurrenceWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did rkey uri createdAt eventDate
        scientificName vernacularName kingdom family country countryCode locality habitat
        thumbnailUrl speciesImageUrl
        ${CERTIFIED_PROFILE_DATA_FIELDS}
        imageEvidence { file { ref } }
      } }
    }

    organizations: appCertifiedActorOrganization(
      first: $orgFirst
      where: $orgWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did uri rkey createdAt organizationType
        ${CERTIFIED_PROFILE_DATA_FIELDS}
      } }
    }

    donations: orgHypercertsFundingReceipt(
      first: $receiptFirst
      where: $donationWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        uri createdAt occurredAt amount currency
        from {
          __typename
          ... on OrgHypercertsFundingReceiptText { value }
          ... on AppCertifiedDefsDid { did }
        }
        for { uri }
      } }
    }
  }
`;

// ── Raw node shapes ──────────────────────────────────────────────────────────

type RawImage =
  | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
  | { __typename: "OrgHypercertsDefsSmallImage"; image?: { ref?: string | null } | null }
  | { __typename: "OrgHypercertsDefsLargeImage"; image?: { ref?: string | null } | null }
  | null;

type RawProject = {
  did: string;
  rkey: string;
  uri?: string | null;
  createdAt: string;
  title?: string | null;
  shortDescription?: string | null;
  certifiedProfileData?: CertifiedProfileData;
  banner?: RawImage;
  avatar?: RawImage;
};

type RawOccurrence = {
  did: string;
  rkey: string;
  uri?: string | null;
  createdAt: string;
  eventDate?: string | null;
  scientificName?: string | null;
  vernacularName?: string | null;
  kingdom?: string | null;
  family?: string | null;
  country?: string | null;
  countryCode?: string | null;
  locality?: string | null;
  habitat?: string | null;
  thumbnailUrl?: string | null;
  speciesImageUrl?: string | null;
  certifiedProfileData?: CertifiedProfileData;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
};

type RawOrg = {
  did: string;
  uri?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  organizationType?: string[] | null;
  certifiedProfileData?: CertifiedProfileData;
};

type RawDonor =
  | { __typename: "OrgHypercertsFundingReceiptText"; value?: string | null }
  | { __typename: "AppCertifiedDefsDid"; did?: string | null }
  | null;

type RawReceipt = {
  uri: string;
  createdAt?: string | null;
  occurredAt?: string | null;
  amount?: string | null;
  currency?: string | null;
  from?: RawDonor;
  for?: { uri?: string | null } | null;
};

type RawFeed = {
  projects?: { edges?: Array<{ node?: RawProject | null } | null> | null } | null;
  occurrences?: { edges?: Array<{ node?: RawOccurrence | null } | null> | null } | null;
  organizations?: { edges?: Array<{ node?: RawOrg | null } | null> | null } | null;
  donations?: { edges?: Array<{ node?: RawReceipt | null } | null> | null } | null;
};

function imageMeta(image: RawImage): { url: string | null; ref: string | null } {
  if (image?.__typename === "OrgHypercertsDefsUri") return { url: image.uri?.trim() || null, ref: null };
  if (image?.__typename === "OrgHypercertsDefsSmallImage" || image?.__typename === "OrgHypercertsDefsLargeImage") {
    return { url: null, ref: normaliseRef(image.image?.ref) };
  }
  return { url: null, ref: null };
}

// ── Per-kind mappers ────────────────────────────────────────────────────────

function mapProjects(nodes: RawProject[]): ActivityFeedItem[] {
  return nodes.map((n) => {
    const banner = imageMeta(n.banner ?? null);
    const avatar = imageMeta(n.avatar ?? null);
    const didOrHandle = n.did;
    return {
      id: n.uri ?? `at://${n.did}/org.hypercerts.collection/${n.rkey}`,
      kind: "project",
      createdAt: n.createdAt,
      actorDid: n.did,
      actorName: profileName(n.certifiedProfileData),
      actorAvatarRef: profileAvatarRef(n.certifiedProfileData),
      title: (n.title ?? "Untitled project").trim() || "Untitled project",
      text: clampText(n.shortDescription),
      href: localProjectHref(didOrHandle, n.rkey),
      imageUrl: banner.url ?? avatar.url,
      imageRef: banner.ref ?? avatar.ref,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
    };
  });
}

function observationTitle(n: RawOccurrence): string | null {
  return (
    n.vernacularName?.trim() ||
    n.scientificName?.trim() ||
    null
  );
}

function observationText(n: RawOccurrence): string | null {
  const parts = [n.locality?.trim(), n.country?.trim(), n.habitat?.trim()].filter(Boolean);
  if (parts.length > 0) return clampText(parts.join(" · "));
  return clampText(n.family?.trim() ? `Family: ${n.family.trim()}` : null);
}

function mapOccurrences(nodes: RawOccurrence[]): ActivityFeedItem[] {
  return nodes.map((n) => {
    const external = n.thumbnailUrl?.trim() || n.speciesImageUrl?.trim() || null;
    const imageRef = normaliseRef(n.imageEvidence?.file?.ref);
    return {
      id: n.uri ?? `at://${n.did}/app.gainforest.dwc.occurrence/${n.rkey}`,
      kind: "observation",
      createdAt: n.createdAt,
      actorDid: n.did,
      actorName: profileName(n.certifiedProfileData),
      actorAvatarRef: profileAvatarRef(n.certifiedProfileData),
      title: observationTitle(n),
      text: observationText(n),
      href: localObservationHref(n.did, n.rkey),
      imageUrl: external,
      imageRef,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
    };
  });
}

function mapOrganizations(nodes: RawOrg[]): ActivityFeedItem[] {
  return nodes.map((n) => {
    const types = (n.organizationType ?? [])
      .map((t) => (typeof t === "string" ? t.trim() : null))
      .filter((t): t is string => Boolean(t));
    return {
      id: n.uri ?? `at://${n.did}/app.certified.actor.organization/${n.rkey ?? "self"}`,
      kind: "organization",
      createdAt: n.createdAt ?? "",
      actorDid: n.did,
      actorName: profileName(n.certifiedProfileData),
      actorAvatarRef: profileAvatarRef(n.certifiedProfileData),
      title: profileName(n.certifiedProfileData),
      text: types.length > 0 ? clampText(types.join(", ")) : null,
      href: accountHref(n.did),
      imageUrl: null,
      imageRef: null,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
    };
  });
}

function safeAmount(raw: string | null | undefined): number {
  const parsed = Number.parseFloat(raw ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A donation funds a Cert; since Certs are folded into Projects, resolve each
 *  funded Cert to its parent Project so donation rows name and link the project
 *  instead of the (hidden) Cert. The Cert and its Project live in the same repo,
 *  so we group the funded Cert URIs by owning DID and read that repo's project
 *  collections, matching on the collection's `items[]` Cert references. */
type DonationProject = { did: string; rkey: string; title: string | null };

const FEED_PROJECTS_BY_DID_QUERY = `
  query FeedProjectsByDid($did: String!) {
    orgHypercertsCollection(
      where: { did: { eq: $did }, type: { in: ["project", "Project"] } }
      first: 200
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node { rkey title items { itemIdentifier { uri } } } }
    }
  }
`;

async function resolveProjectsForCertUris(certUris: string[]): Promise<Map<string, DonationProject>> {
  const out = new Map<string, DonationProject>();
  const unique = [...new Set(certUris)].filter((u) => u.startsWith("at://"));
  if (unique.length === 0) return out;

  // Group funded Cert URIs by the DID of the repo that holds both Cert + project.
  const byDid = new Map<string, Set<string>>();
  for (const uri of unique) {
    const parsed = parseAtUri(uri);
    if (!parsed) continue;
    const set = byDid.get(parsed.did) ?? new Set<string>();
    set.add(uri);
    byDid.set(parsed.did, set);
  }

  await Promise.all(
    [...byDid.entries()].map(async ([did, certSet]) => {
      const data = await indexerQuery<{
        orgHypercertsCollection?: {
          edges?: Array<{
            node?: {
              rkey?: string | null;
              title?: string | null;
              items?: Array<{ itemIdentifier?: { uri?: string | null } | null } | null> | null;
            } | null;
          } | null> | null;
        } | null;
      }>(FEED_PROJECTS_BY_DID_QUERY, { did }).catch(() => null);
      for (const edge of data?.orgHypercertsCollection?.edges ?? []) {
        const node = edge?.node;
        if (!node?.rkey) continue;
        for (const item of node.items ?? []) {
          const certUri = item?.itemIdentifier?.uri;
          if (typeof certUri === "string" && certSet.has(certUri) && !out.has(certUri)) {
            out.set(certUri, { did, rkey: node.rkey, title: node.title?.trim() || null });
          }
        }
      }
    }),
  );
  return out;
}

/** Map donation receipts to rows WITHOUT resolving their funded project yet —
 *  the cert→project lookup is deferred until after the page is sliced, so we
 *  only resolve the donations that actually surface. Returns a side map from
 *  row id to the funded Cert URI for that later enrichment. */
function mapDonations(nodes: RawReceipt[]): { items: ActivityFeedItem[]; certUriById: Map<string, string> } {
  const certUriById = new Map<string, string>();
  const items = nodes.map((n): ActivityFeedItem => {
    const certUri = n.for?.uri ?? null;
    if (certUri) certUriById.set(n.uri, certUri);
    const donorWallet = n.from?.__typename === "OrgHypercertsFundingReceiptText" ? n.from.value ?? null : null;
    const donorDid = n.from?.__typename === "AppCertifiedDefsDid" ? n.from.did ?? null : null;
    const currency = (n.currency ?? "USD").toUpperCase();
    const amount = safeAmount(n.amount);
    return {
      id: n.uri,
      kind: "donation",
      // Order donations by record creation (matches the GraphQL sort + cursor).
      createdAt: n.createdAt ?? n.occurredAt ?? "",
      actorDid: donorDid ?? "",
      actorName: null,
      actorAvatarRef: null,
      title: null,
      text: clampText(donorWallet ? `via ${donorWallet.slice(0, 10)}…` : null),
      href: "/donations",
      imageUrl: null,
      imageRef: null,
      targetTitle: null,
      targetHref: null,
      amount,
      currency,
    };
  });
  return { items, certUriById };
}

/** Resolve funded projects for the donation rows that made it into the page and
 *  patch their link + target label in place. */
async function enrichDonations(pageItems: ActivityFeedItem[], certUriById: Map<string, string>): Promise<void> {
  const certUris = pageItems
    .filter((it) => it.kind === "donation")
    .map((it) => certUriById.get(it.id))
    .filter((u): u is string => Boolean(u));
  if (certUris.length === 0) return;
  const projectByCert = await resolveProjectsForCertUris(certUris);
  for (const it of pageItems) {
    if (it.kind !== "donation") continue;
    const certUri = certUriById.get(it.id);
    const project = certUri ? projectByCert.get(certUri) ?? null : null;
    if (!project) continue; // legacy standalone Cert — keep the donations-hub link
    const projectHref = localProjectHref(project.did, project.rkey);
    it.href = projectHref;
    it.targetHref = projectHref;
    it.targetTitle = project.title;
  }
}

// ── Public builder ───────────────────────────────────────────────────────────

async function buildFeedPageUncached(
  cursor: FeedCursor | null,
  filter: ActivityFeedFilter,
): Promise<ActivityFeedPage> {
  const before = cursor?.ts ?? null;
  const ltBound = before ? { createdAt: { lte: before } } : {};
  const wants = (k: ActivityFeedKind) => filter === "all" || filter === k;

  // `first: 0` is treated as "default page size" by the indexer (not zero), so a
  // kind filter can't be expressed by zeroing a stream's `first`. Unwanted
  // streams are fetched at the floor of 1 and then dropped from the pool below.
  const data = await indexerQuery<RawFeed>(FEED_QUERY, {
    projectFirst: wants("project") ? STREAM_BATCH : 1,
    occurrenceFirst: wants("observation") ? STREAM_BATCH : 1,
    orgFirst: wants("organization") ? STREAM_BATCH : 1,
    receiptFirst: wants("donation") ? STREAM_BATCH : 1,
    projectWhere: { type: { in: ["project", "Project"] }, ...ltBound },
    occurrenceWhere: before ? { createdAt: { lte: before } } : null,
    orgWhere: before ? { createdAt: { lte: before } } : null,
    donationWhere: { did: { eq: FACILITATOR_DID }, ...ltBound },
  });

  const projectNodes = (data?.projects?.edges ?? []).map((e) => e?.node).filter((n): n is RawProject => Boolean(n?.did));
  const occurrenceNodes = (data?.occurrences?.edges ?? []).map((e) => e?.node).filter((n): n is RawOccurrence => Boolean(n?.did));
  const orgNodes = (data?.organizations?.edges ?? []).map((e) => e?.node).filter((n): n is RawOrg => Boolean(n?.did));
  const receiptNodes = (data?.donations?.edges ?? []).map((e) => e?.node).filter((n): n is RawReceipt => Boolean(n?.uri));

  const { items: donationItems, certUriById } = mapDonations(receiptNodes);

  // Merge every wanted kind into one pool ordered purely by recency — no
  // per-kind quota — then keep only rows strictly older than the cursor. A
  // single-kind filter drops the floor-fetched rows of the other streams here.
  const pool = [
    ...mapProjects(projectNodes),
    ...mapOccurrences(occurrenceNodes),
    ...mapOrganizations(orgNodes),
    ...donationItems,
  ].filter((item) => item.createdAt && (filter === "all" || item.kind === filter));
  pool.sort(compareNewestFirst);

  const eligible = cursor ? pool.filter((it) => isStrictlyOlder(it, cursor)) : pool;
  const seen = new Set<string>();
  const ordered = eligible.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));

  const pageItems = ordered.slice(0, PAGE_SIZE);
  await enrichDonations(pageItems, certUriById);

  const last = pageItems[pageItems.length - 1];
  // A stream that returned a full batch may still have older rows we haven't
  // reached; combined with leftover eligible overflow, that's "more to load".
  const fetchedFull =
    projectNodes.length >= STREAM_BATCH ||
    occurrenceNodes.length >= STREAM_BATCH ||
    orgNodes.length >= STREAM_BATCH ||
    receiptNodes.length >= STREAM_BATCH;
  const hasMore = pageItems.length > 0 && (ordered.length > PAGE_SIZE || fetchedFull);

  return {
    items: pageItems,
    nextCursor: hasMore && last ? encodeCursor({ ts: last.createdAt, id: last.id }) : null,
    hasMore,
  };
}

/**
 * Build one page of the activity feed.
 *
 * @param rawCursor opaque cursor from a previous page (null/undefined = first).
 * @param filter    restrict to one kind, or "all" for the unified merge.
 */
export async function buildActivityFeed(
  rawCursor?: string | null,
  filter: ActivityFeedFilter = "all",
): Promise<ActivityFeedPage> {
  const cursor = decodeCursor(rawCursor);
  const key = `activity-feed:v2:${filter}:${rawCursor ?? "start"}`;
  return cachedAsync(key, FEED_CACHE_MS, () => buildFeedPageUncached(cursor, filter));
}
