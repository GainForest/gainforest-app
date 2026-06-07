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

import { cachedAsync } from "./async-cache";
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

type StatsPage<N> = {
  nodes: N[];
  totalCount: number | null;
  cursor: string | null;
  hasMore: boolean;
};

const RESOLVE_CONCURRENCY = 8;
const SITE_IMAGE_RESOLVE_LIMIT = 96;
const TOTAL_STATS_CACHE_MS = 15 * 60 * 1000;

/** The indexer caps every connection query at 1000 edges regardless of the
 *  requested `first` (it was 100 before the upgrade), so loads beyond 1000 must
 *  page the cursor. */
const INDEXER_MAX_PAGE = 1000;

/** Resolve a list of blob refs to URLs with bounded concurrency. */
async function resolveImages<R>(
  items: R[],
  pick: (r: R) => { did: string; ref: string | null } | null,
  set: (r: R, url: string | null) => R,
  signal?: AbortSignal,
  maxItems = items.length,
): Promise<R[]> {
  const out = [...items];
  const cappedLength = Math.min(maxItems, out.length);
  let cursor = 0;
  async function worker() {
    while (cursor < cappedLength) {
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
    Array.from({ length: Math.min(RESOLVE_CONCURRENCY, cappedLength) }, worker),
  );
  return out;
}

/**
 * Walk a single-page fetcher's cursor until `target` records are gathered (or
 * the stream ends), emitting the running list after each page so a multi-page
 * load fills the grid in waves instead of after one long wait.
 */
async function collectPaged<R>(
  fetchPage: (first: number, after: string | null, signal?: AbortSignal) => Promise<Page<R>>,
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
    const pageSize = Math.min(INDEXER_MAX_PAGE, target - all.length);
    const page = await fetchPage(pageSize, cursor, signal);
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
  siteRef: string | null;
  datasetRef: string | null;
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
  siteRef datasetRef
  occurrenceRemarks fieldNotes
  thumbnailUrl speciesImageUrl
  imageEvidence { file { ref } }
  audioEvidence { file { ref } }
  videoEvidence { file { ref } }
  spectrogramEvidence { file { ref } }
`;

const OCCURRENCE_QUERY = `
  query ExplorerOccurrences($first: Int!, $after: String, $where: AppGainforestDwcOccurrenceWhereInput) {
    appGainforestDwcOccurrence(first: $first, after: $after, where: $where, sortBy: createdAt, sortDirection: DESC) {
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
  siteRef?: string | null;
  datasetRef?: string | null;
  occurrenceRemarks?: string | null;
  fieldNotes?: string | null;
  thumbnailUrl?: string | null;
  speciesImageUrl?: string | null;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
  audioEvidence?: { file?: { ref?: string | null } | null } | null;
  videoEvidence?: { file?: { ref?: string | null } | null } | null;
  spectrogramEvidence?: { file?: { ref?: string | null } | null } | null;
};

function mapOccurrence(n: RawOccurrence): OccurrenceRecord {
  // Restor-sourced records carry an external photo URL (thumbnailUrl /
  // speciesImageUrl, the same S3 link) rather than a PDS blob — render it
  // directly, no getBlob round-trip needed.
  const externalImage = n.thumbnailUrl?.trim() || n.speciesImageUrl?.trim() || null;
  const media: MediaKind[] = [];
  if (n.imageEvidence?.file?.ref || externalImage) media.push("image");
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
    siteRef: n.siteRef?.trim() || null,
    datasetRef: n.datasetRef?.trim() || null,
    createdAt: n.createdAt,
    remarks: n.occurrenceRemarks?.trim() || n.fieldNotes?.trim() || null,
    imageUrl: externalImage,
    media,
  };
}

export type OccurrenceFilter = "all" | "image" | "audio";

/** Pages to walk when no server-side `where` applies (the "all" view paging
 *  past sparse pages). Every media filter now pushes down to the indexer via a
 *  presence `where` (see filterWhere), so they reach their target in a page or
 *  two instead of walking. */
const MAX_WALK_PAGES = 18;

async function fetchOccurrencePage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
  where?: Record<string, unknown>,
): Promise<{ nodes: RawOccurrence[]; cursor: string | null; hasNextPage: boolean }> {
  const data = await indexerQuery<{
    appGainforestDwcOccurrence?: Connection<RawOccurrence>;
  }>(OCCURRENCE_QUERY, { first, after, where: where ?? null }, signal);
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
  // "image" means a real PDS blob photo (imageEvidence); the external Restor
  // thumbnailUrl/speciesImageUrl links are no longer the filter target.
  if (media === "image") return Boolean(n.imageEvidence?.file?.ref);
  // "audio" includes spectrogram-bearing records too.
  return Boolean(n.audioEvidence?.file?.ref || n.spectrogramEvidence?.file?.ref);
}

/** Server-side `where` for a media filter. Since the indexer upgrade exposed
 *  `PresenceFilterInput` on the blob-evidence relations, both filters push down
 *  to the indexer instead of walking pages: "image" selects records that carry
 *  a real PDS image blob (328k of them, vs 8k external thumbnails) and "audio"
 *  selects records with an audio blob (47k). */
function filterWhere(media: OccurrenceFilter): Record<string, unknown> | undefined {
  if (media === "image") return { imageEvidence: { isNull: false } };
  if (media === "audio") return { audioEvidence: { isNull: false } };
  return undefined;
}

export type OccurrenceWalkResult = {
  records: OccurrenceRecord[];
  cursor: string | null;
  hasMore: boolean;
};

/**
 * Progressively walk the occurrence connection, collecting up to `target`
 * records matching the media filter and emitting them via `onProgress` as each
 * page resolves. The "image" and "audio" filters push a presence `where` clause
 * (imageEvidence / audioEvidence isNull:false) to the indexer so only
 * media-bearing records come back — the gallery fills from one request instead
 * of scanning thousands of imageless bulk uploads. "all" still pages
 * client-side. PDS blob refs are resolved per page; external thumbnails (on the
 * sparser Restor records) render immediately. Returns the final cursor +
 * `hasMore` so "load more" continues from where it stopped.
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
  const where = filterWhere(media);
  // With a server-side filter every returned node already matches, so the
  // target is reached in one or two pages — no need for the deep imageless walk.
  const maxPages = opts.maxPages ?? (where ? 5 : MAX_WALK_PAGES);
  const pageSize = Math.min(INDEXER_MAX_PAGE, Math.max(target, 24));

  const collected: OccurrenceRecord[] = [];
  let cursor: string | null = opts.after;
  let hasNextPage = true;

  for (let page = 0; page < maxPages; page++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const res = await fetchOccurrencePage(pageSize, cursor, signal, where);
    cursor = res.cursor;
    hasNextPage = res.hasNextPage;

    const matches = res.nodes.filter((n) => matchesFilter(n, media));
    if (matches.length > 0) {
      const needed = target - collected.length;
      const pageMatches = matches.slice(0, needed);
      let mapped = pageMatches.map(mapOccurrence);
      mapped = await resolveImages(
        mapped,
        (r) => {
          // External-thumbnail records already have a usable imageUrl; only PDS
          // blob evidence needs a getBlob resolution.
          if (r.imageUrl) return null;
          const raw = pageMatches.find((n) => n.rkey === r.rkey && n.did === r.did);
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

/** Load recent image observations owned by a single DID. Used by Bumicert detail
 * pages to show a compact evidence gallery connected to the publishing
 * organization. */
export async function fetchImageOccurrencesByDid(
  did: string,
  target = 24,
  signal?: AbortSignal,
): Promise<OccurrenceRecord[]> {
  const where = { did: { eq: did }, imageEvidence: { isNull: false } };
  const page = await fetchOccurrencePage(Math.min(INDEXER_MAX_PAGE, Math.max(target, 24)), null, signal, where);
  const matches = page.nodes.filter((node) => Boolean(node.imageEvidence?.file?.ref));
  let mapped = matches.map(mapOccurrence);
  mapped = await resolveImages(
    mapped,
    (record) => {
      if (record.imageUrl) return null;
      const raw = matches.find((node) => node.rkey === record.rkey && node.did === record.did);
      const ref = raw?.imageEvidence?.file?.ref ?? null;
      return ref ? { did: record.did, ref } : null;
    },
    (record, url) => ({ ...record, imageUrl: url }),
    signal,
  );
  return mapped.filter((record) => Boolean(record.imageUrl)).slice(0, target);
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
  scopeTags: string[];
  /** AT-URIs of the certified locations this claim references. */
  locationUris: string[];
  createdAt: string;
  imageUrl: string | null;
  imageRef: string | null;
};

const ACTIVITY_NODE_FIELDS = `
  did rkey uri createdAt title shortDescription startDate endDate
  workScope {
    __typename
    ... on OrgHypercertsClaimActivityWorkScopeString { scope }
    ... on OrgHypercertsWorkscopeCel { expression }
  }
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

const ACTIVITY_BY_DID_QUERY = `
  query ExplorerActivitiesByDid($did: String!, $first: Int!, $after: String) {
    orgHypercertsClaimActivity(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
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
  workScope?: { __typename?: string; scope?: string | null; expression?: string | null } | null;
  image?: RawActivityImage;
};

function splitWorkScopeString(value?: string | null): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractWorkScopeTags(workScope?: { __typename?: string; scope?: string | null; expression?: string | null } | null): string[] {
  const stringTags = splitWorkScopeString(workScope?.scope);
  if (stringTags.length > 0) return stringTags;

  const expression = workScope?.expression ?? "";
  if (!expression) return [];

  return [...expression.matchAll(/(["'])(.*?)\1/g)]
    .map((match) => match[2]?.trim() ?? "")
    .filter(Boolean);
}

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
    scopeTags: extractWorkScopeTags(n.workScope),
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

async function mapActivityConnection(
  conn: Connection<RawActivity> | null | undefined,
  signal?: AbortSignal,
): Promise<Page<BumicertRecord>> {
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

async function fetchActivityPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<BumicertRecord>> {
  const data = await indexerQuery<{
    orgHypercertsClaimActivity?: Connection<RawActivity>;
  }>(ACTIVITY_QUERY, { first, after }, signal);
  return mapActivityConnection(data?.orgHypercertsClaimActivity, signal);
}

async function fetchActivityByDidPage(
  did: string,
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<BumicertRecord>> {
  const data = await indexerQuery<{
    orgHypercertsClaimActivity?: Connection<RawActivity>;
  }>(ACTIVITY_BY_DID_QUERY, { did, first, after }, signal);
  return mapActivityConnection(data?.orgHypercertsClaimActivity, signal);
}

/** Load up to `target` Bumicerts, paging the indexer's 1000-record cap. */
export async function fetchBumicerts(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: BumicertRecord[]) => void,
): Promise<Page<BumicertRecord>> {
  return collectPaged(fetchActivityPage, target, after, signal, onProgress);
}

/** Load Bumicerts created by a single account DID. */
export async function fetchBumicertsByDid(
  did: string,
  target = 1000,
  after: string | null = null,
  signal?: AbortSignal,
  onProgress?: (records: BumicertRecord[]) => void,
): Promise<Page<BumicertRecord>> {
  return collectPaged((first, cursor, nextSignal) => fetchActivityByDidPage(did, first, cursor, nextSignal), target, after, signal, onProgress);
}

export type BumicertStats = {
  totalBumicerts: number | null;
  certifiedPlaces: number;
  contributors: number;
  projectPhotos: number;
};

const ACTIVITY_STATS_QUERY = `
  query ExplorerActivityStats($first: Int!, $after: String) {
    orgHypercertsClaimActivity(first: $first, after: $after, sortBy: createdAt, sortDirection: DESC) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          contributors { contributorIdentity { __typename } }
          locations { uri }
          image {
            __typename
            ... on OrgHypercertsDefsUri { uri }
            ... on OrgHypercertsDefsSmallImage { image { ref } }
          }
        }
      }
    }
  }
`;

type RawActivityStats = Pick<RawActivity, "contributors" | "locations" | "image">;

function activityHasImage(image: RawActivityImage): boolean {
  if (image?.__typename === "OrgHypercertsDefsUri") return Boolean(image.uri?.trim());
  if (image?.__typename === "OrgHypercertsDefsSmallImage") return Boolean(normaliseRef(image.image?.ref));
  return false;
}

async function fetchActivityStatsPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<StatsPage<RawActivityStats>> {
  const data = await indexerQuery<{
    orgHypercertsClaimActivity?: Connection<RawActivityStats>;
  }>(ACTIVITY_STATS_QUERY, { first, after }, signal);
  const conn = data?.orgHypercertsClaimActivity;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawActivityStats => Boolean(n));
  return {
    nodes,
    totalCount: conn?.totalCount ?? null,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

async function fetchBumicertStatsUncached(): Promise<BumicertStats> {
  let after: string | null = null;
  let totalBumicerts: number | null = null;
  let seenRows = 0;
  let certifiedPlaces = 0;
  let contributors = 0;
  let projectPhotos = 0;

  for (let page = 0; page < 100; page += 1) {
    const res = await fetchActivityStatsPage(INDEXER_MAX_PAGE, after);
    totalBumicerts ??= res.totalCount;
    seenRows += res.nodes.length;
    for (const node of res.nodes) {
      certifiedPlaces += Array.isArray(node.locations) ? node.locations.length : 0;
      contributors += Array.isArray(node.contributors) ? node.contributors.length : 0;
      if (activityHasImage(node.image ?? null)) projectPhotos += 1;
    }
    if (!res.hasMore || !res.cursor) break;
    after = res.cursor;
  }

  return {
    totalBumicerts: totalBumicerts ?? seenRows,
    certifiedPlaces,
    contributors,
    projectPhotos,
  };
}

export async function fetchBumicertStats(signal?: AbortSignal): Promise<BumicertStats> {
  return cachedAsync("bumicert-total-stats", TOTAL_STATS_CACHE_MS, fetchBumicertStatsUncached, signal);
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
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<SiteRecord>> {
  const data = await indexerQuery<{
    appGainforestOrganizationInfo?: Connection<RawOrg>;
  }>(ORG_QUERY, { first, after }, signal);
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
    SITE_IMAGE_RESOLVE_LIMIT,
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
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<SiteRecord>> {
  const data = await indexerQuery<{
    appCertifiedActorOrganization?: Connection<RawCertOrg>;
  }>(CERT_ORG_QUERY, { first, after }, signal);
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
    SITE_IMAGE_RESOLVE_LIMIT,
  );
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

export type OrganizationStats = {
  organizations: number | null;
  countries: number;
  withPhotos: number;
  mappedPlaces: number;
};

const ORG_STATS_QUERY = `
  query ExplorerOrganizationStats($first: Int!, $after: String) {
    appGainforestOrganizationInfo(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          country
          coverImage { image { ref } }
          logo { image { ref } }
        }
      }
    }
  }
`;

const CERT_ORG_STATS_QUERY = `
  query ExplorerCertifiedOrganizationStats($first: Int!, $after: String) {
    appCertifiedActorOrganization(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { did location { uri } } }
    }
  }
`;

type RawOrgStats = Pick<RawOrg, "country" | "coverImage" | "logo">;
type RawCertOrgStats = Pick<RawCertOrg, "did" | "location">;

function normalizeStatsCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

async function fetchOrgStatsPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<StatsPage<RawOrgStats>> {
  const data = await indexerQuery<{
    appGainforestOrganizationInfo?: Connection<RawOrgStats>;
  }>(ORG_STATS_QUERY, { first, after }, signal);
  const conn = data?.appGainforestOrganizationInfo;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawOrgStats => Boolean(n));
  return {
    nodes,
    totalCount: conn?.totalCount ?? null,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

async function fetchCertifiedOrgStatsPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<StatsPage<RawCertOrgStats>> {
  const data = await indexerQuery<{
    appCertifiedActorOrganization?: Connection<RawCertOrgStats>;
  }>(CERT_ORG_STATS_QUERY, { first, after }, signal);
  const conn = data?.appCertifiedActorOrganization;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawCertOrgStats => Boolean(n?.did));
  return {
    nodes,
    totalCount: conn?.totalCount ?? null,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

async function fetchGainforestOrganizationStats(): Promise<OrganizationStats> {
  let after: string | null = null;
  let organizations: number | null = null;
  let seenRows = 0;
  let withPhotos = 0;
  const countries = new Set<string>();

  for (let page = 0; page < 100; page += 1) {
    const res = await fetchOrgStatsPage(INDEXER_MAX_PAGE, after);
    organizations ??= res.totalCount;
    seenRows += res.nodes.length;
    for (const node of res.nodes) {
      const country = normalizeStatsCountry(node.country);
      if (country) countries.add(country);
      if (normaliseRef(node.coverImage?.image?.ref) || normaliseRef(node.logo?.image?.ref)) withPhotos += 1;
    }
    if (!res.hasMore || !res.cursor) break;
    after = res.cursor;
  }

  return {
    organizations: organizations ?? seenRows,
    countries: countries.size,
    withPhotos,
    mappedPlaces: organizations ?? seenRows,
  };
}

async function fetchCertifiedOrganizationStats(): Promise<OrganizationStats> {
  let after: string | null = null;
  let organizations: number | null = null;
  let seenRows = 0;
  let withPhotos = 0;
  let mappedPlaces = 0;

  for (let page = 0; page < 100; page += 1) {
    const res = await fetchCertifiedOrgStatsPage(100, after);
    organizations ??= res.totalCount;
    seenRows += res.nodes.length;
    const profiles = await fetchCertProfiles(res.nodes.map((node) => node.did));
    for (const node of res.nodes) {
      if (profiles.get(node.did)?.avatarRef) withPhotos += 1;
      if (node.location?.uri) mappedPlaces += 1;
    }
    if (!res.hasMore || !res.cursor) break;
    after = res.cursor;
  }

  return {
    organizations: organizations ?? seenRows,
    countries: 0,
    withPhotos,
    mappedPlaces,
  };
}

async function fetchOrganizationStatsUncached(source: SiteSourceFilter): Promise<OrganizationStats> {
  if (source === "gainforest") return fetchGainforestOrganizationStats();
  if (source === "certified") return fetchCertifiedOrganizationStats();

  const [gainforest, certified] = await Promise.all([
    fetchGainforestOrganizationStats(),
    fetchCertifiedOrganizationStats(),
  ]);
  return {
    organizations: (gainforest.organizations ?? 0) + (certified.organizations ?? 0),
    countries: gainforest.countries,
    withPhotos: gainforest.withPhotos + certified.withPhotos,
    mappedPlaces: gainforest.mappedPlaces + certified.mappedPlaces,
  };
}

export async function fetchOrganizationStats(
  source: SiteSourceFilter = "both",
  signal?: AbortSignal,
): Promise<OrganizationStats> {
  return cachedAsync(
    `organization-total-stats:${source}`,
    TOTAL_STATS_CACHE_MS,
    () => fetchOrganizationStatsUncached(source),
    signal,
  );
}

function siteTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

type CombinedSiteCursor = {
  gainforest: string | null;
  certified: string | null;
  gainforestMore: boolean;
  certifiedMore: boolean;
};

function parseCombinedSiteCursor(value: string | null): CombinedSiteCursor {
  if (!value?.startsWith("both:")) {
    return { gainforest: null, certified: null, gainforestMore: true, certifiedMore: true };
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice("both:".length))) as Partial<CombinedSiteCursor>;
    return {
      gainforest: typeof parsed.gainforest === "string" ? parsed.gainforest : null,
      certified: typeof parsed.certified === "string" ? parsed.certified : null,
      gainforestMore: parsed.gainforestMore !== false,
      certifiedMore: parsed.certifiedMore !== false,
    };
  } catch {
    return { gainforest: null, certified: null, gainforestMore: true, certifiedMore: true };
  }
}

function encodeCombinedSiteCursor(value: CombinedSiteCursor): string | null {
  if (!value.gainforestMore && !value.certifiedMore) return null;
  return `both:${encodeURIComponent(JSON.stringify(value))}`;
}

/**
 * Load up to `target` project sites, paging the indexer's 1000-record cap.
 * `source` picks the GainForest org lexicon, the certified actor lexicon, or
 * both merged (newest first). The merged view keeps a small combined cursor so
 * the organizations page can continue both streams after its first load.
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

  const previous = parseCombinedSiteCursor(after);
  let gf: SiteRecord[] = [];
  let cert: SiteRecord[] = [];
  const empty = Promise.resolve({ records: [], cursor: null, hasMore: false } satisfies Page<SiteRecord>);
  const publishProgress = () => {
    onProgress?.([...gf, ...cert].sort((a, b) => siteTime(b.createdAt) - siteTime(a.createdAt)));
  };
  const [gfPage, certPage] = await Promise.all([
    previous.gainforestMore
      ? collectPaged(fetchOrgPage, target, previous.gainforest, signal, (running) => {
          gf = running;
          publishProgress();
        })
      : empty,
    previous.certifiedMore
      ? collectPaged(fetchCertOrgPage, target, previous.certified, signal, (running) => {
          cert = running;
          publishProgress();
        })
      : empty,
  ]);
  const records = [...gfPage.records, ...certPage.records].sort(
    (a, b) => siteTime(b.createdAt) - siteTime(a.createdAt),
  );
  onProgress?.(records);
  const hasMore = gfPage.hasMore || certPage.hasMore;
  return {
    records,
    cursor: encodeCombinedSiteCursor({
      gainforest: gfPage.cursor,
      certified: certPage.cursor,
      gainforestMore: gfPage.hasMore,
      certifiedMore: certPage.hasMore,
    }),
    hasMore,
  };
}

// ── 4. Manage section — certified locations by DID ─────────────────────────

export type ManagedLocation = {
  metadata: {
    did: string;
    uri: string;
    rkey: string;
    cid: string;
    createdAt: string | null;
  };
  record: {
    name: string | null;
    description: string | null;
    locationType: string | null;
    location: ManagedLocationData | null;
  };
};

export type ManagedLocationData =
  | { kind: "point"; lat: number; lon: number }
  | { kind: "uri"; uri: string }
  | { kind: "unknown" };

const LOCATIONS_BY_DID_QUERY = `
  query CertifiedLocationsByDid($did: String!, $first: Int!, $after: String) {
    appCertifiedLocation(
      where: { did: { eq: $did } }
      sortDirection: DESC
      sortBy: createdAt
      first: $first
      after: $after
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri rkey cid createdAt
          name description locationType
          location {
            __typename
            ... on AppCertifiedLocationString { string }
            ... on OrgHypercertsDefsUri { uri }
          }
        }
      }
    }
  }
`;

type RawLocationNode = {
  did: string;
  uri: string;
  rkey: string;
  cid: string;
  createdAt?: string | null;
  name?: string | null;
  description?: string | null;
  locationType?: string | null;
  location?: {
    __typename?: string;
    string?: string | null;
    uri?: string | null;
  } | null;
};

function parseLocationCoord(s: string): { lat: number; lon: number } | null {
  const parts = s.split(/[,\s]+/).map((p) => parseFloat(p)).filter((n) => !isNaN(n));
  if (parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return { lat: parts[0], lon: parts[1] };
  }
  return null;
}

function mapLocation(raw: RawLocationNode): ManagedLocation {
  let location: ManagedLocationData | null = null;
  const loc = raw.location;
  if (loc) {
    if (loc.__typename === "AppCertifiedLocationString" && loc.string) {
      const coord = parseLocationCoord(loc.string);
      if (coord) {
        location = { kind: "point", lat: coord.lat, lon: coord.lon };
      } else {
        location = { kind: "unknown" };
      }
    } else if (loc.__typename === "OrgHypercertsDefsUri" && loc.uri) {
      location = { kind: "uri", uri: loc.uri };
    } else {
      location = { kind: "unknown" };
    }
  }
  return {
    metadata: {
      did: raw.did,
      uri: raw.uri,
      rkey: raw.rkey,
      cid: raw.cid,
      createdAt: raw.createdAt ?? null,
    },
    record: {
      name: raw.name?.trim() || null,
      description: raw.description?.trim() || null,
      locationType: raw.locationType?.trim() || null,
      location,
    },
  };
}

export async function fetchLocationsByDid(
  did: string,
  signal?: AbortSignal,
): Promise<ManagedLocation[]> {
  const all: ManagedLocation[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    type LocationPage = { appCertifiedLocation?: Connection<RawLocationNode> };
    const data: LocationPage | null = await indexerQuery<LocationPage>(
      LOCATIONS_BY_DID_QUERY, { did, first: 200, after: cursor }, signal,
    );
    const conn: Connection<RawLocationNode> | undefined = data?.appCertifiedLocation;
    const nodes = (conn?.edges ?? [])
      .map((e) => e?.node)
      .filter((n): n is RawLocationNode => Boolean(n?.did));
    all.push(...nodes.map(mapLocation));
    if (!conn?.pageInfo?.hasNextPage || !conn?.pageInfo?.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

// ── 5. Manage section — audio recordings by DID ────────────────────────────

export type ManagedAudio = {
  metadata: {
    did: string;
    uri: string;
    rkey: string;
    cid: string;
    createdAt: string | null;
  };
  record: {
    name: string | null;
    description: string | null;
    audioUrl: string | null;
    mimeType: string | null;
    recordedAt: string | null;
    sampleRate: number | null;
    duration: string | null;
  };
};

const AUDIO_BY_DID_QUERY = `
  query AudioRecordingsByDid($did: String!, $first: Int!, $after: String) {
    appGainforestAcAudio(
      where: { did: { eq: $did } }
      sortDirection: DESC
      sortBy: createdAt
      first: $first
      after: $after
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri rkey cid createdAt
          name
          description { text }
          blob { file { ref mimeType size } }
          metadata { recordedAt sampleRate duration codec channels }
        }
      }
    }
  }
`;

type RawAudioNode = {
  did: string;
  uri: string;
  rkey: string;
  cid: string;
  createdAt?: string | null;
  name?: string | null;
  description?: { text?: string | null } | null;
  blob?: { file?: { ref?: string | null; mimeType?: string | null; size?: number | null } | null } | null;
  metadata?: {
    recordedAt?: string | null;
    sampleRate?: number | null;
    duration?: string | null;
    codec?: string | null;
    channels?: number | null;
  } | null;
};

export async function fetchAudioByDid(
  did: string,
  signal?: AbortSignal,
): Promise<ManagedAudio[]> {
  const all: ManagedAudio[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    type AudioPage = { appGainforestAcAudio?: Connection<RawAudioNode> };
    const data: AudioPage | null = await indexerQuery<AudioPage>(
      AUDIO_BY_DID_QUERY, { did, first: 200, after: cursor }, signal,
    );
    const conn: Connection<RawAudioNode> | undefined = data?.appGainforestAcAudio;
    const nodes = (conn?.edges ?? [])
      .map((e) => e?.node)
      .filter((n): n is RawAudioNode => Boolean(n?.did));
    // Map nodes to ManagedAudio; resolve blob URLs concurrently via resolveImages.
    // We carry the raw ref through the mapped array as audioUrl so resolveImages
    // can look it up, then overwrite it with the resolved URL.
    const preMapped: ManagedAudio[] = nodes.map((n) => ({
      metadata: { did: n.did, uri: n.uri, rkey: n.rkey, cid: n.cid, createdAt: n.createdAt ?? null },
      record: {
        name: n.name?.trim() || null,
        description: n.description?.text?.trim() || null,
        // Temporarily store the raw CID here so resolveImages can find it; it
        // will be overwritten with the full blob URL (or null) after resolution.
        audioUrl: normaliseRef(n.blob?.file?.ref),
        mimeType: n.blob?.file?.mimeType ?? null,
        recordedAt: n.metadata?.recordedAt ?? null,
        sampleRate: n.metadata?.sampleRate ?? null,
        duration: n.metadata?.duration ?? null,
      },
    }));
    const resolved = await resolveImages(
      preMapped,
      (r) => (r.record.audioUrl ? { did: r.metadata.did, ref: r.record.audioUrl } : null),
      (r, url) => ({ ...r, record: { ...r.record, audioUrl: url } }),
      signal,
    );
    all.push(...resolved);
    if (!conn?.pageInfo?.hasNextPage || !conn?.pageInfo?.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

// ── 6. Manage section — occurrences by DID (for trees) ─────────────────────

export async function fetchOccurrencesByDid(
  did: string,
  target = 1000,
  after: string | null = null,
  signal?: AbortSignal,
  onProgress?: (records: OccurrenceRecord[]) => void,
): Promise<Page<OccurrenceRecord>> {
  const where = { did: { eq: did } };
  const pageSize = INDEXER_MAX_PAGE;
  const collected: OccurrenceRecord[] = [];
  let cursor: string | null = after;
  let hasNextPage = true;
  for (let page = 0; page < 20; page++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const res = await fetchOccurrencePage(pageSize, cursor, signal, where);
    cursor = res.cursor;
    hasNextPage = res.hasNextPage;
    let mapped = res.nodes.map(mapOccurrence);
    mapped = await resolveImages(
      mapped,
      (r) => {
        if (r.imageUrl) return null;
        const raw = res.nodes.find((n) => n.rkey === r.rkey && n.did === r.did);
        const ref = raw?.imageEvidence?.file?.ref ?? raw?.spectrogramEvidence?.file?.ref ?? null;
        return ref ? { did: r.did, ref } : null;
      },
      (r, url) => ({ ...r, imageUrl: url }),
      signal,
    );
    for (const r of mapped) {
      if (collected.length >= target) break;
      collected.push(r);
    }
    onProgress?.(collected.slice(0, target));
    if (collected.length >= target || !hasNextPage || !cursor) break;
  }
  return { records: collected.slice(0, target), cursor, hasMore: hasNextPage && Boolean(cursor) };
}

// ── 7. Manage section — tree datasets by DID ───────────────────────────────

export type UploadTreeDatasetRecord = {
  uri: string;
  rkey: string;
  name: string;
  description: string | null;
  recordCount: number | null;
  createdAt: string | null;
};

const TREE_DATASET_BY_DID_QUERY = `
  query ExplorerDatasetsByDid($did: String!, $first: Int!, $after: String) {
    appGainforestDwcDataset(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did uri rkey name description recordCount createdAt } }
    }
  }
`;

type RawTreeDatasetNode = {
  uri: string;
  rkey: string;
  name: string;
  description?: string | null;
  recordCount?: number | null;
  createdAt?: string | null;
};

export async function fetchTreeDatasetsByDid(
  did: string,
  signal?: AbortSignal,
): Promise<UploadTreeDatasetRecord[]> {
  const all: UploadTreeDatasetRecord[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 10; page++) {
    type DatasetPage = { appGainforestDwcDataset?: Connection<RawTreeDatasetNode> };
    const data: DatasetPage | null = await indexerQuery<DatasetPage>(
      TREE_DATASET_BY_DID_QUERY,
      { did, first: 100, after: cursor },
      signal,
    );
    const conn: Connection<RawTreeDatasetNode> | undefined = data?.appGainforestDwcDataset;
    const nodes = (conn?.edges ?? [])
      .map((edge) => edge?.node)
      .filter((node): node is RawTreeDatasetNode => Boolean(node?.uri && node?.rkey && node?.name));

    all.push(
      ...nodes.map((node) => ({
        uri: node.uri,
        rkey: node.rkey,
        name: node.name,
        description: node.description?.trim() || null,
        recordCount: typeof node.recordCount === "number" ? node.recordCount : null,
        createdAt: node.createdAt ?? null,
      })),
    );

    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }

  return all;
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
  const scopeTags = extractWorkScopeTags(n.workScope);
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

// ── Account summary (handle → profile drawer) ──────────────────────────
//
// Clicking a handle anywhere opens a drawer about that DID: when its repo was
// created (PLC audit log), which org lexicons it publishes (certified actor /
// GainForest org), and how many Bumicerts + Darwin Core observations it owns.
// All counts come from one aliased indexer query (where: { did: { eq } } +
// totalCount); identity/age come from plc.directory. Both endpoints are
// CORS-open so this runs entirely in the browser.

export type AccountSummary = {
  did: string;
  /** Handle from the PLC audit log's alsoKnownAs (best-effort). */
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  country: string | null;
  /** Repo (DID) creation time from the PLC audit log. */
  createdAt: string | null;
  /** Organization founding/start date when available. */
  foundedDate: string | null;
  visibility: "Public" | "Unlisted" | null;
  hasCertifiedProfile: boolean;
  hasCertifiedOrg: boolean;
  certOrgType: string | null;
  hasGainforestOrg: boolean;
  bumicertCount: number;
  observationCount: number;
};

type AccountSummaryNode = {
  occ?: { totalCount?: number | null } | null;
  bumi?: { totalCount?: number | null } | null;
  certOrg?: {
    createdAt?: string | null;
    organizationType?: string[] | null;
    visibility?: string | null;
    foundedDate?: string | null;
  } | null;
  gfOrg?: {
    createdAt?: string | null;
    displayName?: string | null;
    country?: string | null;
    visibility?: string | null;
    foundedYear?: number | string | null;
    coverImage?: { image?: { ref?: string | null } | null } | null;
    logo?: { image?: { ref?: string | null } | null } | null;
  } | null;
  certProfile?: {
    displayName?: string | null;
    description?: string | null;
    website?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
  } | null;
};

const ACCOUNT_SUMMARY_QUERY = `
  query AccountSummary($did: String!, $certOrg: String!, $gfOrg: String!, $certProfile: String!) {
    occ: appGainforestDwcOccurrence(first: 0, where: { did: { eq: $did } }) { totalCount }
    bumi: orgHypercertsClaimActivity(first: 0, where: { did: { eq: $did } }) { totalCount }
    certOrg: appCertifiedActorOrganizationByUri(uri: $certOrg) {
      createdAt organizationType visibility foundedDate
    }
    gfOrg: appGainforestOrganizationInfoByUri(uri: $gfOrg) {
      createdAt displayName country visibility foundedYear
      coverImage { image { ref } }
      logo { image { ref } }
    }
    certProfile: appCertifiedActorProfileByUri(uri: $certProfile) {
      displayName description website
      avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
    }
  }
`;

/** First PLC audit entry = repo creation; last entry's alsoKnownAs = handle. */
async function fetchPlcIdentity(
  did: string,
  signal?: AbortSignal,
): Promise<{ createdAt: string | null; handle: string | null }> {
  if (!did.startsWith("did:plc:")) return { createdAt: null, handle: null };
  try {
    const res = await fetch(`https://plc.directory/${did}/log/audit`, { signal });
    if (!res.ok) return { createdAt: null, handle: null };
    const log = (await res.json()) as Array<{
      createdAt?: string;
      operation?: { alsoKnownAs?: string[] };
    }>;
    const first = log[0];
    const last = log[log.length - 1];
    const aka = (last?.operation?.alsoKnownAs ?? first?.operation?.alsoKnownAs ?? [])[0];
    const handle = aka
      ? aka.replace(/^at:\/\//, "").replace(/^https?:\/\//, "") || null
      : null;
    return { createdAt: first?.createdAt ?? null, handle };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return { createdAt: null, handle: null };
  }
}

export async function fetchAccountSummary(
  did: string,
  signal?: AbortSignal,
): Promise<AccountSummary> {
  const [data, plc] = await Promise.all([
    indexerQuery<AccountSummaryNode>(
      ACCOUNT_SUMMARY_QUERY,
      {
        did,
        certOrg: `at://${did}/app.certified.actor.organization/self`,
        gfOrg: `at://${did}/app.gainforest.organization.info/self`,
        certProfile: `at://${did}/app.certified.actor.profile/self`,
      },
      signal,
    ),
    fetchPlcIdentity(did, signal),
  ]);

  const certOrg = data?.certOrg ?? null;
  const gfOrg = data?.gfOrg ?? null;
  const profile = data?.certProfile ?? null;

  const certType =
    (certOrg?.organizationType ?? [])
      .map((t) => sv(t))
      .filter((t): t is string => Boolean(t))
      .map(cap)
      .join(", ") || null;

  // Avatar precedence: certified profile avatar → GainForest logo → cover.
  const avatarRef =
    normaliseRef(profile?.avatar?.image?.ref) ??
    normaliseRef(gfOrg?.logo?.image?.ref) ??
    normaliseRef(gfOrg?.coverImage?.image?.ref);
  let avatarUrl: string | null = null;
  if (avatarRef) {
    try {
      avatarUrl = await resolveBlobUrl(did, avatarRef, signal);
    } catch {
      /* monogram fallback in the UI */
    }
  }

  const rawVisibility = sv(gfOrg?.visibility) ?? sv(certOrg?.visibility);
  const gfFoundedYear = gfOrg?.foundedYear == null ? null : String(gfOrg.foundedYear).trim();
  const gfFoundedDate = gfFoundedYear && /^\d{4}$/.test(gfFoundedYear) ? `${gfFoundedYear}-01-01T00:00:00.000Z` : null;

  return {
    did,
    handle: plc.handle,
    displayName: sv(profile?.displayName) ?? sv(gfOrg?.displayName) ?? null,
    avatarUrl,
    bio: sv(profile?.description) ?? null,
    website: sv(profile?.website) ?? null,
    country: sv(gfOrg?.country) ?? null,
    createdAt: sv(plc.createdAt) ?? sv(certOrg?.createdAt) ?? sv(gfOrg?.createdAt) ?? null,
    foundedDate: gfFoundedDate ?? sv(certOrg?.foundedDate) ?? null,
    visibility: rawVisibility === "unlisted" || rawVisibility === "Unlisted" ? "Unlisted" : rawVisibility ? "Public" : null,
    hasCertifiedProfile: Boolean(profile),
    hasCertifiedOrg: Boolean(certOrg),
    certOrgType: certType,
    hasGainforestOrg: Boolean(gfOrg),
    bumicertCount: data?.bumi?.totalCount ?? 0,
    observationCount: data?.occ?.totalCount ?? 0,
  };
}
