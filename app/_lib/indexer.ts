/**
 * Hyperindex GraphQL data layer for the explorer's three GainForest record
 * streams: Darwin Core occurrences, project sites (organizations + certified
 * locations), and Bumicerts (hypercert claim activities).
 *
 * Queries are ported from GainForest/hyperscan's `src/lib/indexer.ts` and the
 * bumicerts monorepo's indexer queries, narrowed to the GainForest-relevant
 * collections. All fetchers run in the browser — Hyperindex and plc.directory
 * both serve `access-control-allow-origin: *`, so the record grids page the
 * indexer directly and resolve blob images per-record. That keeps the page
 * shell instant and avoids Vercel's static-generation timeout (the same
 * reasoning gainforest-app's SpecimenWall documents).
 */

import { INDEXER_URL } from "./urls";
import { resolveBlobUrl, normaliseRef } from "./pds";
import { asNumber, formatNumber, formatDate, formatDateTime } from "./format";

// ── Generic GraphQL helper ────────────────────────────────────────────────

type GqlResponse<T> = { data?: T | null; errors?: Array<{ message: string }> };

async function indexerQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T | null> {
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  // Hyperindex returns HTTP 400 with valid `data` when an optional subfield
  // violates a non-null constraint on a single edge — parse regardless of
  // status and prefer partial data over discarding the whole page.
  let json: GqlResponse<T>;
  try {
    json = (await res.json()) as GqlResponse<T>;
  } catch {
    throw new Error(`indexer ${res.status}: non-JSON response`);
  }
  if (json.errors?.length && !json.data) {
    throw new Error(json.errors[0]?.message ?? "indexer graphql error");
  }
  return json.data ?? null;
}

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type Connection<N> = {
  totalCount?: number;
  pageInfo?: PageInfo | null;
  edges?: Array<{ node?: N | null } | null> | null;
};

export type Page<R> = {
  records: R[];
  cursor: string | null;
  hasMore: boolean;
};

const RESOLVE_CONCURRENCY = 8;

/** The indexer caps every connection query at 100 edges regardless of the
 *  requested `first`, so multi-hundred loads must page the cursor. */
const INDEXER_MAX_PAGE = 100;

/** Resolve a list of blob refs to URLs with bounded concurrency. */
async function resolveImages<R>(
  items: R[],
  pick: (r: R) => { did: string; ref: string | null } | null,
  set: (r: R, url: string | null) => R,
  signal?: AbortSignal,
): Promise<R[]> {
  const out = [...items];
  let cursor = 0;
  async function worker() {
    while (cursor < out.length) {
      const i = cursor++;
      const meta = pick(out[i]!);
      if (!meta?.ref) continue;
      try {
        const url = await resolveBlobUrl(meta.did, meta.ref, signal);
        out[i] = set(out[i]!, url);
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(RESOLVE_CONCURRENCY, out.length) }, worker),
  );
  return out;
}

/**
 * Walk a single-page fetcher's cursor until `target` records are gathered (or
 * the stream ends), emitting the running list after each 100-record page so a
 * 1000-record load fills the grid in waves instead of after one long wait.
 */
async function collectPaged<R>(
  fetchPage: (after: string | null, signal?: AbortSignal) => Promise<Page<R>>,
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: R[]) => void,
): Promise<Page<R>> {
  const all: R[] = [];
  let cursor = after;
  let hasMore = true;
  while (all.length < target) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const page = await fetchPage(cursor, signal);
    all.push(...page.records);
    cursor = page.cursor;
    hasMore = page.hasMore;
    onProgress?.([...all]);
    if (!hasMore || !cursor) break;
  }
  return { records: all, cursor, hasMore };
}

// ── 1. Darwin Core occurrences ────────────────────────────────────────────

export type MediaKind = "image" | "audio" | "video" | "spectrogram";

export type OccurrenceRecord = {
  kind: "occurrence";
  id: string;
  did: string;
  rkey: string;
  atUri: string;
  scientificName: string | null;
  vernacularName: string | null;
  kingdom: string | null;
  family: string | null;
  genus: string | null;
  basisOfRecord: string | null;
  recordedBy: string | null;
  individualCount: number | null;
  country: string | null;
  countryCode: string | null;
  locality: string | null;
  lat: number | null;
  lon: number | null;
  eventDate: string | null;
  createdAt: string;
  remarks: string | null;
  imageUrl: string | null;
  /** Which media kinds the record carries (drives the card badges). */
  media: MediaKind[];
};

const OCCURRENCE_NODE_FIELDS = `
  did rkey uri createdAt eventDate
  scientificName vernacularName kingdom family genus
  basisOfRecord recordedBy individualCount
  country countryCode locality decimalLatitude decimalLongitude
  occurrenceRemarks fieldNotes
  imageEvidence { file { ref } }
  audioEvidence { file { ref } }
  videoEvidence { file { ref } }
  spectrogramEvidence { file { ref } }
`;

const OCCURRENCE_QUERY = `
  query ExplorerOccurrences($first: Int!, $after: String) {
    appGainforestDwcOccurrence(first: $first, after: $after, sortBy: createdAt, sortDirection: DESC) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { ${OCCURRENCE_NODE_FIELDS} } }
    }
  }
`;

const OCCURRENCE_BY_URI_QUERY = `
  query ExplorerOccurrenceByUri($uri: String!) {
    appGainforestDwcOccurrenceByUri(uri: $uri) { ${OCCURRENCE_NODE_FIELDS} }
  }
`;

type RawOccurrence = {
  did: string;
  rkey: string;
  uri: string;
  createdAt: string;
  eventDate?: string | null;
  scientificName?: string | null;
  vernacularName?: string | null;
  kingdom?: string | null;
  family?: string | null;
  genus?: string | null;
  basisOfRecord?: string | null;
  recordedBy?: string | null;
  individualCount?: number | null;
  country?: string | null;
  countryCode?: string | null;
  locality?: string | null;
  decimalLatitude?: number | string | null;
  decimalLongitude?: number | string | null;
  occurrenceRemarks?: string | null;
  fieldNotes?: string | null;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
  audioEvidence?: { file?: { ref?: string | null } | null } | null;
  videoEvidence?: { file?: { ref?: string | null } | null } | null;
  spectrogramEvidence?: { file?: { ref?: string | null } | null } | null;
};

function mapOccurrence(n: RawOccurrence): OccurrenceRecord {
  const media: MediaKind[] = [];
  if (n.imageEvidence?.file?.ref) media.push("image");
  if (n.audioEvidence?.file?.ref) media.push("audio");
  if (n.videoEvidence?.file?.ref) media.push("video");
  if (n.spectrogramEvidence?.file?.ref) media.push("spectrogram");
  return {
    kind: "occurrence",
    id: `${n.did}-${n.rkey}`,
    did: n.did,
    rkey: n.rkey,
    atUri: n.uri || `at://${n.did}/app.gainforest.dwc.occurrence/${n.rkey}`,
    scientificName: n.scientificName?.trim() || null,
    vernacularName: n.vernacularName?.trim() || null,
    kingdom: n.kingdom?.trim() || null,
    family: n.family?.trim() || null,
    genus: n.genus?.trim() || null,
    basisOfRecord: n.basisOfRecord?.trim() || null,
    recordedBy: n.recordedBy?.trim() || null,
    individualCount: typeof n.individualCount === "number" ? n.individualCount : null,
    country: n.country?.trim() || null,
    countryCode: n.countryCode?.trim() || null,
    locality: n.locality?.trim() || null,
    lat: asNumber(n.decimalLatitude),
    lon: asNumber(n.decimalLongitude),
    eventDate: n.eventDate?.trim() || null,
    createdAt: n.createdAt,
    remarks: n.occurrenceRemarks?.trim() || n.fieldNotes?.trim() || null,
    imageUrl: null,
    media,
  };
}

