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
import { asNumber } from "./format";

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

export type SiteRecord = {
  kind: "site";
  id: string;
  did: string;
  atUri: string;
  name: string;
  country: string | null;
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
  return {
    kind: "site",
    id: n.did,
    did: n.did,
    atUri: n.uri || `at://${n.did}/app.gainforest.organization.info/self`,
    name: n.displayName?.trim() || "Unnamed organization",
    country: n.country?.trim() || null,
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

/** Load up to `target` project sites, paging the indexer's 100-record cap. */
export async function fetchSites(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: SiteRecord[]) => void,
): Promise<Page<SiteRecord>> {
  return collectPaged(fetchOrgPage, target, after, signal, onProgress);
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