export type OccurrenceFilter = "all" | "image" | "audio";

/** Pages to walk when a media filter is active before giving up. The indexer's
 *  newest pages skew heavily toward imageless bulk sensor uploads (e.g. long
 *  runs of "Ceriops tagal" with no evidence), so finding a screenful of
 *  media-bearing records means paging past them. Same reasoning as
 *  gainforest-app's SpecimenWall walk. */
const MAX_WALK_PAGES = 18;

async function fetchOccurrencePage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<{ nodes: RawOccurrence[]; cursor: string | null; hasNextPage: boolean }> {
  const data = await indexerQuery<{
    appGainforestDwcOccurrence?: Connection<RawOccurrence>;
  }>(OCCURRENCE_QUERY, { first, after }, signal);
  const conn = data?.appGainforestDwcOccurrence;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawOccurrence => Boolean(n?.did));
  return {
    nodes,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasNextPage: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

function matchesFilter(n: RawOccurrence, media: OccurrenceFilter): boolean {
  if (media === "all") return true;
  if (media === "image") return Boolean(n.imageEvidence?.file?.ref);
  // "audio" includes spectrogram-bearing records too.
  return Boolean(n.audioEvidence?.file?.ref || n.spectrogramEvidence?.file?.ref);
}

export type OccurrenceWalkResult = {
  records: OccurrenceRecord[];
  cursor: string | null;
  hasMore: boolean;
};

/**
 * Progressively walk the occurrence connection, collecting up to `target`
 * records matching the media filter and emitting them via `onProgress` as each
 * page resolves. Image refs are resolved per page so cards fill in as they are
 * found — essential because media-bearing records are sparse and clustered in
 * the newest pages, so a blocking fetch would leave the gallery blank for many
 * seconds. Mirrors gainforest-app's `walkOccurrences`. Returns the final
 * cursor + `hasMore` so "load more" continues the walk from where it stopped.
 */
export async function walkOccurrences(opts: {
  media: OccurrenceFilter;
  target: number;
  after: string | null;
  maxPages?: number;
  onProgress?: (records: OccurrenceRecord[]) => void;
  signal?: AbortSignal;
}): Promise<OccurrenceWalkResult> {
  const { media, target, signal } = opts;
  const maxPages = opts.maxPages ?? MAX_WALK_PAGES;
  const pageSize = INDEXER_MAX_PAGE;

  const collected: OccurrenceRecord[] = [];
  let cursor: string | null = opts.after;
  let hasNextPage = true;

  for (let page = 0; page < maxPages; page++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const res = await fetchOccurrencePage(pageSize, cursor, signal);
    cursor = res.cursor;
    hasNextPage = res.hasNextPage;

    const matches = res.nodes.filter((n) => matchesFilter(n, media));
    if (matches.length > 0) {
      let mapped = matches.map(mapOccurrence);
      mapped = await resolveImages(
        mapped,
        (r) => {
          const raw = matches.find((n) => n.rkey === r.rkey && n.did === r.did);
          const ref =
            raw?.imageEvidence?.file?.ref ?? raw?.spectrogramEvidence?.file?.ref ?? null;
          return ref ? { did: r.did, ref } : null;
        },
        (r, url) => ({ ...r, imageUrl: url }),
        signal,
      );
      for (const r of mapped) {
        if (collected.length >= target) break;
        collected.push(r);
      }
      opts.onProgress?.(collected.slice(0, target));
    }

    if (collected.length >= target || !hasNextPage || !cursor) break;
  }

  return {
    records: collected.slice(0, target),
    cursor,
    hasMore: hasNextPage && Boolean(cursor),
  };
}

// ── 2. Bumicerts (hypercert claim activities) ──────────────────────────────

export type BumicertRecord = {
  kind: "bumicert";
  id: string;
  did: string;
  rkey: string;
  atUri: string;
  title: string;
  shortDescription: string | null;
  startDate: string | null;
  endDate: string | null;
  contributorCount: number;
  locationCount: number;
  /** AT-URIs of the certified locations this claim references. */
  locationUris: string[];
  createdAt: string;
  imageUrl: string | null;
  imageRef: string | null;
};

const ACTIVITY_NODE_FIELDS = `
  did rkey uri createdAt title shortDescription startDate endDate
  contributors { contributorIdentity { __typename } }
  locations { uri }
  image {
    __typename
    ... on OrgHypercertsDefsUri { uri }
    ... on OrgHypercertsDefsSmallImage { image { ref } }
  }
`;

const ACTIVITY_QUERY = `
  query ExplorerActivities($first: Int!, $after: String) {
    orgHypercertsClaimActivity(first: $first, after: $after, sortBy: createdAt, sortDirection: DESC) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { ${ACTIVITY_NODE_FIELDS} } }
    }
  }
`;

const ACTIVITY_BY_URI_QUERY = `
  query ExplorerActivityByUri($uri: String!) {
    orgHypercertsClaimActivityByUri(uri: $uri) { ${ACTIVITY_NODE_FIELDS} }
  }
`;

type RawActivityImage =
  | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
  | { __typename: "OrgHypercertsDefsSmallImage"; image?: { ref?: string | null } | null }
  | null;

type RawActivity = {
  did: string;
  rkey: string;
  uri: string;
  createdAt: string;
  title?: string | null;
  shortDescription?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  contributors?: Array<unknown> | null;
  locations?: Array<{ uri?: string | null }> | null;
  image?: RawActivityImage;
};

function mapActivity(n: RawActivity): BumicertRecord {
  let imageUrl: string | null = null;
  let imageRef: string | null = null;
  if (n.image?.__typename === "OrgHypercertsDefsUri") {
    imageUrl = n.image.uri ?? null;
  } else if (n.image?.__typename === "OrgHypercertsDefsSmallImage") {
    imageRef = normaliseRef(n.image.image?.ref);
  }
  return {
    kind: "bumicert",
    id: `${n.did}-${n.rkey}`,
    did: n.did,
    rkey: n.rkey,
    atUri: n.uri || `at://${n.did}/org.hypercerts.claim.activity/${n.rkey}`,
    title: (n.title ?? "Untitled bumicert").trim() || "Untitled bumicert",
    shortDescription: n.shortDescription?.trim() || null,
    startDate: n.startDate?.trim() || null,
    endDate: n.endDate?.trim() || null,
    contributorCount: Array.isArray(n.contributors) ? n.contributors.length : 0,
    locationCount: Array.isArray(n.locations) ? n.locations.length : 0,
    locationUris: Array.isArray(n.locations)
      ? n.locations
          .map((l) => l?.uri)
          .filter((u): u is string => typeof u === "string" && u.length > 0)
      : [],
    createdAt: n.createdAt,
    imageUrl,
    imageRef,
  };
}

async function fetchActivityPage(
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<BumicertRecord>> {
  const data = await indexerQuery<{
    orgHypercertsClaimActivity?: Connection<RawActivity>;
  }>(ACTIVITY_QUERY, { first: INDEXER_MAX_PAGE, after }, signal);
  const conn = data?.orgHypercertsClaimActivity;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawActivity => Boolean(n?.did));
  let records = nodes.map(mapActivity);
  records = await resolveImages(
    records,
    (r) => (r.imageRef && !r.imageUrl ? { did: r.did, ref: r.imageRef } : null),
    (r, url) => ({ ...r, imageUrl: url ?? r.imageUrl }),
    signal,
  );
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

/** Load up to `target` Bumicerts, paging the indexer's 100-record cap. */
export async function fetchBumicerts(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: BumicertRecord[]) => void,
): Promise<Page<BumicertRecord>> {
  return collectPaged(fetchActivityPage, target, after, signal, onProgress);
}

// ── 3. Project sites (organizations) ───────────────────────────────────────

/** Which lexicon a project-site row came from. */
export type SiteSource = "gainforest" | "certified";
/** Toolbar filter selection (a single source or both merged). */
export type SiteSourceFilter = SiteSource | "both";

export type SiteRecord = {
  kind: "site";
  /** Lexicon this row was read from. */
  source: SiteSource;
  id: string;
  did: string;
  atUri: string;
  name: string;
  country: string | null;
  /** Certified-org category (e.g. "nonprofit"); null for GainForest orgs. */
  orgType: string | null;
  /** AT-URI of the org's `app.certified.location` record (certified orgs only),
   *  resolved to map coordinates on demand. */
  locationUri: string | null;
  createdAt: string | null;
  imageUrl: string | null;
  coverRef: string | null;
  logoRef: string | null;
};

const ORG_NODE_FIELDS = `
  did uri displayName country createdAt
  coverImage { image { ref } }
  logo { image { ref } }
`;

const ORG_QUERY = `
  query ExplorerOrganizations($first: Int!, $after: String) {
    appGainforestOrganizationInfo(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { ${ORG_NODE_FIELDS} } }
    }
  }
`;

const ORG_BY_URI_QUERY = `
  query ExplorerOrgByUri($uri: String!) {
    appGainforestOrganizationInfoByUri(uri: $uri) { ${ORG_NODE_FIELDS} }
  }
`;

type RawOrg = {
  did: string;
  uri?: string | null;
  displayName?: string | null;
  country?: string | null;
  createdAt?: string | null;
  coverImage?: { image?: { ref?: string | null } | null } | null;
  logo?: { image?: { ref?: string | null } | null } | null;
};

function mapOrg(n: RawOrg): SiteRecord {
  const atUri = n.uri || `at://${n.did}/app.gainforest.organization.info/self`;
  return {
    kind: "site",
    source: "gainforest",
    id: atUri,
    did: n.did,
    atUri,
    name: n.displayName?.trim() || "Unnamed organization",
    country: n.country?.trim() || null,
    orgType: null,
    locationUri: null,
    createdAt: n.createdAt ?? null,
    imageUrl: null,
    coverRef: normaliseRef(n.coverImage?.image?.ref),
    logoRef: normaliseRef(n.logo?.image?.ref),
  };
}

async function fetchOrgPage(
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<SiteRecord>> {
  const data = await indexerQuery<{
    appGainforestOrganizationInfo?: Connection<RawOrg>;
  }>(ORG_QUERY, { first: INDEXER_MAX_PAGE, after }, signal);
  const conn = data?.appGainforestOrganizationInfo;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawOrg => Boolean(n?.did));
  let records = nodes.map(mapOrg);
  records = await resolveImages(
    records,
    (r) => {
      const ref = r.coverRef ?? r.logoRef;
      return ref ? { did: r.did, ref } : null;
    },
    (r, url) => ({ ...r, imageUrl: url }),
    signal,
  );
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

// ── Certified actor organizations (app.certified.actor.organization) ────────
//
// This lexicon's record carries no display name or image — those live in the
// actor's profile (app.certified.actor.profile/self). So we list the org
// records, then batch-resolve their profiles by URI (one aliased query per
// page) to get a name + avatar, and resolve the avatar blob to a URL.

const CERT_ORG_NODE_FIELDS = `
  did uri rkey createdAt visibility organizationType
  location { uri }
`;

const CERT_ORG_QUERY = `
  query ExplorerCertifiedOrgs($first: Int!, $after: String) {
    appCertifiedActorOrganization(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { ${CERT_ORG_NODE_FIELDS} } }
    }
  }
`;

const CERT_ORG_BY_URI_QUERY = `
  query ExplorerCertifiedOrgByUri($uri: String!) {
    appCertifiedActorOrganizationByUri(uri: $uri) { ${CERT_ORG_NODE_FIELDS} }
  }
`;

type RawCertOrg = {
  did: string;
  uri?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  visibility?: string | null;
  organizationType?: string[] | null;
  location?: { uri?: string | null } | null;
};

type CertProfileInfo = { name: string | null; avatarRef: string | null };

/** Profile selection shared by the list join + the drawer detail. */
const CERT_PROFILE_SELECTION = `{
  displayName
  avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
}`;

type CertProfileNode = {
  displayName?: string | null;
  avatar?: { image?: { ref?: string | null } | null } | null;
} | null;

/** Resolve many certified profiles in one aliased query (DIDs are quote-safe). */
async function fetchCertProfiles(
  dids: string[],
  signal?: AbortSignal,
): Promise<Map<string, CertProfileInfo>> {
  const map = new Map<string, CertProfileInfo>();
  if (dids.length === 0) return map;
  const parts = dids.map(
    (did, i) =>
      `p${i}: appCertifiedActorProfileByUri(uri: "at://${did}/app.certified.actor.profile/self") ${CERT_PROFILE_SELECTION}`,
  );
  const query = `query CertProfiles {\n${parts.join("\n")}\n}`;
  try {
    const data = await indexerQuery<Record<string, CertProfileNode>>(query, {}, signal);
    if (data) {
      dids.forEach((did, i) => {
        const n = data[`p${i}`];
        if (n) map.set(did, { name: sv(n.displayName), avatarRef: normaliseRef(n.avatar?.image?.ref) });
      });
    }
  } catch {
    /* names/avatars are best-effort; fall back to the DID */
  }
  return map;
}

function mapCertOrg(n: RawCertOrg, profile: CertProfileInfo | undefined): SiteRecord {
  const atUri = n.uri || `at://${n.did}/app.certified.actor.organization/${n.rkey || "self"}`;
  return {
    kind: "site",
    source: "certified",
    id: atUri,
    did: n.did,
    atUri,
    name: profile?.name || "Certified organization",
    country: null,
    orgType: (n.organizationType ?? []).map((t) => sv(t)).filter(Boolean).join(", ") || null,
    locationUri: sv(n.location?.uri),
    createdAt: n.createdAt ?? null,
    imageUrl: null,
    coverRef: profile?.avatarRef ?? null,
    logoRef: null,
  };
}

async function fetchCertOrgPage(
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<SiteRecord>> {
  const data = await indexerQuery<{
    appCertifiedActorOrganization?: Connection<RawCertOrg>;
  }>(CERT_ORG_QUERY, { first: INDEXER_MAX_PAGE, after }, signal);
  const conn = data?.appCertifiedActorOrganization;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawCertOrg => Boolean(n?.did));
  const profiles = await fetchCertProfiles(
    nodes.map((n) => n.did),
    signal,
  );
  let records = nodes.map((n) => mapCertOrg(n, profiles.get(n.did)));
  records = await resolveImages(
    records,
    (r) => (r.coverRef ? { did: r.did, ref: r.coverRef } : null),
    (r, url) => ({ ...r, imageUrl: url }),
    signal,
  );
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

function siteTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Load up to `target` project sites, paging the indexer's 100-record cap.
 * `source` picks the GainForest org lexicon, the certified actor lexicon, or
 * both merged (newest first). Cursors only apply to single-source loads — the
 * merged view fetches each stream to `target` in one pass.
 */
export async function fetchSites(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: SiteRecord[]) => void,
  source: SiteSourceFilter = "both",
): Promise<Page<SiteRecord>> {
  if (source === "gainforest") return collectPaged(fetchOrgPage, target, after, signal, onProgress);
  if (source === "certified") return collectPaged(fetchCertOrgPage, target, after, signal, onProgress);

  // Both: fetch each stream fully, streaming a merged running list as they
  // arrive, then return the combined set sorted newest-first.
  let gf: SiteRecord[] = [];
  const gfPage = await collectPaged(fetchOrgPage, target, null, signal, (running) => {
    gf = running;
    onProgress?.([...running]);
  });
  gf = gfPage.records;
  const certPage = await collectPaged(fetchCertOrgPage, target, null, signal, (running) => {
    onProgress?.([...gf, ...running]);
  });
  const records = [...gf, ...certPage.records].sort(
    (a, b) => siteTime(b.createdAt) - siteTime(a.createdAt),
  );
  onProgress?.(records);
  return { records, cursor: null, hasMore: false };
}

// ── Unified record type for the detail drawer ──────────────────────────────

export type ExplorerRecord = OccurrenceRecord | BumicertRecord | SiteRecord;
export type RecordKind = ExplorerRecord["kind"];

// ── Single record by AT-URI (shareable deep links) ─────────────────────────
//
// A shared `?record=` link may point at a record outside the freshly loaded
// page (or before the page has loaded at all), so resolve it directly from the
// indexer's `*ByUri` field and reuse the same mappers + per-record image
// resolution as the list fetchers. The collection in the URI selects the query.

export async function fetchRecordByUri(
  atUri: string,
  signal?: AbortSignal,
): Promise<ExplorerRecord | null> {
  const m = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const collection = m[2];

  if (collection === "app.gainforest.dwc.occurrence") {
    const data = await indexerQuery<{ appGainforestDwcOccurrenceByUri?: RawOccurrence | null }>(
      OCCURRENCE_BY_URI_QUERY,
      { uri: atUri },
      signal,
    );
    const n = data?.appGainforestDwcOccurrenceByUri;
    if (!n?.did) return null;
    const rec = mapOccurrence(n);
    const ref = n.imageEvidence?.file?.ref ?? n.spectrogramEvidence?.file?.ref ?? null;
    if (ref) {
      try {
        rec.imageUrl = await resolveBlobUrl(rec.did, ref, signal);
      } catch {
        /* keep placeholder */
      }
    }
    return rec;
  }

  if (collection === "org.hypercerts.claim.activity") {
    const data = await indexerQuery<{ orgHypercertsClaimActivityByUri?: RawActivity | null }>(
      ACTIVITY_BY_URI_QUERY,
      { uri: atUri },
      signal,
    );
    const n = data?.orgHypercertsClaimActivityByUri;
    if (!n?.did) return null;
    const rec = mapActivity(n);
    if (rec.imageRef && !rec.imageUrl) {
      try {
        rec.imageUrl = await resolveBlobUrl(rec.did, rec.imageRef, signal);
      } catch {
        /* keep placeholder */
      }
    }
    return rec;
  }

  if (collection === "app.certified.actor.organization") {
    const data = await indexerQuery<{ appCertifiedActorOrganizationByUri?: RawCertOrg | null }>(
      CERT_ORG_BY_URI_QUERY,
      { uri: atUri },
      signal,
    );
    const n = data?.appCertifiedActorOrganizationByUri;
    if (!n?.did) return null;
    const profiles = await fetchCertProfiles([n.did], signal);
    const rec = mapCertOrg(n, profiles.get(n.did));
    if (rec.coverRef) {
      try {
        rec.imageUrl = await resolveBlobUrl(rec.did, rec.coverRef, signal);
      } catch {
        /* keep placeholder */
      }
    }
    return rec;
  }

  if (collection === "app.gainforest.organization.info") {
    const data = await indexerQuery<{ appGainforestOrganizationInfoByUri?: RawOrg | null }>(
      ORG_BY_URI_QUERY,
      { uri: atUri },
      signal,
    );
    const n = data?.appGainforestOrganizationInfoByUri;
    if (!n?.did) return null;
    const rec = mapOrg(n);
    const ref = rec.coverRef ?? rec.logoRef;
    if (ref) {
      try {
        rec.imageUrl = await resolveBlobUrl(rec.did, ref, signal);
      } catch {
        /* keep placeholder */
      }
    }
    return rec;
  }

  return null;
}

// ── Rich record detail (drawer) ────────────────────────────────────────────
//
// The list queries stay lean (1000 records load fast). When the visitor opens
// a record we fetch its FULL field set by AT-URI and shape it into elegant,
// grouped sections + status badges. Darwin Core occurrences carry deep
// taxonomy/ecology/provenance; bumicerts carry work scope/period + a long
// description; org records carry a profile. Everything is best-effort: null
// fields are dropped so a sparse record stays clean.

export type DetailField = { label: string; value: string; wide?: boolean };
export type DetailSection = { title: string | null; fields: DetailField[] };
export type DetailBadge = { label: string; tone: "ok" | "warn" | "down" | "info" };
export type DetailLink = { label: string; href: string };
/** A social/website link, rendered as a minimalist icon button in the drawer. */
export type SocialLink = { href: string; platform: string };

// ── Rich document model (Leaflet linear documents) ─────────────────────────
// Bumicert descriptions are authored as `pub.leaflet.pages.linearDocument`s:
// headers, styled paragraphs, quotes, lists, code, images, embeds. We decode
// them into this structural model so the drawer can render real rich text +
// media instead of a flattened string.

/** A run of text with inline styling resolved from richtext facets. */
export type RichSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
};
export type RichBlock =
  | { type: "heading"; level: number; spans: RichSpan[] }
  | { type: "paragraph"; spans: RichSpan[] }
  | { type: "blockquote"; spans: RichSpan[] }
  | { type: "code"; text: string; language?: string | null }
  | { type: "list"; ordered: boolean; items: RichSpan[][] }
  | { type: "image"; url: string | null; ref?: string | null; alt?: string | null; aspectRatio?: { width: number; height: number } | null }
  | { type: "iframe"; url: string; aspectRatio?: { width: number; height: number } | null; height?: number | null }
  | { type: "website"; src: string; title?: string | null; description?: string | null; image?: string | null; ref?: string | null }
  | { type: "hr" }
  | { type: "button"; text: string; url: string };

export type RecordDetail = {
  /** Long-form text shown under the header (full description / field notes). */
  blurb?: string | null;
  /** Decoded rich document (preferred over `blurb` when present). */
  richBody?: RichBlock[] | null;
  /** Small status pills under the title (IUCN status, work scope, …). */
  badges: DetailBadge[];
  /** Grouped key/value sections. */
  sections: DetailSection[];
  /** Extra outbound links (GBIF, website, socials). */
  links: DetailLink[];
  /** Social / website links rendered as an icon row. */
  socials?: SocialLink[];
};

const sv = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const section = (title: string | null, fields: Array<DetailField | null>): DetailSection => ({
  title,
  fields: fields.filter((f): f is DetailField => Boolean(f)),
});
const field = (label: string, value: string | null | undefined, wide = false): DetailField | null =>
  value ? { label, value, wide } : null;

function iucnTone(category: string): DetailBadge["tone"] {
  const c = category.toUpperCase();
  if (/^(EX|EW|CR|EN)\b/.test(c) || /CRITIC|ENDANGER|EXTINCT/.test(c)) return "down";
  if (/^(VU|NT)\b/.test(c) || /VULNERAB|NEAR/.test(c)) return "warn";
  if (/^LC\b/.test(c) || /LEAST/.test(c)) return "ok";
  return "info";
}

// ── Occurrence detail ──────────────────────────────────────────────────────

type OccDetailNode = {
  [k: string]: unknown;
  conservationStatus?: {
    iucnCategory?: string | null;
    nativeStatus?: string | null;
    citesAppendix?: string | null;
    iucnAssessmentDate?: string | null;
    nationalStatus?: string | null;
  } | null;
};

const OCCURRENCE_DETAIL_FIELDS = `
  did createdAt scientificName scientificNameAuthorship vernacularName taxonRank taxonomicStatus
  kingdom phylum class order family genus specificEpithet infraspecificEpithet higherClassification gbifTaxonKey
  basisOfRecord occurrenceStatus individualCount organismQuantity organismQuantityType lifeStage sex reproductiveCondition behavior
  country countryCode stateProvince county municipality locality verbatimLocality
  decimalLatitude decimalLongitude coordinateUncertaintyInMeters geodeticDatum minimumElevationInMeters maximumElevationInMeters habitat
  eventDate eventTime recordedBy identifiedBy dateIdentified identificationRemarks
  datasetName institutionCode collectionCode samplingProtocol license rightsHolder references occurrenceID
  occurrenceRemarks fieldNotes
  conservationStatus { iucnCategory nativeStatus citesAppendix iucnAssessmentDate nationalStatus }
`;
const OCCURRENCE_DETAIL_QUERY = `
  query OccurrenceDetail($uri: String!) {
    appGainforestDwcOccurrenceByUri(uri: $uri) { ${OCCURRENCE_DETAIL_FIELDS} }
  }
`;

function buildOccurrenceDetail(n: OccDetailNode): RecordDetail {
  const f = (k: string) => sv(n[k]);
  const num = (k: string) => (typeof n[k] === "number" ? (n[k] as number) : null);

  const lineage = ["kingdom", "phylum", "class", "order", "family", "genus"]
    .map((k) => f(k))
    .filter(Boolean)
    .join(" › ");
  const sciName = [f("scientificName"), f("scientificNameAuthorship")].filter(Boolean).join(" ");

  const badges: DetailBadge[] = [];
  const cs = n.conservationStatus;
  if (cs?.iucnCategory) badges.push({ label: `IUCN ${cs.iucnCategory}`, tone: iucnTone(cs.iucnCategory) });
  if (cs?.nativeStatus) badges.push({ label: cap(cs.nativeStatus), tone: "info" });
  if (cs?.citesAppendix) badges.push({ label: `CITES ${cs.citesAppendix}`, tone: "warn" });
  const status = f("occurrenceStatus");
  if (status) badges.push({ label: cap(status), tone: "info" });

  const individuals =
    num("individualCount") != null
      ? formatNumber(num("individualCount"))
      : [f("organismQuantity"), f("organismQuantityType")].filter(Boolean).join(" ") || null;

  const coords = (() => {
    const la = asNumber(f("decimalLatitude"));
    const lo = asNumber(f("decimalLongitude"));
    if (la == null || lo == null) return null;
    const unc = num("coordinateUncertaintyInMeters");
    return `${la.toFixed(4)}, ${lo.toFixed(4)}${unc ? ` ±${formatNumber(unc)} m` : ""}`;
  })();
  const elevation = (() => {
    const lo = num("minimumElevationInMeters");
    const hi = num("maximumElevationInMeters");
    if (lo == null && hi == null) return null;
    if (lo != null && hi != null && lo !== hi) return `${formatNumber(lo)}–${formatNumber(hi)} m`;
    return `${formatNumber(hi ?? lo)} m`;
  })();
  const eventWhen = [f("eventDate"), f("eventTime")].filter(Boolean).join(" ");

  const sections = [
    section("Taxonomy", [
      field("Scientific name", sciName || null, true),
      field("Common name", f("vernacularName")),
      field("Rank", f("taxonRank") ? cap(f("taxonRank")!) : null),
      field("Lineage", lineage || null, true),
    ]),
    section("Occurrence", [
      field("Basis of record", f("basisOfRecord")),
      field("Individuals", individuals),
      field("Life stage", f("lifeStage") ? cap(f("lifeStage")!) : null),
      field("Sex", f("sex") ? cap(f("sex")!) : null),
      field("Reproductive", f("reproductiveCondition")),
      field("Behavior", f("behavior")),
    ]),
    section("Location", [
      field("Locality", f("locality") ?? f("verbatimLocality"), true),
      field("Municipality", f("municipality")),
      field("County", f("county")),
      field("State / province", f("stateProvince")),
      field("Country", [countryFlagSafe(f("countryCode")), f("country")].filter(Boolean).join(" ") || null),
      field("Coordinates", coords, true),
      field("Elevation", elevation),
      field("Habitat", f("habitat"), true),
    ]),
    section("Record", [
      field("Recorded by", f("recordedBy")),
      field("Observed", eventWhen || null),
      field("Identified by", f("identifiedBy")),
      field("Date identified", f("dateIdentified")),
      field("Created", f("createdAt") ? formatDateTime(f("createdAt")!) : null, true),
    ]),
    section("Provenance", [
      field("Dataset", f("datasetName")),
      field("Institution", f("institutionCode")),
      field("Collection", f("collectionCode")),
      field("Sampling protocol", f("samplingProtocol")),
      field("License", f("license")),
      field("Rights holder", f("rightsHolder")),
      field("Occurrence ID", f("occurrenceID"), true),
    ]),
  ].filter((s) => s.fields.length > 0);

  const links: DetailLink[] = [];
  const gbif = f("gbifTaxonKey");
  if (gbif) links.push({ label: "View taxon on GBIF", href: `https://www.gbif.org/species/${gbif}` });
  const ref = f("references");
  if (ref && /^https?:\/\//.test(ref)) links.push({ label: "Reference", href: ref });

  return {
    blurb: f("occurrenceRemarks") ?? f("fieldNotes") ?? f("identificationRemarks"),
    badges,
    sections,
    links,
  };
}

// `countryFlag` lives in format.ts but importing it here would be circular for
// some bundlers; inline a tiny safe version for the detail builder only.
function countryFlagSafe(code: string | null): string {
  if (!code || code.length !== 2 || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ── Bumicert detail ────────────────────────────────────────────────────────

// A bumicert's description can be a plain string OR a Leaflet rich document
// (`pub.leaflet.pages.linearDocument`); its work scope can be a string OR a CEL
// expression (`org.hypercerts.workscope.cel`). We handle every shape so the
// rich body + scope tags always surface instead of silently dropping.
type RawFacet = {
  index?: { byteStart?: number | null; byteEnd?: number | null } | null;
  features?: Array<{ __typename?: string; uri?: string | null; href?: string | null }> | null;
};
type RawLeafletContent = {
  __typename?: string;
  plaintext?: string | null;
  facets?: RawFacet[] | null;
};
type RawLeafletBlock = RawLeafletContent & {
  level?: number | null;
  language?: string | null;
  alt?: string | null;
  url?: string | null;
  text?: string | null;
  src?: string | null;
  title?: string | null;
  description?: string | null;
  height?: number | null;
  empty?: boolean | null;
  image?: { ref?: string | null } | null;
  previewImage?: { ref?: string | null } | null;
  aspectRatio?: { width?: number | null; height?: number | null } | null;
  children?: Array<{ content?: RawLeafletContent | null } | null> | null;
};
type LeafletBlock = { block?: RawLeafletBlock | null };
type BumiDetailNode = {
  [k: string]: unknown;
  description?:
    | { __typename?: string; value?: string | null; blocks?: LeafletBlock[] | null }
    | null;
  workScope?: { __typename?: string; scope?: string | null; expression?: string | null } | null;
  contributors?: unknown[] | null;
  locations?: unknown[] | null;
};

// The owning organization (certified.app actor record) holds the website +
// social URLs and a long bio — the activity record itself carries neither.
type CertifiedOrgNode = {
  organizationType?: string[] | null;
  urls?: Array<{ url?: string | null }> | null;
  longDescription?: { __typename?: string; value?: string | null } | null;
} | null;

// Shared GraphQL pieces for decoding `pub.leaflet.pages.linearDocument`s. The
// same fragment + block selection is reused by bumicert descriptions and org
// `longDescription`s so rich text + media render identically everywhere.
const FACETS_FRAGMENT = `
  fragment Facets on PubLeafletRichtextFacet {
    index { byteStart byteEnd }
    features {
      __typename
      ... on PubLeafletRichtextFacetLink { uri }
      ... on PubLeafletRichtextFacetAtMention { href }
    }
  }
`;
const LEAFLET_BLOCKS_SELECTION = `
  blocks {
    block {
      __typename
      ... on PubLeafletBlocksHeader { level plaintext facets { ...Facets } }
      ... on PubLeafletBlocksText { plaintext facets { ...Facets } }
      ... on PubLeafletBlocksBlockquote { plaintext facets { ...Facets } }
      ... on PubLeafletBlocksCode { plaintext language }
      ... on PubLeafletBlocksImage { alt image { ref } aspectRatio { width height } }
      ... on PubLeafletBlocksIframe { url height aspectRatio { width height } }
      ... on PubLeafletBlocksWebsite { src title description previewImage { ref } }
      ... on PubLeafletBlocksButton { text url }
      ... on PubLeafletBlocksHorizontalRule { empty }
      ... on PubLeafletBlocksUnorderedList {
        children { content {
          __typename
          ... on PubLeafletBlocksText { plaintext facets { ...Facets } }
          ... on PubLeafletBlocksHeader { plaintext }
        } }
      }
      ... on PubLeafletBlocksOrderedList {
        children { content {
          __typename
          ... on PubLeafletBlocksText { plaintext facets { ...Facets } }
        } }
      }
    }
  }
`;

const ACTIVITY_DETAIL_QUERY = `
  ${FACETS_FRAGMENT}
  query ActivityDetail($uri: String!) {
    orgHypercertsClaimActivityByUri(uri: $uri) {
      did title shortDescription startDate endDate createdAt
      description {
        __typename
        ... on OrgHypercertsDefsDescriptionString { value }
        ... on PubLeafletPagesLinearDocument { ${LEAFLET_BLOCKS_SELECTION} }
      }
      workScope {
        __typename
        ... on OrgHypercertsClaimActivityWorkScopeString { scope }
        ... on OrgHypercertsWorkscopeCel { expression }
      }
      contributors { __typename }
      locations { uri }
    }
  }
`;

// Owner-org socials: certified.app actor (urls[]) + GainForest org info
// (website/email/socialLinks). An occurrence/bumicert owner may publish via
// either lexicon, so we read both and merge.
const OWNER_SOCIALS_QUERY = `
  query OwnerSocials($cert: String!, $gf: String!) {
    cert: appCertifiedActorOrganizationByUri(uri: $cert) {
      urls { url }
      longDescription { __typename ... on OrgHypercertsDefsDescriptionString { value } }
    }
    gf: appGainforestOrganizationInfoByUri(uri: $gf) {
      website email
      shortDescription { text }
      socialLinks { platform url }
    }
  }
`;

type OwnerOrg = {
  cert?: CertifiedOrgNode;
  gf?: {
    website?: string | null;
    email?: string | null;
    shortDescription?: { text?: string | null } | null;
    socialLinks?: Array<{ platform?: string | null; url?: string | null }> | null;
  } | null;
};

// Decode richtext facets (UTF-8 byte offsets, Bluesky-style) into styled spans.
// Boundary-split the text at every facet edge, then stamp each segment with
// the features of every facet that fully covers it (so bold+italic compose).
function spansFromText(text: string, facets: RawFacet[] | null | undefined): RichSpan[] {
  if (!text) return [];
  if (!facets || facets.length === 0) return [{ text }];
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const bytes = enc.encode(text);
  const norm = facets
    .map((f) => ({
      start: Math.max(0, f.index?.byteStart ?? 0),
      end: Math.min(bytes.length, f.index?.byteEnd ?? 0),
      features: f.features ?? [],
    }))
    .filter((f) => f.end > f.start);
  if (norm.length === 0) return [{ text }];
  const bounds = new Set<number>([0, bytes.length]);
  for (const f of norm) {
    bounds.add(f.start);
    bounds.add(f.end);
  }
  const sorted = [...bounds].sort((a, b) => a - b);
  const spans: RichSpan[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const segText = dec.decode(bytes.slice(a, b));
    if (!segText) continue;
    const span: RichSpan = { text: segText };
    for (const f of norm) {
      if (f.start <= a && f.end >= b) {
        for (const ft of f.features) {
          switch (ft.__typename) {
            case "PubLeafletRichtextFacetBold":
              span.bold = true;
              break;
            case "PubLeafletRichtextFacetItalic":
              span.italic = true;
              break;
            case "PubLeafletRichtextFacetUnderline":
              span.underline = true;
              break;
            case "PubLeafletRichtextFacetStrikethrough":
              span.strike = true;
              break;
            case "PubLeafletRichtextFacetCode":
              span.code = true;
              break;
            case "PubLeafletRichtextFacetLink":
              if (ft.uri) span.href = ft.uri;
              break;
            case "PubLeafletRichtextFacetAtMention":
              if (ft.href) span.href = ft.href;
              break;
          }
        }
      }
    }
    spans.push(span);
  }
  return spans;
}

/** Decode a Leaflet linear document's blocks into the rich block model. Image
 *  refs are carried through unresolved (`ref`) and turned into URLs later. */
function leafletToRich(blocks: LeafletBlock[]): RichBlock[] {
  const out: RichBlock[] = [];
  const ar = (a?: { width?: number | null; height?: number | null } | null) =>
    a && a.width && a.height ? { width: a.width, height: a.height } : null;
  for (const b of blocks) {
    const blk = b?.block;
    if (!blk) continue;
    switch (blk.__typename) {
      case "PubLeafletBlocksHeader":
        out.push({ type: "heading", level: blk.level ?? 2, spans: spansFromText(blk.plaintext ?? "", blk.facets) });
        break;
      case "PubLeafletBlocksText": {
        const spans = spansFromText(blk.plaintext ?? "", blk.facets);
        if (spans.length) out.push({ type: "paragraph", spans });
        break;
      }
      case "PubLeafletBlocksBlockquote":
        out.push({ type: "blockquote", spans: spansFromText(blk.plaintext ?? "", blk.facets) });
        break;
      case "PubLeafletBlocksCode":
        out.push({ type: "code", text: blk.plaintext ?? "", language: sv(blk.language) });
        break;
      case "PubLeafletBlocksImage": {
        const ref = normaliseRef(blk.image?.ref);
        if (ref) out.push({ type: "image", url: null, ref, alt: sv(blk.alt), aspectRatio: ar(blk.aspectRatio) });
        break;
      }
      case "PubLeafletBlocksIframe": {
        const url = sv(blk.url);
        if (url) out.push({ type: "iframe", url, aspectRatio: ar(blk.aspectRatio), height: blk.height ?? null });
        break;
      }
      case "PubLeafletBlocksWebsite": {
        const src = sv(blk.src);
        if (src)
          out.push({
            type: "website",
            src,
            title: sv(blk.title),
            description: sv(blk.description),
            image: null,
            ref: normaliseRef(blk.previewImage?.ref),
          });
        break;
      }
      case "PubLeafletBlocksButton": {
        const url = sv(blk.url);
        if (url) out.push({ type: "button", text: sv(blk.text) ?? url, url });
        break;
      }
      case "PubLeafletBlocksHorizontalRule":
        out.push({ type: "hr" });
        break;
      case "PubLeafletBlocksUnorderedList":
      case "PubLeafletBlocksOrderedList": {
        const items = (blk.children ?? [])
          .map((c) => spansFromText(c?.content?.plaintext ?? "", c?.content?.facets))
          .filter((s) => s.length > 0);
        if (items.length)
          out.push({ type: "list", ordered: blk.__typename === "PubLeafletBlocksOrderedList", items });
        break;
      }
    }
  }
  return out;
}

/** Plain-text fallback for `blurb` (search/SEO/no-JS), derived from spans. */
function richToPlain(blocks: RichBlock[]): string | null {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph" || b.type === "blockquote")
      parts.push(b.spans.map((s) => s.text).join(""));
    else if (b.type === "code") parts.push(b.text);
    else if (b.type === "list")
      parts.push(b.items.map((it) => `• ${it.map((s) => s.text).join("")}`).join("\n"));
  }
  const joined = parts.filter(Boolean).join("\n\n").trim();
  return joined || null;
}

/** Classify a URL into a social-icon platform key (mirrors SocialIcon.tsx). */
function socialPlatform(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "link";
  }
  if (host.includes("facebook.") || host === "fb.com") return "facebook";
  if (host.includes("instagram.")) return "instagram";
  if (host.includes("youtube.") || host === "youtu.be") return "youtube";
  if (host.includes("linkedin.")) return "linkedin";
  if (host === "x.com" || host.includes("twitter.")) return "x";
  if (host === "t.me" || host.includes("telegram.")) return "telegram";
  if (host.includes("tiktok.")) return "tiktok";
  if (host.includes("github.")) return "github";
  if (host.includes("bsky.") || host.includes("bluesky.")) return "bluesky";
  return "website";
}

/** Dedupe + classify a list of URLs into social-icon links. */
function socialsFromUrls(urls: Array<string | null | undefined>): SocialLink[] {
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = sv(raw);
    if (!url || !/^https?:\/\//.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ href: url, platform: socialPlatform(url) });
  }
  return out;
}

/** Merge an owning org's socials (both lexicons) + pick a bio fallback. */
function buildOwnerSocials(owner: OwnerOrg | null): { socials: SocialLink[]; bio: string | null } {
  const urls: Array<string | null | undefined> = [];
  for (const u of owner?.cert?.urls ?? []) urls.push(u?.url);
  if (owner?.gf?.website) urls.push(owner.gf.website);
  for (const s of owner?.gf?.socialLinks ?? []) urls.push(s?.url);
  const socials = socialsFromUrls(urls);
  const email = sv(owner?.gf?.email);
  if (email) socials.push({ href: `mailto:${email}`, platform: "email" });
  const bio =
    (owner?.cert?.longDescription?.__typename === "OrgHypercertsDefsDescriptionString"
      ? sv(owner.cert.longDescription.value)
      : null) ?? sv(owner?.gf?.shortDescription?.text);
  return { socials, bio };
}

function buildBumicertDetail(
  n: BumiDetailNode,
  owner: { socials: SocialLink[]; bio: string | null },
): RecordDetail {
  // Description: rich Leaflet doc (preferred), else plain string, else org bio.
  let richBody: RichBlock[] | null = null;
  let blurb: string | null = null;
  if (n.description?.__typename === "PubLeafletPagesLinearDocument") {
    richBody = leafletToRich(n.description.blocks ?? []);
    blurb = richToPlain(richBody);
  } else if (n.description?.__typename === "OrgHypercertsDefsDescriptionString") {
    blurb = sv(n.description.value);
  }
  if (!richBody && !blurb && owner.bio) {
    blurb = owner.bio;
  }

  // Work scope: explicit string, else the string literals inside the CEL
  // expression (e.g. scope.hasAny(["restoration", "conservation"])).
  let scopeTags: string[] = [];
  if (n.workScope?.__typename === "OrgHypercertsClaimActivityWorkScopeString") {
    scopeTags = (sv(n.workScope.scope) ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  } else if (n.workScope?.__typename === "OrgHypercertsWorkscopeCel") {
    const expr = sv(n.workScope.expression) ?? "";
    scopeTags = [...expr.matchAll(/"([^"]+)"/g)].map((mm) => mm[1]).filter(Boolean);
  }
  const badges: DetailBadge[] = scopeTags
    .slice(0, 6)
    .map((s) => ({ label: cap(s), tone: "info" }));

  const contributors = Array.isArray(n.contributors) ? n.contributors.length : 0;
  const sites = Array.isArray(n.locations) ? n.locations.length : 0;
  const start = sv(n.startDate);
  const end = sv(n.endDate);
  const period = start || end ? `${start ? formatDate(start) : "—"} → ${end ? formatDate(end) : "—"}` : null;

  const sections = [
    section("Claim", [
      field("Work period", period, true),
      field("Contributors", contributors ? formatNumber(contributors) : null),
      field("Certified sites", sites ? formatNumber(sites) : null),
      field("Created", sv(n.createdAt) ? formatDateTime(n.createdAt as string) : null, true),
    ]),
  ].filter((s) => s.fields.length > 0);

  return { blurb, richBody, badges, sections, links: [], socials: owner.socials };
}

/** Fetch + merge an owning org's socials/bio for a record DID (both lexicons). */
async function fetchOwnerSocials(
  did: string,
  signal?: AbortSignal,
): Promise<{ socials: SocialLink[]; bio: string | null }> {
  try {
    const data = await indexerQuery<OwnerOrg>(
      OWNER_SOCIALS_QUERY,
      {
        cert: `at://${did}/app.certified.actor.organization/self`,
        gf: `at://${did}/app.gainforest.organization.info/self`,
      },
      signal,
    );
    return buildOwnerSocials(data ?? null);
  } catch {
    return { socials: [], bio: null };
  }
}

/** Resolve any Leaflet image/website blob refs in a rich body to PDS URLs. */
async function resolveRichImages(
  blocks: RichBlock[],
  did: string,
  signal?: AbortSignal,
): Promise<RichBlock[]> {
  return Promise.all(
    blocks.map(async (b) => {
      if (b.type === "image" && b.ref && !b.url) {
        try {
          return { ...b, url: await resolveBlobUrl(did, b.ref, signal) };
        } catch {
          return b;
        }
      }
      if (b.type === "website" && b.ref && !b.image) {
        try {
          return { ...b, image: await resolveBlobUrl(did, b.ref, signal) };
        } catch {
          return b;
        }
      }
      return b;
    }),
  );
}

// ── Org / site detail ──────────────────────────────────────────────────────

type OrgDetailNode = {
  [k: string]: unknown;
  shortDescription?: { text?: string | null } | null;
  longDescription?: { blocks?: LeafletBlock[] | null } | null;
  socialLinks?: Array<{ platform?: string | null; url?: string | null }> | null;
  ecosystemTypes?: string[] | null;
  focusSpeciesGroups?: string[] | null;
};

const ORG_DETAIL_QUERY = `
  ${FACETS_FRAGMENT}
  query OrgDetail($uri: String!) {
    appGainforestOrganizationInfoByUri(uri: $uri) {
      displayName country createdAt startDate foundedYear teamSize
      website email visibility dataLicense dataDownloadUrl fundingSourcesDescription
      shortDescription { text }
      longDescription { ${LEAFLET_BLOCKS_SELECTION} }
      ecosystemTypes focusSpeciesGroups
      socialLinks { platform url }
    }
  }
`;

function buildOrgDetail(n: OrgDetailNode): RecordDetail {
  const f = (k: string) => sv(n[k]);
  const num = (k: string) => (typeof n[k] === "number" ? (n[k] as number) : null);
  const list = (v: unknown): string | null =>
    Array.isArray(v) ? v.map((x) => sv(x)).filter(Boolean).join(", ") || null : null;

  const sections = [
    section("Organization", [
      field("Founded", num("foundedYear") != null ? String(num("foundedYear")) : null),
      field("Team size", num("teamSize") != null ? formatNumber(num("teamSize")) : null),
      field("Country", [countryFlagSafe(f("country")), f("country")].filter(Boolean).join(" ") || null),
      field("Active since", f("startDate") ? formatDate(f("startDate")!) : null),
      field("Created", f("createdAt") ? formatDateTime(f("createdAt")!) : null, true),
    ]),
    section("Focus", [
      field("Ecosystems", list(n.ecosystemTypes), true),
      field("Focus species", list(n.focusSpeciesGroups), true),
    ]),
    section("Data", [
      field("Data license", f("dataLicense")),
      field("Funding", f("fundingSourcesDescription"), true),
    ]),
  ].filter((s) => s.fields.length > 0);

  // Website + socials (+ email) → icon row; data download stays a text link.
  const socials = socialsFromUrls([f("website"), ...(n.socialLinks ?? []).map((s) => s?.url)]);
  const email = f("email");
  if (email) socials.push({ href: `mailto:${email}`, platform: "email" });

  const links: DetailLink[] = [];
  const dl = f("dataDownloadUrl");
  if (dl && /^https?:\/\//.test(dl)) links.push({ label: "Download data", href: dl });

  // Rich `longDescription` (Leaflet doc) preferred; short tagline is fallback.
  const richBody = n.longDescription?.blocks ? leafletToRich(n.longDescription.blocks) : null;
  const blurb = sv(n.shortDescription?.text);

  return {
    blurb,
    richBody: richBody && richBody.length ? richBody : null,
    badges: [],
    sections,
    links,
    socials,
  };
}

// ── Certified actor org detail ──────────────────────────────────────────────

const CERT_ORG_DETAIL_QUERY = `
  query CertifiedOrgDetail($org: String!, $profile: String!) {
    org: appCertifiedActorOrganizationByUri(uri: $org) {
      createdAt organizationType visibility foundedDate
      urls { url }
      longDescription { __typename ... on OrgHypercertsDefsDescriptionString { value } }
    }
    profile: appCertifiedActorProfileByUri(uri: $profile) {
      displayName description website
    }
  }
`;

type CertOrgDetailNode = {
  org?: {
    organizationType?: string[] | null;
    visibility?: string | null;
    foundedDate?: string | null;
    urls?: Array<{ url?: string | null }> | null;
    longDescription?: { __typename?: string; value?: string | null } | null;
    createdAt?: string | null;
  } | null;
  profile?: {
    displayName?: string | null;
    description?: string | null;
    website?: string | null;
  } | null;
};

function buildCertOrgDetail(d: CertOrgDetailNode, createdAt: string | null): RecordDetail {
  const org = d.org ?? {};
  const profile = d.profile ?? {};
  const types = (org.organizationType ?? [])
    .map((t) => sv(t))
    .filter((t): t is string => Boolean(t))
    .map(cap);
  const badges: DetailBadge[] = types.map((t) => ({ label: t, tone: "info" }));

  const sections = [
    section("Organization", [
      field("Type", types.join(", ") || null, true),
      field("Founded", sv(org.foundedDate) ? formatDate(sv(org.foundedDate)!) : null),
      field("Visibility", sv(org.visibility) ? cap(sv(org.visibility)!) : null),
      field("Created", createdAt ? formatDateTime(createdAt) : null, true),
    ]),
  ].filter((s) => s.fields.length > 0);

  const socials = socialsFromUrls([
    sv(profile.website),
    ...(org.urls ?? []).map((u) => u?.url),
  ]);

  const blurb =
    (org.longDescription?.__typename === "OrgHypercertsDefsDescriptionString"
      ? sv(org.longDescription.value)
      : null) ?? sv(profile.description);

  return { blurb, badges, sections, links: [], socials };
}

/** Fetch the full, drawer-ready detail for a record by its AT-URI. */
export async function fetchRecordDetail(
  atUri: string,
  signal?: AbortSignal,
): Promise<RecordDetail | null> {
  const m = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const collection = m[2];

  const did = m[1];

  if (collection === "app.gainforest.dwc.occurrence") {
    // The observation itself has no socials; its recording org may. Fetch the
    // detail + owner socials in parallel and attach the icon row.
    const [data, owner] = await Promise.all([
      indexerQuery<{ appGainforestDwcOccurrenceByUri?: OccDetailNode | null }>(
        OCCURRENCE_DETAIL_QUERY,
        { uri: atUri },
        signal,
      ),
      fetchOwnerSocials(did, signal),
    ]);
    const n = data?.appGainforestDwcOccurrenceByUri;
    if (!n) return null;
    const detail = buildOccurrenceDetail(n);
    if (owner.socials.length) detail.socials = owner.socials;
    return detail;
  }
  if (collection === "org.hypercerts.claim.activity") {
    // The activity record has no socials/bio; its owning organization does.
    const [data, owner] = await Promise.all([
      indexerQuery<{ orgHypercertsClaimActivityByUri?: BumiDetailNode | null }>(
        ACTIVITY_DETAIL_QUERY,
        { uri: atUri },
        signal,
      ),
      fetchOwnerSocials(did, signal),
    ]);
    const n = data?.orgHypercertsClaimActivityByUri;
    if (!n) return null;
    const detail = buildBumicertDetail(n, owner);
    if (detail.richBody?.length) {
      detail.richBody = await resolveRichImages(detail.richBody, did, signal);
    }
    return detail;
  }
  if (collection === "app.certified.actor.organization") {
    const data = await indexerQuery<CertOrgDetailNode>(
      CERT_ORG_DETAIL_QUERY,
      {
        org: atUri,
        profile: `at://${did}/app.certified.actor.profile/self`,
      },
      signal,
    );
    if (!data?.org) return null;
    return buildCertOrgDetail(data, sv(data.org.createdAt));
  }
  if (collection === "app.gainforest.organization.info") {
    const data = await indexerQuery<{ appGainforestOrganizationInfoByUri?: OrgDetailNode | null }>(
      ORG_DETAIL_QUERY,
      { uri: atUri },
      signal,
    );
    const n = data?.appGainforestOrganizationInfoByUri;
    if (!n) return null;
    const detail = buildOrgDetail(n);
    if (detail.richBody?.length) {
      detail.richBody = await resolveRichImages(detail.richBody, did, signal);
    }
    return detail;
  }
  return null;
}
