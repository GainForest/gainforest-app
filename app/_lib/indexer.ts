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
import { recognitionKeyFromTitle } from "./recognition-badges";
import { PUBLIC_EXPLORE_CACHE_TTL_MS, publicExploreCache } from "./public-explore-cache";
import { INDEXER_URL } from "./urls";
import { countryCodeFromCertifiedLocation, fetchCertifiedLocationCountryCode, type CertifiedLocationLike } from "./country-location";
import { blobUrl, resolveBlobUrl, resolvePdsHost, normaliseRef } from "./pds";
import { fetchEndorserRecords } from "./endorsers";
import { asNumber, formatNumber, formatDate, formatDateTime, formatCountry } from "./format";
import { normalizeKnownWorkScopeKey } from "./work-scope-labels";
import { hasMaEarthDonationUrl } from "./maearth-donation-data";

// ── Generic GraphQL helper ────────────────────────────────────────────────

type GqlResponse<T> = { data?: T | null; errors?: Array<{ message: string }> };

export async function indexerQuery<T>(
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

type CertifiedProfileData = {
  displayName?: string | null;
  avatar?: { image?: { ref?: string | null } | null } | null;
} | null;

const CERTIFIED_PROFILE_DATA_FIELDS = `
  certifiedProfileData {
    displayName
    avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
  }
`;

function profileName(profile?: CertifiedProfileData): string | null {
  return profile?.displayName?.trim() || null;
}

function profileAvatarRef(profile?: CertifiedProfileData): string | null {
  return normaliseRef(profile?.avatar?.image?.ref);
}

type StatsPage<N> = {
  nodes: N[];
  totalCount: number | null;
  cursor: string | null;
  hasMore: boolean;
};

const RESOLVE_CONCURRENCY = 8;
const SITE_IMAGE_RESOLVE_LIMIT = 96;
const TOTAL_STATS_CACHE_MS = PUBLIC_EXPLORE_CACHE_TTL_MS;

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

type MediaKind = "image" | "audio" | "video" | "spectrogram";

export type OccurrenceRecord = {
  kind: "occurrence";
  id: string;
  did: string;
  rkey: string;
  cid: string | null;
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
  stateProvince: string | null;
  locality: string | null;
  lat: number | null;
  lon: number | null;
  /** DwC coordinateUncertaintyInMeters — radius of the location's circle. Set
   *  when a record's coordinates were generalised (e.g. privacy-fuzzed), so the
   *  map can draw the approximate area rather than a misleadingly precise pin. */
  coordinateUncertaintyInMeters: number | null;
  eventDate: string | null;
  habitat: string | null;
  siteRef: string | null;
  datasetRef: string | null;
  datasetName: string | null;
  dynamicProperties: string | null;
  establishmentMeans: string | null;
  createdAt: string;
  creatorName: string | null;
  creatorAvatarRef: string | null;
  remarks: string | null;
  imageUrl: string | null;
  /** Photo or spectrogram blob ref (CID), resolved by visible cards so the
   *  first list page can appear without waiting for every image host lookup. */
  imageRef: string | null;
  /** Audio evidence blob ref (CID), resolved to a PDS blob URL on demand for
   *  inline playback. Null when the record carries no PDS-hosted audio. */
  audioRef: string | null;
  /** Older sightings sometimes carry a direct sound link instead of a blob ref. */
  audioUrl: string | null;
  /** Which media kinds the record carries (drives the card badges). */
  media: MediaKind[];
};

const OCCURRENCE_NODE_FIELDS = `
  did rkey uri cid createdAt eventDate
  ${CERTIFIED_PROFILE_DATA_FIELDS}
  scientificName vernacularName kingdom family genus
  basisOfRecord recordedBy individualCount
  datasetName country countryCode stateProvince locality decimalLatitude decimalLongitude coordinateUncertaintyInMeters
  habitat siteRef datasetRef dynamicProperties
  occurrenceRemarks fieldNotes
  thumbnailUrl speciesImageUrl associatedMedia
  imageEvidence { file { ref } }
  audioEvidence { file { ref } }
  videoEvidence { file { ref } }
  spectrogramEvidence { file { ref } }
`;

const OCCURRENCE_QUERY = `
  query ExplorerOccurrences($first: Int!, $after: String, $where: AppGainforestDwcOccurrenceWhereInput) {
    appGainforestDwcOccurrence(first: $first, after: $after, where: $where, sortBy: createdAt, sortDirection: DESC) {
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
  cid?: string | null;
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
  datasetName?: string | null;
  country?: string | null;
  countryCode?: string | null;
  stateProvince?: string | null;
  locality?: string | null;
  decimalLatitude?: number | string | null;
  decimalLongitude?: number | string | null;
  coordinateUncertaintyInMeters?: number | string | null;
  habitat?: string | null;
  siteRef?: string | null;
  datasetRef?: string | null;
  dynamicProperties?: string | null;
  establishmentMeans?: string | null;
  occurrenceRemarks?: string | null;
  fieldNotes?: string | null;
  thumbnailUrl?: string | null;
  speciesImageUrl?: string | null;
  associatedMedia?: string | null;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
  audioEvidence?: { file?: { ref?: string | null } | null } | null;
  videoEvidence?: { file?: { ref?: string | null } | null } | null;
  spectrogramEvidence?: { file?: { ref?: string | null } | null } | null;
  certifiedProfileData?: CertifiedProfileData;
};

function normaliseDriveDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("drive.google.com")) return url;
    const id = parsed.searchParams.get("id") ?? parsed.pathname.match(/\/d\/([^/]+)/)?.[1] ?? null;
    return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : url;
  } catch {
    return url;
  }
}

function associatedAudioUrl(n: RawOccurrence): string | null {
  const value = n.associatedMedia?.trim();
  if (!value) return null;
  // Some older sound sightings were imported as plain media links rather than
  // structured audio blobs. Direct sound-file URLs are handled here.
  if (/\.(?:mp3|m4a|wav|ogg|oga|flac|aac)(?:[?#]|$)/i.test(value)) {
    return normaliseDriveDownloadUrl(value);
  }
  return null;
}

function mapOccurrence(n: RawOccurrence): OccurrenceRecord {
  // Restor-sourced records carry an external photo URL (thumbnailUrl /
  // speciesImageUrl, the same S3 link) rather than a PDS blob — render it
  // directly, no getBlob round-trip needed.
  const externalImage = n.thumbnailUrl?.trim() || n.speciesImageUrl?.trim() || null;
  const externalAudio = associatedAudioUrl(n);
  const media: MediaKind[] = [];
  if (n.imageEvidence?.file?.ref || externalImage) media.push("image");
  if (n.audioEvidence?.file?.ref || externalAudio) media.push("audio");
  if (n.videoEvidence?.file?.ref) media.push("video");
  if (n.spectrogramEvidence?.file?.ref) media.push("spectrogram");
  const imageRef = normaliseRef(n.imageEvidence?.file?.ref) ?? normaliseRef(n.spectrogramEvidence?.file?.ref);
  return {
    kind: "occurrence",
    id: `${n.did}-${n.rkey}`,
    did: n.did,
    rkey: n.rkey,
    cid: n.cid ?? null,
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
    stateProvince: n.stateProvince?.trim() || null,
    locality: n.locality?.trim() || null,
    lat: asNumber(n.decimalLatitude),
    lon: asNumber(n.decimalLongitude),
    coordinateUncertaintyInMeters: asNumber(n.coordinateUncertaintyInMeters),
    eventDate: n.eventDate?.trim() || null,
    habitat: n.habitat?.trim() || null,
    siteRef: n.siteRef?.trim() || null,
    datasetRef: n.datasetRef?.trim() || null,
    datasetName: n.datasetName?.trim() || null,
    dynamicProperties: n.dynamicProperties?.trim() || null,
    establishmentMeans: n.establishmentMeans?.trim() || null,
    createdAt: n.createdAt,
    creatorName: profileName(n.certifiedProfileData),
    creatorAvatarRef: profileAvatarRef(n.certifiedProfileData),
    remarks: n.occurrenceRemarks?.trim() || n.fieldNotes?.trim() || null,
    imageUrl: externalImage,
    imageRef,
    audioRef: normaliseRef(n.audioEvidence?.file?.ref),
    audioUrl: externalAudio,
    media,
  };
}

/** A `com.atproto.repo.listRecords` / `getRecord` item for an occurrence. */
type PdsOccurrenceItem = { uri: string; cid?: string | null; value: Record<string, unknown> };

function pdsString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pdsBlobRef(value: unknown): { file?: { ref?: string | null } | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const file = (value as Record<string, unknown>).file;
  if (typeof file !== "object" || file === null) return null;
  const ref = (file as Record<string, unknown>).ref;
  if (typeof ref === "string") return { file: { ref } };
  if (typeof ref === "object" && ref !== null && typeof (ref as Record<string, unknown>).$link === "string") {
    return { file: { ref: (ref as Record<string, unknown>).$link as string } };
  }
  return null;
}

/**
 * Map a raw PDS occurrence record straight into an `OccurrenceRecord`, so a
 * freshly written sighting can appear in listings before the indexer has
 * caught up. The PDS record is the source the indexer derives from, so the
 * shapes line up field-for-field (blob refs arrive as `{ $link }` objects
 * instead of bare CIDs, which is normalised here).
 */
export function occurrenceFromPdsRecord(item: PdsOccurrenceItem): OccurrenceRecord | null {
  const m = item.uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m || m[2] !== "app.gainforest.dwc.occurrence") return null;
  const value = item.value;
  const raw: RawOccurrence = {
    did: m[1],
    rkey: m[3],
    uri: item.uri,
    cid: item.cid ?? null,
    createdAt: pdsString(value.createdAt) ?? new Date().toISOString(),
    eventDate: pdsString(value.eventDate),
    scientificName: pdsString(value.scientificName),
    vernacularName: pdsString(value.vernacularName),
    kingdom: pdsString(value.kingdom),
    family: pdsString(value.family),
    genus: pdsString(value.genus),
    basisOfRecord: pdsString(value.basisOfRecord),
    recordedBy: pdsString(value.recordedBy),
    individualCount: typeof value.individualCount === "number" ? value.individualCount : null,
    datasetName: pdsString(value.datasetName),
    country: pdsString(value.country),
    countryCode: pdsString(value.countryCode),
    stateProvince: pdsString(value.stateProvince),
    locality: pdsString(value.locality),
    decimalLatitude: pdsString(value.decimalLatitude) ?? (typeof value.decimalLatitude === "number" ? value.decimalLatitude : null),
    decimalLongitude: pdsString(value.decimalLongitude) ?? (typeof value.decimalLongitude === "number" ? value.decimalLongitude : null),
    coordinateUncertaintyInMeters:
      pdsString(value.coordinateUncertaintyInMeters) ??
      (typeof value.coordinateUncertaintyInMeters === "number" ? value.coordinateUncertaintyInMeters : null),
    habitat: pdsString(value.habitat),
    siteRef: pdsString(value.siteRef),
    datasetRef: pdsString(value.datasetRef),
    dynamicProperties: pdsString(value.dynamicProperties),
    establishmentMeans: pdsString(value.establishmentMeans),
    occurrenceRemarks: pdsString(value.occurrenceRemarks),
    fieldNotes: pdsString(value.fieldNotes),
    thumbnailUrl: pdsString(value.thumbnailUrl),
    speciesImageUrl: pdsString(value.speciesImageUrl),
    associatedMedia: pdsString(value.associatedMedia),
    imageEvidence: pdsBlobRef(value.imageEvidence),
    audioEvidence: pdsBlobRef(value.audioEvidence),
    videoEvidence: pdsBlobRef(value.videoEvidence),
    spectrogramEvidence: pdsBlobRef(value.spectrogramEvidence),
  };
  return mapOccurrence(raw);
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
  // "audio" includes spectrogram-bearing records and older sound links too.
  return Boolean(n.audioEvidence?.file?.ref || n.spectrogramEvidence?.file?.ref || associatedAudioUrl(n));
}

/** Server-side `where` clauses for a media filter. The sound filter needs a
 *  few variants because older sightings store field recordings as plain media
 *  links instead of structured audio evidence, and this GraphQL layer does not
 *  expose an OR operator in the where input. */
function filterWhereVariants(media: OccurrenceFilter): Array<Record<string, unknown> | undefined> {
  if (media === "image") return [{ imageEvidence: { isNull: false } }];
  if (media === "audio") {
    return [
      { audioEvidence: { isNull: false } },
      { spectrogramEvidence: { isNull: false } },
      { associatedMedia: { contains: ".mp3" } },
      { associatedMedia: { contains: ".m4a" } },
      { associatedMedia: { contains: ".wav" } },
      { associatedMedia: { contains: ".ogg" } },
      { associatedMedia: { contains: ".flac" } },
    ];
  }
  return [undefined];
}

function occurrenceWhereVariants(
  media: OccurrenceFilter,
  query?: string,
  ownerDid?: string,
  badgeIndex?: FeaturedBadgeIndex,
  badgeFilters?: BumicertBadgeFilter[],
  createdAt?: { gte?: string; lte?: string },
): Record<string, unknown>[] {
  const ownerWhere = ownerDid ? { did: { eq: ownerDid } } : undefined;
  const createdWhere = createdAt ? { createdAt } : undefined;
  const badgeWheres = featuredBadgeRecordWhereVariants<Record<string, unknown>>(badgeIndex, "app.gainforest.dwc.occurrence", badgeFilters);
  if (badgeWheres.length === 0) return [];
  const bases = badgeWheres.flatMap((badgeWhere) => filterWhereVariants(media).map((base) => mergeWhere(ownerWhere, createdWhere, badgeWhere, base) ?? {}));
  const q = query?.trim();
  if (!q) return bases;
  const queryWheres = [
    { scientificName: { contains: q } },
    { vernacularName: { contains: q } },
    { family: { contains: q } },
    { country: { contains: q } },
    { locality: { contains: q } },
  ];
  return bases.flatMap((base) => queryWheres.map((where) => mergeWhere(base, where) ?? {}));
}

export type OccurrenceWalkResult = {
  records: OccurrenceRecord[];
  cursor: string | null;
  hasMore: boolean;
};

export type OccurrenceStats = {
  totalSightings: number | null;
  photoSightings: number | null;
  recentSightings: number | null;
  mappedSightings: number | null;
};

const OCCURRENCE_COUNT_QUERY = `
  query ExplorerOccurrenceCount($where: AppGainforestDwcOccurrenceWhereInput) {
    appGainforestDwcOccurrence(first: 0, where: $where) { totalCount }
  }
`;

const AUDIO_RECORDS_QUERY = `
  query ExplorerAudioRecords($first: Int!, $after: String, $where: AppGainforestAcAudioWhereInput) {
    appGainforestAcAudio(first: $first, after: $after, where: $where, sortBy: createdAt, sortDirection: DESC) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did rkey uri cid createdAt name occurrenceRef siteRef recordedBy
          ${CERTIFIED_PROFILE_DATA_FIELDS}
          metadata { recordedAt duration sampleRate fileFormat }
        }
      }
    }
  }
`;

const AUDIO_BY_URI_QUERY = `
  query ExplorerAudioByUri($uri: String!) {
    appGainforestAcAudioByUri(uri: $uri) {
      did rkey uri cid createdAt name occurrenceRef siteRef recordedBy
      ${CERTIFIED_PROFILE_DATA_FIELDS}
      metadata { recordedAt duration sampleRate fileFormat }
    }
  }
`;

async function fetchOccurrenceCountUncached(where?: Record<string, unknown>): Promise<number | null> {
  const data = await indexerQuery<{
    appGainforestDwcOccurrence?: { totalCount?: number | null } | null;
  }>(OCCURRENCE_COUNT_QUERY, { where: where ?? null });
  return data?.appGainforestDwcOccurrence?.totalCount ?? null;
}

function fetchOccurrenceCountCached(
  key: string,
  where?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<number | null> {
  return cachedAsync(
    `occurrence-count:${key}`,
    TOTAL_STATS_CACHE_MS,
    () => fetchOccurrenceCountUncached(where),
    signal,
  );
}

type RawAudioRecord = {
  did: string;
  rkey: string;
  uri: string;
  cid: string;
  createdAt: string;
  name?: string | null;
  occurrenceRef?: string | null;
  siteRef?: string | null;
  recordedBy?: string | null;
  certifiedProfileData?: CertifiedProfileData;
  metadata?: {
    recordedAt?: string | null;
    duration?: string | null;
    sampleRate?: number | null;
    fileFormat?: string | null;
  } | null;
};

async function fetchAudioPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
  where?: Record<string, unknown>,
): Promise<{ nodes: RawAudioRecord[]; cursor: string | null; hasNextPage: boolean }> {
  const data = await indexerQuery<{
    appGainforestAcAudio?: Connection<RawAudioRecord>;
  }>(AUDIO_RECORDS_QUERY, { first, after, where: where ?? { blob: { isNull: false } } }, signal);
  const conn = data?.appGainforestAcAudio;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawAudioRecord => Boolean(n?.did));
  return {
    nodes,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasNextPage: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

function blobRefFromRecordValue(value: unknown): string | null {
  const blob = (value as {
    blob?: {
      ref?: string | { $link?: string | null } | null;
      file?: { ref?: string | { $link?: string | null } | null } | null;
    } | null;
  } | null)?.blob;
  const ref = blob?.ref ?? blob?.file?.ref;
  if (typeof ref === "string") return normaliseRef(ref);
  return normaliseRef(ref?.$link);
}

async function resolveAudioBlob(record: RawAudioRecord, signal?: AbortSignal): Promise<{ ref: string | null; url: string | null }> {
  const host = await resolvePdsHost(record.did, signal);
  if (!host) return { ref: null, url: null };
  try {
    const params = new URLSearchParams({
      repo: record.did,
      collection: "app.gainforest.ac.audio",
      rkey: record.rkey,
    });
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, { signal });
    if (!res.ok) return { ref: null, url: null };
    const json = (await res.json()) as { value?: unknown };
    const ref = blobRefFromRecordValue(json.value);
    return ref ? { ref, url: blobUrl(host, record.did, ref) } : { ref: null, url: null };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return { ref: null, url: null };
  }
}

function mapAudioRecord(n: RawAudioRecord, audioRef: string | null, audioUrl: string | null): OccurrenceRecord {
  const duration = n.metadata?.duration ? `${Math.round(Number(n.metadata.duration))} seconds` : null;
  const format = n.metadata?.fileFormat ? `${n.metadata.fileFormat} field sound` : "Nature sound recording";
  return {
    kind: "occurrence",
    id: `${n.did}-audio-${n.rkey}`,
    did: n.did,
    rkey: n.rkey,
    cid: n.cid ?? null,
    atUri: n.uri || `at://${n.did}/app.gainforest.ac.audio/${n.rkey}`,
    scientificName: n.name?.trim() || null,
    vernacularName: "Nature sound recording",
    kingdom: null,
    family: null,
    genus: null,
    basisOfRecord: "Field sound recording",
    recordedBy: n.recordedBy?.trim() || null,
    individualCount: null,
    country: null,
    countryCode: null,
    stateProvince: null,
    locality: null,
    lat: null,
    lon: null,
    coordinateUncertaintyInMeters: null,
    eventDate: n.metadata?.recordedAt ?? null,
    habitat: null,
    siteRef: n.siteRef?.trim() || null,
    datasetRef: null,
    datasetName: null,
    dynamicProperties: null,
    establishmentMeans: null,
    createdAt: n.createdAt,
    creatorName: profileName(n.certifiedProfileData),
    creatorAvatarRef: profileAvatarRef(n.certifiedProfileData),
    remarks: [format, duration].filter(Boolean).join(" · ") || null,
    imageUrl: null,
    imageRef: null,
    audioRef,
    audioUrl,
    media: ["audio"],
  };
}

async function mapAudioRecords(nodes: RawAudioRecord[], signal?: AbortSignal): Promise<OccurrenceRecord[]> {
  const out: OccurrenceRecord[] = new Array(nodes.length);
  let cursor = 0;
  async function worker() {
    while (cursor < nodes.length) {
      const i = cursor++;
      const node = nodes[i]!;
      const audio = await resolveAudioBlob(node, signal);
      out[i] = mapAudioRecord(node, audio.ref, audio.url);
    }
  }
  await Promise.all(Array.from({ length: Math.min(RESOLVE_CONCURRENCY, nodes.length) }, worker));
  return out;
}

async function walkAudioRecords(opts: {
  target: number;
  after: string | null;
  query?: string;
  ownerDid?: string;
  badgeIndex?: FeaturedBadgeIndex;
  badgeFilters?: BumicertBadgeFilter[];
  signal?: AbortSignal;
  onProgress?: (records: OccurrenceRecord[]) => void;
}): Promise<OccurrenceWalkResult> {
  const q = opts.query?.trim();
  const ownerWhere = opts.ownerDid ? { did: { eq: opts.ownerDid } } : undefined;
  const baseWhere = mergeWhere(ownerWhere, q ? { name: { contains: q } } : undefined, { blob: { isNull: false } }) ?? { blob: { isNull: false } };
  const badgeWheres = featuredBadgeRecordWhereVariants<Record<string, unknown>>(opts.badgeIndex, "app.gainforest.ac.audio", opts.badgeFilters);
  if (badgeWheres.length === 0) return { records: [], cursor: null, hasMore: false };
  const variants = badgeWheres.map((badgeWhere) => mergeWhere(baseWhere, badgeWhere) ?? baseWhere);

  const walkOne = async (where: Record<string, unknown>, after: string | null): Promise<OccurrenceWalkResult> => {
    const collected: OccurrenceRecord[] = [];
    let cursor: string | null = after;
    let hasNextPage = true;
    while (collected.length < opts.target) {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const page = await fetchAudioPage(Math.min(INDEXER_MAX_PAGE, Math.max(opts.target, 24)), cursor, opts.signal, where);
      cursor = page.cursor;
      hasNextPage = page.hasNextPage;
      // Map the whole fetched page — the cursor already points past all of it,
      // so slicing to the target would permanently skip the remainder.
      const mapped = await mapAudioRecords(page.nodes, opts.signal);
      collected.push(...mapped);
      opts.onProgress?.([...collected]);
      if (!hasNextPage || !cursor) break;
    }
    return { records: collected, cursor, hasMore: hasNextPage && Boolean(cursor) };
  };

  if (variants.length === 1) return walkOne(variants[0]!, opts.after);

  const previous = parseMultiCursor(opts.after, variants.length);
  const pages = await Promise.all(
    variants.map((where, index) => {
      if (!previous.more[index]) return Promise.resolve({ records: [], cursor: null, hasMore: false } satisfies OccurrenceWalkResult);
      return walkOne(where, previous.cursors[index] ?? null);
    }),
  );
  const seen = new Map<string, OccurrenceRecord>();
  for (const record of pages.flatMap((page) => page.records)) seen.set(record.id, record);
  const records = [...seen.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return {
    records,
    cursor: encodeMultiCursor({ cursors: pages.map((page) => page.cursor), more: pages.map((page) => page.hasMore) }),
    hasMore: pages.some((page) => page.hasMore),
  };
}

async function fetchOccurrenceStatsUncached(signal?: AbortSignal): Promise<OccurrenceStats> {
  // Do these one at a time. Running count scans in one request (or in parallel
  // requests) makes this large sightings stream much slower and can compete
  // with the first card page.
  const totalSightings = await fetchOccurrenceCountCached("total", undefined, signal);
  const photoSightings = await fetchOccurrenceCountCached("photos", { imageEvidence: { isNull: false } }, signal);
  const recentSince = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const recentSightings = await fetchOccurrenceCountCached(`recent:${recentSince.slice(0, 10)}`, { createdAt: { gte: recentSince } }, signal);
  const mappedSightings = await fetchOccurrenceCountCached("mapped", { decimalLatitude: { isNull: false } }, signal);

  return { totalSightings, photoSightings, recentSightings, mappedSightings };
}

export async function fetchOccurrenceStats(signal?: AbortSignal): Promise<OccurrenceStats> {
  return publicExploreCache("occurrence-stats", {}, () => fetchOccurrenceStatsUncached(), signal);
}

type OccurrenceTotalCountOptions = {
  media: OccurrenceFilter;
  query?: string;
  ownerDid?: string;
  featuredBadgesOnly?: boolean;
  badgeFilters?: BumicertBadgeFilter[];
  signal?: AbortSignal;
};

export async function fetchOccurrenceTotalCount(options: OccurrenceTotalCountOptions): Promise<number> {
  if (!options.ownerDid) {
    const { signal, ...cacheOptions } = options;
    return publicExploreCache(
      "occurrence-total-count",
      cacheOptions,
      () => fetchOccurrenceTotalCountUncached({ ...cacheOptions, signal: undefined }),
      signal,
    );
  }
  return fetchOccurrenceTotalCountUncached(options);
}

async function fetchOccurrenceTotalCountUncached(options: OccurrenceTotalCountOptions): Promise<number> {
  const badgeIndex = options.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(options.signal) : undefined;
  const variants = occurrenceWhereVariants(options.media, options.query, options.ownerDid, badgeIndex, options.badgeFilters);
  if (variants.length === 0) return 0;
  const hidden = await hiddenDidsForScope(Boolean(options.ownerDid), options.signal);

  const seen = new Set<string>();
  for (const where of variants) {
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const page = await fetchOccurrencePage(INDEXER_MAX_PAGE, cursor, options.signal, where);
      for (const node of page.nodes) {
        if (hidden.has(node.did)) continue;
        if (matchesFilter(node, options.media)) seen.add(node.uri || `at://${node.did}/app.gainforest.dwc.occurrence/${node.rkey}`);
      }
      cursor = page.cursor;
      hasMore = page.hasNextPage && Boolean(page.cursor);
    }
  }

  if (options.media === "audio") {
    const audioPage = await walkAudioRecordIdsForCount(options, badgeIndex, hidden);
    for (const id of audioPage) seen.add(id);
  }

  return seen.size;
}

async function walkAudioRecordIdsForCount(
  options: {
    query?: string;
    ownerDid?: string;
    badgeFilters?: BumicertBadgeFilter[];
    signal?: AbortSignal;
  },
  badgeIndex?: FeaturedBadgeIndex,
  hidden: ReadonlySet<string> = EMPTY_DID_SET,
): Promise<Set<string>> {
  const q = options.query?.trim();
  const ownerWhere = options.ownerDid ? { did: { eq: options.ownerDid } } : undefined;
  const baseWhere = mergeWhere(ownerWhere, q ? { name: { contains: q } } : undefined, { blob: { isNull: false } }) ?? { blob: { isNull: false } };
  const badgeWheres = featuredBadgeRecordWhereVariants<Record<string, unknown>>(badgeIndex, "app.gainforest.ac.audio", options.badgeFilters);
  const seen = new Set<string>();
  for (const badgeWhere of badgeWheres) {
    const where = mergeWhere(baseWhere, badgeWhere) ?? baseWhere;
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const page = await fetchAudioPage(INDEXER_MAX_PAGE, cursor, options.signal, where);
      for (const node of page.nodes) {
        if (hidden.has(node.did)) continue;
        seen.add(node.uri || `at://${node.did}/app.gainforest.ac.audio/${node.rkey}`);
      }
      cursor = page.cursor;
      hasMore = page.hasNextPage && Boolean(page.cursor);
    }
  }
  return seen;
}

/**
 * Progressively walk the occurrence connection, collecting up to `target`
 * records matching the media filter and emitting them via `onProgress` as each
 * page resolves. The "image" filter pushes a presence `where` clause to the
 * indexer. The "audio" filter tries each known sound storage shape because
 * older sound sightings were imported as plain media links, not structured
 * audio evidence. "all" still pages client-side. PDS blob refs can be resolved
 * per page, or returned as refs for visible cards to resolve lazily; external
 * thumbnails (on the sparser Restor records) render immediately. Returns the
 * final cursor + `hasMore` so "load more" continues from where it stopped.
 */
type OccurrenceWalkOptions = {
  media: OccurrenceFilter;
  target: number;
  after: string | null;
  query?: string;
  ownerDid?: string;
  maxPages?: number;
  onProgress?: (records: OccurrenceRecord[]) => void;
  signal?: AbortSignal;
  resolveMedia?: boolean;
  featuredBadgesOnly?: boolean;
  badgeFilters?: BumicertBadgeFilter[];
  createdAt?: { gte?: string; lte?: string };
};

export async function walkOccurrences(opts: OccurrenceWalkOptions): Promise<OccurrenceWalkResult> {
  if (!opts.ownerDid) {
    const { signal, onProgress, ...cacheOptions } = opts;
    const rawPromise = publicExploreCache(
      "occurrences-page",
      cacheOptions,
      () => walkOccurrencesUncached({ ...cacheOptions, signal: undefined, onProgress: undefined }),
      signal,
    );
    // Drop records owned by flagged test accounts. The unfiltered page stays in
    // the shared cache; hiding is applied per-read from the short-lived hidden
    // set, so a steward's flag takes effect without busting the page cache.
    const pagePromise = rawPromise.then(async (page) => {
      const [hidden, hiddenRecords] = await Promise.all([
        hiddenDidsForScope(false, signal),
        hiddenRecordUrisForScope(false, signal),
      ]);
      if (hidden.size === 0 && hiddenRecords.size === 0) return page;
      return {
        ...page,
        records: page.records.filter((record) => !hidden.has(record.did) && !hiddenRecords.has(record.atUri)),
      };
    });
    if (onProgress) void pagePromise.then((page) => onProgress(page.records)).catch(() => {});
    return pagePromise;
  }

  return walkOccurrencesUncached(opts);
}

async function walkOccurrencesUncached(opts: OccurrenceWalkOptions): Promise<OccurrenceWalkResult> {
  const { media, target, signal } = opts;
  const badgeIndex = opts.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : undefined;
  const whereVariants = occurrenceWhereVariants(media, opts.query, opts.ownerDid, badgeIndex, opts.badgeFilters, opts.createdAt);
  if (whereVariants.length === 0) return { records: [], cursor: null, hasMore: false };

  async function walkOne(where: Record<string, unknown> | undefined, after: string | null): Promise<OccurrenceWalkResult> {
    // With a server-side filter every returned node already matches, so the
    // target is reached in one or two pages — no need for the deep imageless walk.
    const hasServerWhere = Boolean(where && Object.keys(where).length > 0);
    const maxPages = opts.maxPages ?? (hasServerWhere ? 5 : MAX_WALK_PAGES);
    const pageSize = Math.min(INDEXER_MAX_PAGE, Math.max(target, 24));

    const collected: OccurrenceRecord[] = [];
    let cursor: string | null = after;
    let hasNextPage = true;

    for (let page = 0; page < maxPages; page++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const res = await fetchOccurrencePage(pageSize, cursor, signal, where);
      cursor = res.cursor;
      hasNextPage = res.hasNextPage;

      const matches = res.nodes.filter((n) => matchesFilter(n, media));
      if (matches.length > 0) {
        // Keep EVERY match from this page: the cursor has already advanced past
        // the whole raw page, so any match we drop now would be skipped forever
        // on the next paginated call. `target` is a minimum, not a cap.
        const startIndex = collected.length;
        const mapped = matches.map(mapOccurrence);
        collected.push(...mapped);
        opts.onProgress?.([...collected]);

        if (opts.resolveMedia !== false) {
          const resolved = await resolveImages(
            mapped,
            (r) => {
              // External-thumbnail records already have a usable imageUrl; only PDS
              // blob evidence needs a getBlob resolution.
              if (r.imageUrl || !r.imageRef) return null;
              return { did: r.did, ref: r.imageRef };
            },
            (r, url) => ({ ...r, imageUrl: url }),
            signal,
          );
          for (let index = 0; index < resolved.length && startIndex + index < collected.length; index += 1) {
            collected[startIndex + index] = resolved[index]!;
          }
          opts.onProgress?.([...collected]);
        }
      }

      if (collected.length >= target || !hasNextPage || !cursor) break;
    }

    return {
      records: collected,
      cursor,
      hasMore: hasNextPage && Boolean(cursor),
    };
  }

  if (whereVariants.length === 1) {
    const page = await walkOne(whereVariants[0], opts.after);
    opts.onProgress?.(page.records);
    return page;
  }

  const includeAudioRecords = media === "audio";
  const streamCount = whereVariants.length + (includeAudioRecords ? 1 : 0);
  const previous = parseMultiCursor(opts.after, streamCount);
  const pages = await Promise.all([
    ...whereVariants.map((where, index) => {
      if (!previous.more[index]) return Promise.resolve({ records: [], cursor: null, hasMore: false } satisfies OccurrenceWalkResult);
      return walkOne(where, previous.cursors[index] ?? null);
    }),
    ...(includeAudioRecords
      ? [
          previous.more[whereVariants.length]
            ? walkAudioRecords({
                target,
                after: previous.cursors[whereVariants.length] ?? null,
                query: opts.query,
                ownerDid: opts.ownerDid,
                badgeIndex,
                badgeFilters: opts.badgeFilters,
                signal,
                onProgress: opts.onProgress,
              })
            : Promise.resolve({ records: [], cursor: null, hasMore: false } satisfies OccurrenceWalkResult),
        ]
      : []),
  ]);
  const seen = new Map<string, OccurrenceRecord>();
  for (const record of pages.flatMap((page) => page.records)) seen.set(record.id, record);
  const records = [...seen.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  opts.onProgress?.(records);
  return {
    records,
    cursor: encodeMultiCursor({ cursors: pages.map((page) => page.cursor), more: pages.map((page) => page.hasMore) }),
    hasMore: pages.some((page) => page.hasMore),
  };
}

export type ObservationSummary = {
  count: number;
  latestAt: string | null;
};

/** Count + most recent date of an organization's nature sightings — the
 *  evidence signal shown on Bumicert detail pages. One cheap indexer query. */
export async function fetchObservationSummaryByDid(
  did: string,
  signal?: AbortSignal,
): Promise<ObservationSummary> {
  const data = await indexerQuery<{
    appGainforestDwcOccurrence?: {
      totalCount?: number | null;
      edges?: Array<{ node?: { createdAt?: string | null } | null } | null> | null;
    } | null;
  }>(
    `query ObservationSummary($did: String!) {
      appGainforestDwcOccurrence(first: 1, where: { did: { eq: $did } }, sortBy: createdAt, sortDirection: DESC) {
        totalCount
        edges { node { createdAt } }
      }
    }`,
    { did },
    signal,
  );
  const conn = data?.appGainforestDwcOccurrence;
  return {
    count: conn?.totalCount ?? 0,
    latestAt: conn?.edges?.[0]?.node?.createdAt ?? null,
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
  cid: string | null;
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
  creatorName: string | null;
  creatorAvatarRef: string | null;
};

const ACTIVITY_NODE_FIELDS = `
  did rkey uri cid createdAt title shortDescription startDate endDate
  ${CERTIFIED_PROFILE_DATA_FIELDS}
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
  query ExplorerActivities(
    $first: Int!
    $after: String
    $where: OrgHypercertsClaimActivityWhereInput
    $sortBy: OrgHypercertsClaimActivitySortField
    $sortDirection: SortDirection
  ) {
    orgHypercertsClaimActivity(
      first: $first
      after: $after
      where: $where
      sortBy: $sortBy
      sortDirection: $sortDirection
    ) {
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

const ACTIVITY_COUNT_NODE_FIELDS = `
  did rkey uri title
`;

const ACTIVITY_MATCH_NODE_FIELDS = `
  did rkey uri title shortDescription startDate endDate
  contributors { contributorIdentity { __typename } }
  locations { uri }
  image {
    __typename
    ... on OrgHypercertsDefsUri { uri }
    ... on OrgHypercertsDefsSmallImage { image { ref } }
  }
`;

const ACTIVITY_COUNT_QUERY = `
  query ExplorerActivityCount(
    $first: Int!
    $after: String
    $where: OrgHypercertsClaimActivityWhereInput
  ) {
    orgHypercertsClaimActivity(
      first: $first
      after: $after
      where: $where
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${ACTIVITY_COUNT_NODE_FIELDS} } }
    }
  }
`;

const ACTIVITY_COUNT_BY_URI_QUERY = `
  query ExplorerActivityCountByUri($uri: String!) {
    orgHypercertsClaimActivityByUri(uri: $uri) { ${ACTIVITY_MATCH_NODE_FIELDS} }
  }
`;

const FUNDING_CONFIG_QUERY = `
  query ExplorerFundingConfigs($first: Int!, $after: String) {
    appGainforestFundingConfig(
      first: $first
      after: $after
      where: { receivingWallet: { isNull: false } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did rkey uri status
          ${CERTIFIED_PROFILE_DATA_FIELDS}
          receivingWallet { ... on AppGainforestFundingConfigEvmLinkRef { uri } }
        }
      }
    }
  }
`;

export type BumicertBadgeFilter = "gainforest" | "maearth" | "maearth-round-1" | "maearth-round-2" | "maearth-round-3" | "published";
export type TrustedOrganizationBadge = "gainforest";

const FEATURED_BADGES: Array<{ key: BumicertBadgeFilter; title: string }> = [
  { key: "gainforest", title: "GainForest" },
  // Self-serve publishing (Manage → Projects → Publish) awards this badge so
  // the account shows on the public explore pages. It is deliberately a
  // SEPARATE key from "gainforest": published orgs become visible, but they
  // don't match the GainForest source chip and never read "Trusted by
  // GainForest" (see `app/_lib/publish-org.ts`).
  { key: "published", title: "Published on GainForest" },
  { key: "maearth", title: "Ma Earth" },
  { key: "maearth-round-1", title: "Ma Earth Round 1" },
  { key: "maearth-round-2", title: "Ma Earth Round 2" },
  // Round 3 is open for applications; no badge definition/awards exist yet, so
  // filtering to it returns nothing until Ma Earth verifies the round. Listed
  // here so it lights up automatically once that badge lands in the repo.
  { key: "maearth-round-3", title: "Ma Earth Round 3" },
];
const FEATURED_BADGE_KEYS = new Set(FEATURED_BADGES.map((badge) => badge.key));
const FEATURED_BADGE_KEY_BY_TITLE = new Map(
  FEATURED_BADGES.map((badge) => [normalizeFeaturedBadgeTitle(badge.title), badge.key]),
);

/**
 * Organizations whose `app.certified.badge.award` records we honor as
 * "Trusted by" signals. We read awards from each issuer's repo and attribute
 * the badge to whoever *signed the award* — not to the repo that happens to
 * host the badge *definition*. (An endorser like Biome Trust signs awards
 * against a definition that may live in another org's repo; the endorsement is
 * theirs, so it must read as "Trusted by ⟨that org⟩".)
 *
 * `mode: "title"` issuers host a family of branded badges in one repo and are
 * split by the badge-definition title (GainForest vs. Ma Earth). Their awards
 * against an *endorsement-typed* definition (which may live in another org's
 * repo — the platform's shared "Organization Endorsement" badge does) are
 * attributed to the issuer's own `endorsementBrand`, so a GainForest-signed
 * endorsement reads "Trusted by GainForest". `mode: "fixed"` issuers attribute
 * *every* award they sign to a single brand, regardless of which definition it
 * points at.
 *
 * Only GainForest is built in (it ships with bundled logos for its two
 * brands). Every other endorser — Biome Trust included — is managed from the
 * admin panel and stored in the moderation repo (see `getTrustedIssuers` /
 * `app/_lib/endorsers.ts`) and renders from its own certified profile.
 */
type BuiltinTrustedIssuer =
  | { did: string; mode: "title"; endorsementBrand: BumicertBadgeFilter }
  | { did: string; mode: "fixed"; badge: BumicertBadgeFilter };

const BUILTIN_TRUSTED_ISSUERS: BuiltinTrustedIssuer[] = [
  // GainForest's certified repo hosts the GainForest + Ma Earth badge family.
  // It's the only built-in issuer; all other endorsers are admin-managed.
  { did: "did:plc:yjck2sybksyigp3zvbq7bfki", mode: "title", endorsementBrand: "gainforest" },
];

/** Metadata for a dynamic (admin-added) endorser. Its "Trusted by" emblem is
 *  rendered from the endorser's own profile instead of a bundled logo, so we
 *  carry enough here to label and link it. The brand `key` is the endorser DID. */
type EndorserMeta = { key: string; label: string; endorserDid: string; endorserHandle: string | null };

/** A trusted issuer resolved for an index build: a built-in brand family, or a
 *  dynamic endorser whose brand key is its own DID. */
type ResolvedTrustedIssuer =
  | { did: string; mode: "title"; endorsementBrand: BumicertBadgeFilter }
  | { did: string; mode: "fixed"; badge: string; endorser: EndorserMeta | null };

const BUILTIN_ISSUER_DIDS = new Set(BUILTIN_TRUSTED_ISSUERS.map((issuer) => issuer.did));

/**
 * Built-in issuers plus the admin-managed endorser allow-list. Reading the
 * endorser records is a couple of listRecords calls against the moderation
 * repo; it runs once per featured-badge-index cache miss, so added endorsers
 * take effect within the index's cache TTL.
 */
async function getTrustedIssuers(signal?: AbortSignal): Promise<ResolvedTrustedIssuer[]> {
  const builtins: ResolvedTrustedIssuer[] = BUILTIN_TRUSTED_ISSUERS.map((issuer) =>
    issuer.mode === "title"
      ? { did: issuer.did, mode: "title", endorsementBrand: issuer.endorsementBrand }
      : { did: issuer.did, mode: "fixed", badge: issuer.badge, endorser: null },
  );
  const records = await fetchEndorserRecords(GAINFOREST_MODERATION_REPO_DID, signal).catch(() => []);
  const seen = new Set<string>(BUILTIN_ISSUER_DIDS);
  const dynamic: ResolvedTrustedIssuer[] = [];
  for (const record of records) {
    if (seen.has(record.subjectDid)) continue;
    seen.add(record.subjectDid);
    dynamic.push({
      did: record.subjectDid,
      mode: "fixed",
      badge: record.subjectDid,
      endorser: {
        key: record.subjectDid,
        label: record.label,
        endorserDid: record.subjectDid,
        endorserHandle: record.handle,
      },
    });
  }
  return [...builtins, ...dynamic];
}

// Every brand key the featured-badge index seeds up front: the title-mapped
// GainForest/Ma Earth family plus the built-in fixed-issuer brands. Dynamic
// endorser brands (keyed by DID) are added to the index at build time.
const FEATURED_BADGE_KEY_LIST: BumicertBadgeFilter[] = Array.from(
  new Set<BumicertBadgeFilter>([
    ...FEATURED_BADGES.map((badge) => badge.key),
    ...BUILTIN_TRUSTED_ISSUERS.flatMap((issuer) => (issuer.mode === "fixed" ? [issuer.badge] : [])),
  ]),
);
const FEATURED_BADGE_INDEX_CACHE_MS = PUBLIC_EXPLORE_CACHE_TTL_MS;
const FEATURED_BADGE_FILTER_IN_LIMIT = 100;

const FEATURED_BADGE_INDEX_QUERY = `
  query ExplorerFeaturedBadgeIndex($repo: String!, $first: Int!, $afterDefinitions: String, $afterAwards: String) {
    appCertifiedBadgeDefinition(
      first: $first
      after: $afterDefinitions
      where: { did: { eq: $repo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri title } }
    }
    appCertifiedBadgeAward(
      first: $first
      after: $afterAwards
      where: { did: { eq: $repo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          badge { uri }
          subject {
            __typename
            ... on AppCertifiedDefsDid { did }
            ... on ComAtprotoRepoStrongRef { uri }
          }
        }
      }
    }
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
  cid?: string | null;
  createdAt: string;
  title?: string | null;
  shortDescription?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  contributors?: Array<unknown> | null;
  locations?: Array<{ uri?: string | null }> | null;
  workScope?: { __typename?: string; scope?: string | null; expression?: string | null } | null;
  image?: RawActivityImage;
  certifiedProfileData?: CertifiedProfileData;
};

type RawActivityCountIdentity = Pick<RawActivity, "did" | "rkey" | "uri">;
type RawActivityCount = RawActivityCountIdentity & Pick<RawActivity, "title">;
type RawActivityMatch = RawActivityCountIdentity & Pick<RawActivity, "title" | "shortDescription" | "startDate" | "endDate" | "contributors" | "locations" | "image">;

type RawFundingConfig = {
  did: string;
  rkey: string;
  uri: string;
  status?: string | null;
  certifiedProfileData?: CertifiedProfileData;
  receivingWallet?: { uri?: string | null } | null;
};

type RawFeaturedBadgeDefinition = {
  uri?: string | null;
  title?: string | null;
};

type RawFeaturedBadgeAward = {
  badge?: { uri?: string | null } | null;
  subject?: ({ __typename?: string; did?: string | null; uri?: string | null }) | null;
};

type FeaturedBadgeValues = {
  dids: string[];
  recordUris: string[];
};

type FeaturedBadgeIndex = FeaturedBadgeValues & {
  // Keyed by brand: built-in keys (gainforest / maearth / …) plus
  // dynamic endorser brands keyed by the endorser's DID.
  byBadge: Record<string, FeaturedBadgeValues>;
  // Dynamic (admin-added) endorsers present in this index, for emblem rendering.
  endorsers: EndorserMeta[];
};

type FeaturedBadgeIndexPayload = {
  appCertifiedBadgeDefinition?: Connection<RawFeaturedBadgeDefinition> | null;
  appCertifiedBadgeAward?: Connection<RawFeaturedBadgeAward> | null;
};

function splitWorkScopeString(value?: string | null): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractWorkScopeTags(workScope?: { __typename?: string; scope?: string | null; expression?: string | null } | null): string[] {
  const stringTags = splitWorkScopeString(workScope?.scope);
  const candidates = stringTags.length > 0
    ? stringTags
    : [...(workScope?.expression ?? "").matchAll(/(["'])(.*?)\1/g)].map((match) => match[2]?.trim() ?? "");

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of candidates) {
    const tag = normalizeScopeTag(candidate);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

/** "⭔ 24164249 ha" → "⭔ 24.2M ha"; obviously bad areas are dropped. */
const AREA_SCOPE_TAG_RE = /^([\u2b12-\u2b59]\s*)?([\d,.]+)\s*(ha|hectares?)\.?$/i;
/** Larger than any country's land area — clearly bad data, not a claim. */
const MAX_PLAUSIBLE_AREA_HA = 1.5e9;

const MAX_SCOPE_TAG_LENGTH = 40;
const MAX_SCOPE_TAG_WORDS = 4;
const SENTENCE_SCOPE_TAG_RE = /[.!?:]/;

function isTagLikeScopeValue(tag: string): boolean {
  const trimmed = tag.trim();
  if (!trimmed) return false;
  if (normalizeKnownWorkScopeKey(trimmed)) return true;
  if (AREA_SCOPE_TAG_RE.test(trimmed)) return true;
  if (trimmed.length > MAX_SCOPE_TAG_LENGTH) return false;
  if (SENTENCE_SCOPE_TAG_RE.test(trimmed)) return false;
  const words = trimmed.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length > 0 && words.length <= MAX_SCOPE_TAG_WORDS;
}

function normalizeScopeTag(tag: string): string | null {
  const trimmed = tag.trim();
  if (!trimmed) return null;
  const area = trimmed.match(AREA_SCOPE_TAG_RE);
  if (area) {
    const value = Number.parseFloat((area[2] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0 || value > MAX_PLAUSIBLE_AREA_HA) return null;
    const formatted = new Intl.NumberFormat("en", {
      notation: value >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(value);
    return `${(area[1] ?? "").trim() || "⬡"} ${formatted} ha`;
  }
  if (!isTagLikeScopeValue(trimmed)) return null;
  return normalizeKnownWorkScopeKey(trimmed) ?? trimmed;
}

/**
 * Creation-wizard placeholder copy that leaked into live records. Rendering it
 * as a real description makes the catalog look auto-generated, so treat these
 * as "no description". Matched case-insensitively against the trimmed start.
 */
const PLACEHOLDER_DESCRIPTION_PATTERNS: RegExp[] = [
  /^inspire others to support you\./i,
  /^share your (story|vision), build your community$/i,
  /^project story$/i,
  /^why we care$/i,
];

/**
 * Records imported from other platforms sometimes carry raw HTML in their
 * short description (`<p><strong>Help Zeb…`). Every consumer renders these as
 * plain text, so strip the markup down to readable text. Only kicks in when
 * the value actually looks like HTML, so legit angle brackets survive.
 */
function stripHtml(value: string): string {
  if (!/<[a-z!/]/i.test(value)) return value;
  return value
    .replace(/<\s*(?:br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeShortDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
  return stripHtml(trimmed) || null;
}

function normalizeFeaturedBadgeTitle(title: string | null | undefined): string {
  return (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort();
}

function chunkStrings(values: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function activityUriForDidRkey(did: string, rkey: string): string {
  return `at://${did}/org.hypercerts.claim.activity/${rkey}`;
}

const ENDORSEMENT_TYPED_DEFINITIONS_QUERY = `
  query TrustedIssuerEndorsementDefinitions($repos: [String!]!, $first: Int!, $after: String) {
    appCertifiedBadgeDefinition(
      first: $first
      after: $after
      where: { did: { in: $repos } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri badgeType } }
    }
  }
`;

type RawEndorsementTypedDefinition = { uri?: string | null; badgeType?: string | null };
type EndorsementTypedDefinitionsPayload = {
  appCertifiedBadgeDefinition?: Connection<RawEndorsementTypedDefinition> | null;
};

/** Of the given badge-definition URIs, the subset typed `endorsement` —
 *  resolved cross-repo through the index, mirroring how the public
 *  "Endorsements" profile tab classifies awards (endorsements-given.ts). */
async function fetchEndorsementTypedBadgeUris(
  candidateUris: Set<string>,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const result = new Set<string>();
  const repos = new Set<string>();
  for (const uri of candidateUris) {
    const match = uri.match(/^at:\/\/(did:[^/]+)\//);
    if (match) repos.add(match[1]);
  }
  if (repos.size === 0) return result;

  for (const repoChunk of chunkStrings([...repos], FEATURED_BADGE_FILTER_IN_LIMIT)) {
    let after: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const payload: EndorsementTypedDefinitionsPayload | null = await indexerQuery<EndorsementTypedDefinitionsPayload>(
        ENDORSEMENT_TYPED_DEFINITIONS_QUERY,
        { repos: repoChunk, first: INDEXER_MAX_PAGE, after },
        signal,
      );
      const connection: Connection<RawEndorsementTypedDefinition> | null | undefined = payload?.appCertifiedBadgeDefinition;
      for (const edge of connection?.edges ?? []) {
        const node = edge?.node;
        const uri = node?.uri ?? null;
        if (uri && candidateUris.has(uri) && node?.badgeType?.trim().toLowerCase() === "endorsement") {
          result.add(uri);
        }
      }
      after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor ?? null : null;
      if (!after) break;
    }
  }
  return result;
}

/** Page through one issuer repo's badge definitions + awards. Fixed-brand
 *  issuers attribute every award to one brand, so their definitions are
 *  skipped (`collectDefinitions: false`) — the badge may even be defined in a
 *  different repo. */
async function fetchIssuerBadgeRecords(
  repo: string,
  collectDefinitions: boolean,
  signal?: AbortSignal,
): Promise<{ definitions: RawFeaturedBadgeDefinition[]; awards: RawFeaturedBadgeAward[] }> {
  const definitions: RawFeaturedBadgeDefinition[] = [];
  const awards: RawFeaturedBadgeAward[] = [];
  let afterDefinitions: string | null = null;
  let afterAwards: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const shouldCollectDefinitions: boolean = collectDefinitions && (page === 0 || Boolean(afterDefinitions));
    const payload: FeaturedBadgeIndexPayload | null = await indexerQuery<FeaturedBadgeIndexPayload>(
      FEATURED_BADGE_INDEX_QUERY,
      {
        repo,
        first: INDEXER_MAX_PAGE,
        afterDefinitions,
        afterAwards,
      },
      signal,
    );

    const definitionsPage: Connection<RawFeaturedBadgeDefinition> | null | undefined = payload?.appCertifiedBadgeDefinition;
    const awardsPage: Connection<RawFeaturedBadgeAward> | null | undefined = payload?.appCertifiedBadgeAward;
    if (shouldCollectDefinitions) {
      definitions.push(...((definitionsPage?.edges ?? []).flatMap((edge: { node?: RawFeaturedBadgeDefinition | null } | null) => edge?.node ? [edge.node] : [])));
    }
    awards.push(...((awardsPage?.edges ?? []).flatMap((edge: { node?: RawFeaturedBadgeAward | null } | null) => edge?.node ? [edge.node] : [])));

    afterDefinitions = shouldCollectDefinitions && definitionsPage?.pageInfo?.hasNextPage ? definitionsPage.pageInfo.endCursor ?? null : null;
    afterAwards = awardsPage?.pageInfo?.hasNextPage ? awardsPage.pageInfo.endCursor ?? null : null;
    if (!afterDefinitions && !afterAwards) break;
  }

  return { definitions, awards };
}

async function fetchFeaturedBadgeIndexUncached(signal?: AbortSignal): Promise<FeaturedBadgeIndex> {
  const issuers = await getTrustedIssuers(signal);
  const dids: string[] = [];
  const recordUris: string[] = [];
  const byBadge: Record<string, { dids: string[]; recordUris: string[] }> = Object.fromEntries(
    FEATURED_BADGE_KEY_LIST.map((key) => [key, { dids: [] as string[], recordUris: [] as string[] }]),
  );
  const ensureBucket = (key: string) => (byBadge[key] ??= { dids: [], recordUris: [] });
  const endorsers: EndorserMeta[] = [];

  for (const issuer of issuers) {
    // Dynamic endorsers surface in the index even before their first award, so
    // the admin panel and emblem code can see them; seed the bucket + metadata.
    if (issuer.mode === "fixed" && issuer.endorser) {
      endorsers.push(issuer.endorser);
      ensureBucket(issuer.badge);
    }

    const { definitions, awards } = await fetchIssuerBadgeRecords(
      issuer.did,
      issuer.mode === "title",
      signal,
    );

    // Title issuers map each award to a brand via its definition's title;
    // fixed issuers attribute every award to a single brand.
    const keyByDefinitionUri = new Map<string, BumicertBadgeFilter>(
      issuer.mode === "title"
        ? definitions.flatMap((definition) => {
            const key = FEATURED_BADGE_KEY_BY_TITLE.get(normalizeFeaturedBadgeTitle(definition.title));
            return key && definition.uri ? [[definition.uri, key] as const] : [];
          })
        : [],
    );

    // A title issuer's endorsement awards may reference a definition hosted
    // in another org's repo (the shared "Organization Endorsement" badge).
    // Attribute those to the issuer's own brand so the endorsed org reads
    // "Trusted by GainForest" — consistent with fixed issuers, which get
    // credit for every award they sign.
    let endorsementTypedUris = new Set<string>();
    if (issuer.mode === "title") {
      const unmapped = new Set<string>();
      for (const award of awards) {
        const uri = award.badge?.uri;
        if (uri && !keyByDefinitionUri.has(uri)) unmapped.add(uri);
      }
      endorsementTypedUris = await fetchEndorsementTypedBadgeUris(unmapped, signal).catch(() => new Set<string>());
    }

    for (const award of awards) {
      const badgeKey: string | undefined =
        issuer.mode === "fixed"
          ? issuer.badge
          : award.badge?.uri
            ? keyByDefinitionUri.get(award.badge.uri) ??
              (endorsementTypedUris.has(award.badge.uri) ? issuer.endorsementBrand : undefined)
            : undefined;
      if (!badgeKey) continue;
      const bucket = ensureBucket(badgeKey);
      const subject = award.subject;
      if (subject?.__typename === "AppCertifiedDefsDid" && subject.did) {
        dids.push(subject.did);
        bucket.dids.push(subject.did);
      } else if (subject?.__typename === "ComAtprotoRepoStrongRef" && subject.uri?.trim()) {
        const uri = subject.uri.trim();
        recordUris.push(uri);
        bucket.recordUris.push(uri);
      }
    }
  }

  return {
    dids: uniqueSorted(dids),
    recordUris: uniqueSorted(recordUris),
    byBadge: Object.fromEntries(
      Object.entries(byBadge).map(([key, values]) => [
        key,
        { dids: uniqueSorted(values.dids), recordUris: uniqueSorted(values.recordUris) },
      ]),
    ),
    endorsers,
  };
}

function fetchFeaturedBadgeIndex(signal?: AbortSignal): Promise<FeaturedBadgeIndex> {
  return publicExploreCache(
    "featured-badge-index",
    { version: "gainforest-maearth-endorsers:v8", ttl: FEATURED_BADGE_INDEX_CACHE_MS },
    // The featured-badge index is shared by count and list requests across the
    // public Explore pages. Keep the cached loader independent from any one
    // component effect's abort signal; otherwise an aborted count refresh can
    // cancel work that a still-current list request is awaiting.
    () => fetchFeaturedBadgeIndexUncached(),
    signal,
  );
}

/** A resolved "Trusted by" endorsement for a profile: either one of the three
 *  built-in brands (rendered from a bundled logo) or a dynamic admin-added
 *  endorser (rendered from its own certified profile). */
export type TrustedByEndorsement = {
  key: string;
  /** Set for the three built-in brands; null for dynamic endorsers. */
  builtin: TrustedOrganizationBadge | null;
  label: string;
  endorserDid: string | null;
  endorserHandle: string | null;
};

export async function fetchTrustedByEndorsements(
  did: string,
  signal?: AbortSignal,
): Promise<TrustedByEndorsement[]> {
  if (!did.startsWith("did:")) return [];
  const index = await fetchFeaturedBadgeIndex(signal);
  const includes = (key: string) => index.byBadge[key]?.dids.includes(did) ?? false;
  const endorsements: TrustedByEndorsement[] = [];
  if (includes("gainforest")) {
    endorsements.push({ key: "gainforest", builtin: "gainforest", label: "GainForest", endorserDid: null, endorserHandle: null });
  }
  // "Trusted by" is driven entirely by the admin-managed endorsers list: the
  // built-in GainForest entry above plus the dynamic endorsers below. Ma Earth
  // is NOT an endorser — its umbrella "came through Ma Earth" badge is
  // participation, not an endorsement — so it isn't in that list and never
  // shows here. An org's Ma Earth rounds are surfaced explicitly in the
  // "Ma Earth" section on its Overview tab instead (AccountMaEarthRoundsSection).
  // The maearth badge index itself stays populated (globe roster, round section,
  // and the Explore "Ma Earth" filter all still read it).
  // Dynamic endorsers (incl. Biome Trust), in the order the moderation repo lists them.
  for (const endorser of index.endorsers) {
    if (index.byBadge[endorser.key]?.dids.includes(did)) {
      endorsements.push({
        key: endorser.key,
        builtin: null,
        label: endorser.label,
        endorserDid: endorser.endorserDid,
        endorserHandle: endorser.endorserHandle,
      });
    }
  }
  return endorsements;
}

/** The Ma Earth funding rounds, mapped to their per-round badge keys. Round 3
 *  is open for applications but has no awards yet, so it only resolves once Ma
 *  Earth verifies it. Ordered so callers can render rounds ascending. */
const MA_EARTH_ROUND_BADGE_KEYS: Array<{ round: number; key: BumicertBadgeFilter }> = [
  { round: 1, key: "maearth-round-1" },
  { round: 2, key: "maearth-round-2" },
  { round: 3, key: "maearth-round-3" },
];

/** The specific Ma Earth funding rounds an account took part in, resolved from
 *  the per-round badge awards and returned as ascending round numbers (e.g.
 *  `[1, 2]`). Empty when the account carries no round-specific Ma Earth badge.
 *  An award subjects either a bare DID or a StrongRef to a record in the
 *  awardee's repo, so we honor both — mirroring `fetchMaEarthOrganizationDids`. */
export async function fetchAccountMaEarthRounds(
  did: string,
  signal?: AbortSignal,
): Promise<number[]> {
  if (!did.startsWith("did:")) return [];
  const index = await fetchFeaturedBadgeIndex(signal);
  const ownsBadge = (key: BumicertBadgeFilter): boolean => {
    const bucket = index.byBadge[key];
    if (!bucket) return false;
    if (bucket.dids.includes(did)) return true;
    return bucket.recordUris.some((uri) => uri.startsWith(`at://${did}/`));
  };
  return MA_EARTH_ROUND_BADGE_KEYS.filter(({ key }) => ownsBadge(key)).map(({ round }) => round);
}

/** DIDs of every organization carrying a Ma Earth badge (the umbrella badge
 *  plus all funding-round badges). Awards subject either a bare DID or a
 *  StrongRef to a record in the awardee's repo — both resolve to the org DID.
 *  Powers the globe's Ma Earth roster/pins. */
export async function fetchMaEarthOrganizationDids(signal?: AbortSignal): Promise<string[]> {
  const index = await fetchFeaturedBadgeIndex(signal);
  const dids: string[] = [];
  for (const key of ["maearth", "maearth-round-1", "maearth-round-2", "maearth-round-3"] as const) {
    const bucket = index.byBadge[key];
    dids.push(...bucket.dids);
    for (const uri of bucket.recordUris) {
      const match = uri.match(/^at:\/\/([^/]+)\//);
      if (match?.[1]?.startsWith("did:")) dids.push(match[1]);
    }
  }
  return uniqueSorted(dids);
}

// ── Hidden (test) accounts ─────────────────────────────────────────────────
//
// GainForest stewards can flag an account as a "test" account from its profile.
// A flag is a badge award titled `test-account`, written into the GainForest
// group repo (the same repo the featured badges live in) with the flagged
// account's DID as the award subject. The public explore surfaces (projects,
// observations, feed) hide every record owned by a flagged DID — mirroring how
// simocracy-v2 hides test sims via its `test-account` badge.

/** The badge title that marks an account as a hidden test account. */
export const TEST_ACCOUNT_BADGE_TITLE = "test-account";

/** The badge title that marks a single record (a feed post, an observation, a
 *  project, …) as a hidden test record. The award's subject is a StrongRef to
 *  the flagged record instead of a bare DID. */
export const TEST_RECORD_BADGE_TITLE = "test-record";

/** The admin group account (admins-gxlw.certified.one) that gates who may flag
 *  test accounts and holds the `test-account` moderation badges. Its members
 *  can flag/unflag; the public hiding read scans this same repo. Kept separate
 *  from the public GainForest content repo and from FEATURED_BADGE_REPO_DID. */
export const GAINFOREST_MODERATION_REPO_DID =
  process.env.NEXT_PUBLIC_MODERATION_ACCOUNT_DID?.trim() || "did:plc:vfpcbimtprblyuubjako72qx";

/** Short cache so a steward's flag/unflag propagates to the public grids within
 *  a few minutes, without re-scanning the badge repo on every request. */
const HIDDEN_ACCOUNTS_CACHE_MS = 5 * 60 * 1000;

const EMPTY_DID_SET: ReadonlySet<string> = new Set<string>();

/** Both hidden sets, read in one scan of the moderation repo: account DIDs
 *  flagged via `test-account` awards, and record AT-URIs flagged via
 *  `test-record` awards. */
type HiddenModerationSets = { dids: Set<string>; recordUris: Set<string> };

async function fetchHiddenModerationSetsUncached(signal?: AbortSignal): Promise<HiddenModerationSets> {
  const definitions: RawFeaturedBadgeDefinition[] = [];
  const awards: RawFeaturedBadgeAward[] = [];
  let afterDefinitions: string | null = null;
  let afterAwards: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const shouldCollectDefinitions: boolean = page === 0 || Boolean(afterDefinitions);
    const payload: FeaturedBadgeIndexPayload | null = await indexerQuery<FeaturedBadgeIndexPayload>(
      FEATURED_BADGE_INDEX_QUERY,
      {
        repo: GAINFOREST_MODERATION_REPO_DID,
        first: INDEXER_MAX_PAGE,
        afterDefinitions,
        afterAwards,
      },
      signal,
    );

    const definitionsPage: Connection<RawFeaturedBadgeDefinition> | null | undefined = payload?.appCertifiedBadgeDefinition;
    const awardsPage: Connection<RawFeaturedBadgeAward> | null | undefined = payload?.appCertifiedBadgeAward;
    if (shouldCollectDefinitions) {
      definitions.push(...((definitionsPage?.edges ?? []).flatMap((edge: { node?: RawFeaturedBadgeDefinition | null } | null) => (edge?.node ? [edge.node] : []))));
    }
    awards.push(...((awardsPage?.edges ?? []).flatMap((edge: { node?: RawFeaturedBadgeAward | null } | null) => (edge?.node ? [edge.node] : []))));

    afterDefinitions = shouldCollectDefinitions && definitionsPage?.pageInfo?.hasNextPage ? definitionsPage.pageInfo.endCursor ?? null : null;
    afterAwards = awardsPage?.pageInfo?.hasNextPage ? awardsPage.pageInfo.endCursor ?? null : null;
    if (!afterDefinitions && !afterAwards) break;
  }

  const badgeUrisFor = (title: string) =>
    new Set(
      definitions
        .filter((definition) => normalizeFeaturedBadgeTitle(definition.title) === normalizeFeaturedBadgeTitle(title))
        .flatMap((definition) => (definition.uri ? [definition.uri] : [])),
    );
  const accountBadgeUris = badgeUrisFor(TEST_ACCOUNT_BADGE_TITLE);
  const recordBadgeUris = badgeUrisFor(TEST_RECORD_BADGE_TITLE);

  const dids = new Set<string>();
  const recordUris = new Set<string>();
  for (const award of awards) {
    const badgeUri = award.badge?.uri;
    if (!badgeUri) continue;
    const subject = award.subject;
    if (accountBadgeUris.has(badgeUri)) {
      if (subject?.__typename === "AppCertifiedDefsDid" && subject.did) dids.add(subject.did);
    } else if (recordBadgeUris.has(badgeUri)) {
      if (subject?.__typename === "ComAtprotoRepoStrongRef" && subject.uri?.trim()) {
        recordUris.add(subject.uri.trim());
      }
    }
  }
  return { dids, recordUris };
}

/** Cached account + record hidden sets. Returns empty sets on any error so a
 *  transient indexer hiccup never hides the whole catalog. */
function fetchHiddenModerationSets(signal?: AbortSignal): Promise<HiddenModerationSets> {
  return cachedAsync(
    "hidden-moderation-sets:v1",
    HIDDEN_ACCOUNTS_CACHE_MS,
    () =>
      fetchHiddenModerationSetsUncached().catch(
        (): HiddenModerationSets => ({ dids: new Set<string>(), recordUris: new Set<string>() }),
      ),
    signal,
  );
}

/**
 * The set of account DIDs flagged as test accounts, hidden from the public
 * projects / observations / feed surfaces. Returns an empty set on any error so
 * a transient indexer hiccup never hides the whole catalog.
 */
export async function fetchHiddenAccountDids(signal?: AbortSignal): Promise<Set<string>> {
  return (await fetchHiddenModerationSets(signal)).dids;
}

/**
 * The set of record AT-URIs a GainForest steward flagged as test records —
 * individual posts, observations, or other records hidden from the public feed
 * and catalogs without hiding the whole account. Empty set on any error.
 */
export async function fetchHiddenRecordUris(signal?: AbortSignal): Promise<Set<string>> {
  return (await fetchHiddenModerationSets(signal)).recordUris;
}

/**
 * Map of account DID -> the set of recognition badge keys it currently holds
 * (e.g. "rewilding-grant", "bioblitz-best-picture"). Scans the same moderation
 * repo as the hidden-account flag, but matches the recognition badge titles.
 * Public profiles read this to render a steward-awarded badge of honour.
 */
async function fetchRecognitionAwardIndexUncached(signal?: AbortSignal): Promise<Map<string, Set<string>>> {
  const definitions: RawFeaturedBadgeDefinition[] = [];
  const awards: RawFeaturedBadgeAward[] = [];
  let afterDefinitions: string | null = null;
  let afterAwards: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const shouldCollectDefinitions: boolean = page === 0 || Boolean(afterDefinitions);
    const payload: FeaturedBadgeIndexPayload | null = await indexerQuery<FeaturedBadgeIndexPayload>(
      FEATURED_BADGE_INDEX_QUERY,
      { repo: GAINFOREST_MODERATION_REPO_DID, first: INDEXER_MAX_PAGE, afterDefinitions, afterAwards },
      signal,
    );
    const definitionsPage: Connection<RawFeaturedBadgeDefinition> | null | undefined = payload?.appCertifiedBadgeDefinition;
    const awardsPage: Connection<RawFeaturedBadgeAward> | null | undefined = payload?.appCertifiedBadgeAward;
    if (shouldCollectDefinitions) {
      definitions.push(...((definitionsPage?.edges ?? []).flatMap((edge: { node?: RawFeaturedBadgeDefinition | null } | null) => (edge?.node ? [edge.node] : []))));
    }
    awards.push(...((awardsPage?.edges ?? []).flatMap((edge: { node?: RawFeaturedBadgeAward | null } | null) => (edge?.node ? [edge.node] : []))));
    afterDefinitions = shouldCollectDefinitions && definitionsPage?.pageInfo?.hasNextPage ? definitionsPage.pageInfo.endCursor ?? null : null;
    afterAwards = awardsPage?.pageInfo?.hasNextPage ? awardsPage.pageInfo.endCursor ?? null : null;
    if (!afterDefinitions && !afterAwards) break;
  }

  // Map every recognition badge definition uri -> its canonical key. Titles
  // arrive either verbatim ("bioblitz-best-picture-round-2") or squashed by
  // the shared alphanumeric normalisation; recognitionKeyFromTitle accepts both.
  const recognitionKeys = new Map<string, string>();
  for (const definition of definitions) {
    if (!definition.uri || !definition.title) continue;
    const key = recognitionKeyFromTitle(definition.title);
    if (key) recognitionKeys.set(definition.uri, key);
  }
  if (recognitionKeys.size === 0) return new Map<string, Set<string>>();

  const index = new Map<string, Set<string>>();
  for (const award of awards) {
    const badgeUri = award.badge?.uri;
    const key = badgeUri ? recognitionKeys.get(badgeUri) : undefined;
    if (!key) continue;
    const subject = award.subject;
    if (subject?.__typename === "AppCertifiedDefsDid" && subject.did) {
      const set = index.get(subject.did) ?? new Set<string>();
      set.add(key);
      index.set(subject.did, set);
    }
  }
  return index;
}

/**
 * Cached account-DID -> recognition-badge-keys index. Returns an empty map on
 * any error so a transient indexer hiccup never drops badges site-wide.
 */
function fetchRecognitionAwardIndex(signal?: AbortSignal): Promise<Map<string, Set<string>>> {
  return cachedAsync(
    "recognition-award-index:v2",
    HIDDEN_ACCOUNTS_CACHE_MS,
    () => fetchRecognitionAwardIndexUncached().catch(() => new Map<string, Set<string>>()),
    signal,
  );
}

/** The recognition badge keys currently awarded to a single account DID. */
export async function fetchRecognitionBadgesForDid(did: string, signal?: AbortSignal): Promise<Set<string>> {
  const index = await fetchRecognitionAwardIndex(signal).catch(() => new Map<string, Set<string>>());
  return index.get(did) ?? new Set<string>();
}

/** Recognition badge keys for a batch of account DIDs (one cached index read).
 *  Only DIDs holding at least one badge appear in the returned map. */
export async function fetchRecognitionBadgesForDids(
  dids: string[],
  signal?: AbortSignal,
): Promise<Map<string, Set<string>>> {
  const index = await fetchRecognitionAwardIndex(signal).catch(() => new Map<string, Set<string>>());
  const out = new Map<string, Set<string>>();
  for (const did of dids) {
    const keys = index.get(did);
    if (keys && keys.size > 0) out.set(did, keys);
  }
  return out;
}

/** Resolve the hidden-account set unless the query is scoped to a single owner
 *  account (profile drill-downs intentionally show that account's own records,
 *  flagged or not). */
async function hiddenDidsForScope(ownerScoped: boolean, signal?: AbortSignal): Promise<ReadonlySet<string>> {
  if (ownerScoped) return EMPTY_DID_SET;
  return fetchHiddenAccountDids(signal).catch(() => EMPTY_DID_SET);
}

/** Same scoping rule for record-level flags: the public catalogs hide flagged
 *  records, while an owner-scoped drill-down still shows them to their owner. */
async function hiddenRecordUrisForScope(ownerScoped: boolean, signal?: AbortSignal): Promise<ReadonlySet<string>> {
  if (ownerScoped) return EMPTY_DID_SET;
  return fetchHiddenRecordUris(signal).catch(() => EMPTY_DID_SET);
}

/**
 * Disposable records created by the browser e2e suites (e.g. "Disposable
 * E2E Forest Org Edited", "E2E Bumicert 1749…-0-0") should not appear in the
 * public catalogs. The e2e specs assert against the PDS / manage pages, which
 * fetch by DID and are unaffected.
 */
export function isLikelyTestRecordName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (/disposable/i.test(trimmed) && /\be2e\b/i.test(trimmed)) return true;
  if (/^e2e org\b/i.test(trimmed)) return true;
  return /^e2e bumicert \d/i.test(trimmed);
}

/** A user or organization account, matched by display name, for the owner
 *  filter's type-ahead picker on the explore pages. */
export type AccountSearchResult = {
  did: string;
  displayName: string;
  avatarRef: string | null;
};

const ACCOUNT_SEARCH_QUERY = `
  query OwnerAccountSearch($first: Int!, $where: AppCertifiedActorProfileWhereInput) {
    appCertifiedActorProfile(first: $first, where: $where, sortBy: displayName, sortDirection: ASC) {
      edges {
        node {
          did
          displayName
          avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
        }
      }
    }
  }
`;

type RawAccountSearchNode = {
  did?: string | null;
  displayName?: string | null;
  avatar?: { image?: { ref?: string | null } | null } | null;
};

/** Search accounts (people + organizations) by display name. Powers the owner
 *  filter picker; returns at most `limit` distinct, non-test accounts. */
export async function searchAccountsByName(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<AccountSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = await indexerQuery<{ appCertifiedActorProfile?: Connection<RawAccountSearchNode> }>(
    ACCOUNT_SEARCH_QUERY,
    { first: Math.max(1, Math.min(limit * 3, 40)), where: { displayName: { contains: q } } },
    signal,
  );
  const hidden = await fetchHiddenAccountDids(signal).catch(() => EMPTY_DID_SET);
  const seen = new Set<string>();
  const results: AccountSearchResult[] = [];
  for (const edge of data?.appCertifiedActorProfile?.edges ?? []) {
    const node = edge?.node;
    const did = node?.did?.trim();
    const displayName = node?.displayName?.trim();
    if (!did || !displayName || seen.has(did) || hidden.has(did) || isLikelyTestRecordName(displayName)) continue;
    seen.add(did);
    results.push({ did, displayName, avatarRef: normaliseRef(node?.avatar?.image?.ref) });
    if (results.length >= limit) break;
  }
  return results;
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
    cid: n.cid ?? null,
    title: (n.title ?? "Untitled bumicert").trim() || "Untitled bumicert",
    shortDescription: sanitizeShortDescription(n.shortDescription),
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
    creatorName: profileName(n.certifiedProfileData),
    creatorAvatarRef: profileAvatarRef(n.certifiedProfileData),
  };
}

async function mapActivityConnection(
  conn: Connection<RawActivity> | null | undefined,
  signal?: AbortSignal,
): Promise<Page<BumicertRecord>> {
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawActivity => Boolean(n?.did))
    .filter((n) => !isLikelyTestRecordName(n.title));
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

type BumicertIndexFilter = "images" | "locations" | "contributors" | "active" | "donations";
export type ExplorerSortMode = "newest" | "oldest" | "az" | "za";

type ActivityQueryOptions = {
  query?: string;
  filters?: BumicertIndexFilter[];
  sort?: ExplorerSortMode;
  featuredBadgesOnly?: boolean;
  badgeFilters?: BumicertBadgeFilter[];
  /** Scope results to a single owner account (DID). Callers should also set
   *  featuredBadgesOnly:false so the account's full catalog is returned. */
  creatorDid?: string | null;
};

function creatorWhere(creatorDid: string | null | undefined): ActivityWhere | undefined {
  const did = creatorDid?.trim();
  return did ? { did: { in: [did] } } : undefined;
}

type ActivityWhere = Record<string, unknown>;

function activitySort(sort: ExplorerSortMode | undefined): { sortBy: string; sortDirection: "ASC" | "DESC" } {
  switch (sort) {
    case "oldest":
      return { sortBy: "createdAt", sortDirection: "ASC" };
    case "az":
      return { sortBy: "title", sortDirection: "ASC" };
    case "za":
      return { sortBy: "title", sortDirection: "DESC" };
    case "newest":
    default:
      return { sortBy: "createdAt", sortDirection: "DESC" };
  }
}

function mergeWhere(...parts: Array<ActivityWhere | undefined>): ActivityWhere | undefined {
  const merged = Object.assign({}, ...parts.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function activityFilterWhere(filters: BumicertIndexFilter[] | undefined): ActivityWhere | undefined {
  if (!filters?.length) return undefined;
  const where: ActivityWhere = {};
  if (filters.includes("images")) where.image = { isNull: false };
  if (filters.includes("locations")) where.locations = { isNull: false };
  if (filters.includes("contributors")) where.contributors = { isNull: false };
  return Object.keys(where).length > 0 ? where : undefined;
}

function activitySearchWhere(query: string | undefined): ActivityWhere[] {
  const q = query?.trim();
  if (!q) return [{}];
  return [{ title: { contains: q } }, { shortDescription: { contains: q } }];
}

function activityDateWhere(filters: BumicertIndexFilter[] | undefined): ActivityWhere[] {
  if (!filters?.includes("active")) return [{}];
  return [{ startDate: { isNull: false } }, { endDate: { isNull: false } }];
}

function normalizeBadgeFilters(filters: BumicertBadgeFilter[] | undefined): BumicertBadgeFilter[] {
  if (!filters?.length) return [];
  return Array.from(new Set(filters)).filter((filter) => FEATURED_BADGE_KEYS.has(filter));
}

// "Ma Earth" is an umbrella: selecting it matches the general Ma Earth badge
// plus every per-round badge, so stewards see all Ma Earth work under one chip
// instead of confusing "Round 1 / Round 2" variants.
const BADGE_FILTER_EXPANSIONS: Partial<Record<BumicertBadgeFilter, BumicertBadgeFilter[]>> = {
  maearth: ["maearth", "maearth-round-1", "maearth-round-2", "maearth-round-3"],
};

function expandBadgeFilters(filters: BumicertBadgeFilter[]): BumicertBadgeFilter[] {
  const expanded = new Set<BumicertBadgeFilter>();
  for (const filter of filters) {
    for (const member of BADGE_FILTER_EXPANSIONS[filter] ?? [filter]) expanded.add(member);
  }
  return Array.from(expanded);
}

function featuredBadgeValues(index: FeaturedBadgeIndex, filters: BumicertBadgeFilter[] | undefined): FeaturedBadgeValues {
  const selected = expandBadgeFilters(normalizeBadgeFilters(filters));
  if (selected.length === 0) return { dids: index.dids, recordUris: index.recordUris };
  return {
    dids: uniqueSorted(selected.flatMap((filter) => index.byBadge[filter]?.dids ?? [])),
    recordUris: uniqueSorted(selected.flatMap((filter) => index.byBadge[filter]?.recordUris ?? [])),
  };
}

function featuredBadgeCollectionValues(index: FeaturedBadgeIndex, collection: string, filters?: BumicertBadgeFilter[]): FeaturedBadgeValues {
  const values = featuredBadgeValues(index, filters);
  return {
    dids: values.dids,
    recordUris: values.recordUris.filter((uri) => uri.includes(`/${collection}/`)),
  };
}

function featuredBadgeRecordWhereVariants<W extends Record<string, unknown>>(
  index: FeaturedBadgeIndex | undefined,
  collection: string,
  filters?: BumicertBadgeFilter[],
): W[] {
  if (!index) return [{} as W];
  const values = featuredBadgeCollectionValues(index, collection, filters);
  const variants: W[] = [];
  for (const dids of chunkStrings(values.dids, FEATURED_BADGE_FILTER_IN_LIMIT)) {
    variants.push({ did: { in: dids } } as unknown as W);
  }
  for (const recordUris of chunkStrings(values.recordUris, FEATURED_BADGE_FILTER_IN_LIMIT)) {
    variants.push({ uri: { in: recordUris } } as unknown as W);
  }
  return variants;
}

function featuredBadgeWhereVariants(index?: FeaturedBadgeIndex, filters?: BumicertBadgeFilter[]): ActivityWhere[] {
  return featuredBadgeRecordWhereVariants<ActivityWhere>(index, "org.hypercerts.claim.activity", filters);
}

function activityWhereVariants(options?: ActivityQueryOptions, badgeIndex?: FeaturedBadgeIndex): ActivityWhere[] {
  const badgeWheres = featuredBadgeWhereVariants(badgeIndex, options?.badgeFilters);
  if (badgeWheres.length === 0) return [];
  const base = mergeWhere(activityFilterWhere(options?.filters), creatorWhere(options?.creatorDid));
  const variants: ActivityWhere[] = [];
  for (const badgeWhere of badgeWheres) {
    for (const searchWhere of activitySearchWhere(options?.query)) {
      for (const dateWhere of activityDateWhere(options?.filters)) {
        variants.push(mergeWhere(base, badgeWhere, searchWhere, dateWhere) ?? {});
      }
    }
  }
  return variants;
}

function activityCountId(n: RawActivityCountIdentity): string {
  return n.uri || activityUriForDidRkey(n.did, n.rkey);
}

function activityCountMatchesOptions(n: RawActivityMatch, options?: ActivityQueryOptions): boolean {
  const q = options?.query?.trim().toLowerCase();
  if (q) {
    const shortDescription = sanitizeShortDescription(n.shortDescription);
    const haystack = `${n.title ?? ""} ${shortDescription ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  const filters = options?.filters ?? [];
  const hasImage = n.image?.__typename === "OrgHypercertsDefsUri"
    ? Boolean(n.image.uri?.trim())
    : n.image?.__typename === "OrgHypercertsDefsSmallImage"
      ? Boolean(normaliseRef(n.image.image?.ref))
      : false;
  if (filters.includes("images") && !hasImage) return false;
  if (filters.includes("locations") && (!Array.isArray(n.locations) || n.locations.length === 0)) return false;
  if (filters.includes("contributors") && (!Array.isArray(n.contributors) || n.contributors.length === 0)) return false;
  if (filters.includes("active") && !n.startDate?.trim() && !n.endDate?.trim()) return false;
  return true;
}

function activityMatchesOptions(record: BumicertRecord, options?: ActivityQueryOptions): boolean {
  const q = options?.query?.trim().toLowerCase();
  if (q) {
    const haystack = `${record.title} ${record.shortDescription ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  const filters = options?.filters ?? [];
  if (filters.includes("images") && !record.imageUrl && !record.imageRef) return false;
  if (filters.includes("locations") && record.locationCount <= 0) return false;
  if (filters.includes("contributors") && record.contributorCount <= 0) return false;
  if (filters.includes("active") && !record.startDate && !record.endDate) return false;
  return true;
}

function compareBumicerts(a: BumicertRecord, b: BumicertRecord, sort: ExplorerSortMode | undefined): number {
  switch (sort) {
    case "oldest":
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case "az":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "za":
      return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
    case "newest":
    default:
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }
}

function uniqueBumicerts(records: BumicertRecord[], sort?: ExplorerSortMode): BumicertRecord[] {
  const map = new Map<string, BumicertRecord>();
  for (const record of records) map.set(record.id, record);
  return [...map.values()].sort((a, b) => compareBumicerts(a, b, sort));
}

async function fetchActivityPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
  where?: ActivityWhere,
  sort: ExplorerSortMode = "newest",
): Promise<Page<BumicertRecord>> {
  const { sortBy, sortDirection } = activitySort(sort);
  const data = await indexerQuery<{
    orgHypercertsClaimActivity?: Connection<RawActivity>;
  }>(ACTIVITY_QUERY, { first, after, where: where ?? null, sortBy, sortDirection }, signal);
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

async function fetchActivityCountPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
  where?: ActivityWhere,
): Promise<Page<RawActivityCount>> {
  const data = await indexerQuery<{
    orgHypercertsClaimActivity?: Connection<RawActivityCount>;
  }>(ACTIVITY_COUNT_QUERY, { first, after, where: where ?? null }, signal);
  const conn = data?.orgHypercertsClaimActivity;
  const records = (conn?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node): node is RawActivityCount => Boolean(node?.did && node.rkey))
    .filter((node) => !isLikelyTestRecordName(node.title));
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

async function fetchActivityCountByUri(uri: string, signal?: AbortSignal): Promise<RawActivityMatch | null> {
  const data = await indexerQuery<{ orgHypercertsClaimActivityByUri?: RawActivityMatch | null }>(
    ACTIVITY_COUNT_BY_URI_QUERY,
    { uri },
    signal,
  );
  const node = data?.orgHypercertsClaimActivityByUri;
  if (!node || isLikelyTestRecordName(node.title)) return null;
  return node;
}

type MultiCursor = { cursors: Array<string | null>; more: boolean[] };

function parseMultiCursor(after: string | null, count: number): MultiCursor {
  if (!after?.startsWith("multi:")) return { cursors: Array(count).fill(null), more: Array(count).fill(true) };
  try {
    const parsed = JSON.parse(decodeURIComponent(after.slice("multi:".length))) as Partial<MultiCursor>;
    return {
      cursors: Array.from({ length: count }, (_, i) => parsed.cursors?.[i] ?? null),
      more: Array.from({ length: count }, (_, i) => parsed.more?.[i] !== false),
    };
  } catch {
    return { cursors: Array(count).fill(null), more: Array(count).fill(true) };
  }
}

function encodeMultiCursor(cursor: MultiCursor): string | null {
  if (!cursor.more.some(Boolean)) return null;
  return `multi:${encodeURIComponent(JSON.stringify(cursor))}`;
}

async function fetchFundingConfigPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<Page<RawFundingConfig>> {
  const data = await indexerQuery<{
    appGainforestFundingConfig?: Connection<RawFundingConfig>;
  }>(FUNDING_CONFIG_QUERY, { first, after }, signal);
  const conn = data?.appGainforestFundingConfig;
  const records = (conn?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node): node is RawFundingConfig => Boolean(node?.did && node?.rkey && node?.receivingWallet?.uri))
    .filter((node) => (node.status ?? "open") === "open");
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

type DonationEligibilityIndex = {
  dids: Set<string>;
  activityUris: Set<string>;
};

async function fetchDonationEligibilityIndex(signal?: AbortSignal): Promise<DonationEligibilityIndex> {
  return publicExploreCache(
    "donation-eligibility-index",
    {},
    async () => {
      const dids = new Set<string>();
      const activityUris = new Set<string>();
      let cursor: string | null = null;
      let hasMore = true;
      while (hasMore) {
        const page = await fetchFundingConfigPage(INDEXER_MAX_PAGE, cursor);
        for (const config of page.records) {
          dids.add(config.did);
          activityUris.add(activityUriForDidRkey(config.did, config.rkey));
        }
        cursor = page.cursor;
        hasMore = page.hasMore && Boolean(page.cursor);
      }
      return { dids, activityUris };
    },
    signal,
  );
}

/** Where a record can receive donations: `gainforest` = a native funding
 *  config (linked wallet), `maearth` = a live Ma Earth campaign page. */
export type DonationSources = { gainforest: boolean; maearth: boolean };

function recordDonationSources(record: { did: string; atUri?: string; bumicertUris?: string[] }, index: DonationEligibilityIndex): DonationSources {
  const maearth = hasMaEarthDonationUrl(record.did);
  const gainforest = (!record.bumicertUris && index.dids.has(record.did)) ||
    (record.bumicertUris ?? [record.atUri].filter((uri): uri is string => Boolean(uri))).some((uri) => index.activityUris.has(uri));
  return { gainforest, maearth };
}

function recordAcceptsDonations(record: { did: string; atUri?: string; bumicertUris?: string[] }, index: DonationEligibilityIndex): boolean {
  const sources = recordDonationSources(record, index);
  return sources.gainforest || sources.maearth;
}

const DONATION_FILTER_KEYS = ["donations", "donations-gainforest", "donations-maearth"] as const;

/** AND semantics for the source-specific chips; the legacy `donations` key
 *  (old shared links) means "either source". */
function donationSourcesMatchFilters(sources: DonationSources, filters: readonly string[] | undefined): boolean {
  if (filters?.includes("donations-gainforest") && !sources.gainforest) return false;
  if (filters?.includes("donations-maearth") && !sources.maearth) return false;
  if (filters?.includes("donations") && !sources.gainforest && !sources.maearth) return false;
  return true;
}

async function fetchActivityByUriRecord(uri: string, signal?: AbortSignal): Promise<BumicertRecord | null> {
  const data = await indexerQuery<{ orgHypercertsClaimActivityByUri?: RawActivity | null }>(
    ACTIVITY_BY_URI_QUERY,
    { uri },
    signal,
  );
  const node = data?.orgHypercertsClaimActivityByUri;
  if (!node) return null;
  const page = await mapActivityConnection({ edges: [{ node }], pageInfo: { hasNextPage: false, endCursor: null } }, signal);
  return page.records[0] ?? null;
}

async function fetchDonationEnabledBumicerts(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  _onProgress?: (records: BumicertRecord[]) => void,
  options?: ActivityQueryOptions,
): Promise<Page<BumicertRecord>> {
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : null;
  const badgeValues = badgeIndex ? featuredBadgeValues(badgeIndex, options?.badgeFilters) : null;
  const allowedDids = badgeValues ? new Set(badgeValues.dids) : null;
  const allowedRecordUris = badgeValues ? new Set(badgeValues.recordUris) : null;
  if (badgeIndex && allowedDids?.size === 0 && allowedRecordUris?.size === 0) {
    return { records: [], cursor: null, hasMore: false };
  }
  const hidden = await hiddenDidsForScope(Boolean(options?.creatorDid?.trim()), signal);

  const records: BumicertRecord[] = [];
  let cursor = after;
  let hasMore = true;
  const batchSize = 12;

  while (records.length < target && hasMore) {
    const page = await fetchFundingConfigPage(INDEXER_MAX_PAGE, cursor, signal);
    cursor = page.cursor;
    hasMore = page.hasMore && Boolean(page.cursor);

    const eligibleConfigs = (badgeIndex
      ? page.records.filter((config) => {
          const activityUri = activityUriForDidRkey(config.did, config.rkey);
          return allowedDids?.has(config.did) || allowedRecordUris?.has(activityUri);
        })
      : page.records).filter((config) => !hidden.has(config.did));

    // Resolve the ENTIRE fetched config page, even past `target`: the cursor
    // has already advanced beyond all of it, so any eligible activity we skip
    // now would never be seen by a later paginated call.
    for (let index = 0; index < eligibleConfigs.length; index += batchSize) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const batch = eligibleConfigs.slice(index, index + batchSize);
      const activities = await Promise.all(
        batch.map((config) =>
          fetchActivityByUriRecord(activityUriForDidRkey(config.did, config.rkey), signal).catch(() => null),
        ),
      );
      for (const activity of activities) {
        if (!activity || !activityMatchesOptions(activity, options)) continue;
        records.push(activity);
      }
    }
    if (!page.cursor) break;
  }

  return {
    records: uniqueBumicerts(records, options?.sort),
    cursor,
    hasMore,
  };
}

async function fetchDonationEnabledBumicertCount(signal?: AbortSignal, options?: ActivityQueryOptions): Promise<number> {
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : null;
  const badgeValues = badgeIndex ? featuredBadgeValues(badgeIndex, options?.badgeFilters) : null;
  const allowedDids = badgeValues ? new Set(badgeValues.dids) : null;
  const allowedRecordUris = badgeValues ? new Set(badgeValues.recordUris) : null;
  if (badgeIndex && allowedDids?.size === 0 && allowedRecordUris?.size === 0) return 0;
  const hidden = await hiddenDidsForScope(Boolean(options?.creatorDid?.trim()), signal);

  const seen = new Set<string>();
  let cursor: string | null = null;
  let hasMore = true;
  const batchSize = 12;

  while (hasMore) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const page = await fetchFundingConfigPage(INDEXER_MAX_PAGE, cursor, signal);
    cursor = page.cursor;
    hasMore = page.hasMore && Boolean(page.cursor);

    const eligibleConfigs = (badgeIndex
      ? page.records.filter((config) => {
          const activityUri = activityUriForDidRkey(config.did, config.rkey);
          return allowedDids?.has(config.did) || allowedRecordUris?.has(activityUri);
        })
      : page.records).filter((config) => !hidden.has(config.did));

    for (let index = 0; index < eligibleConfigs.length; index += batchSize) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const batch = eligibleConfigs.slice(index, index + batchSize);
      const activities = await Promise.all(
        batch.map((config) => fetchActivityCountByUri(activityUriForDidRkey(config.did, config.rkey), signal).catch(() => null)),
      );
      for (const activity of activities) {
        if (!activity || !activityCountMatchesOptions(activity, options)) continue;
        seen.add(activityCountId(activity));
      }
    }
  }

  return seen.size;
}

async function fetchBumicertsFromActivityCount(signal?: AbortSignal, options?: ActivityQueryOptions): Promise<number> {
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : undefined;
  const variants = activityWhereVariants(options, badgeIndex);
  if (variants.length === 0) return 0;
  const hidden = await hiddenDidsForScope(Boolean(options?.creatorDid?.trim()), signal);

  const seen = new Set<string>();
  for (const where of variants) {
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const page = await fetchActivityCountPage(INDEXER_MAX_PAGE, cursor, signal, where);
      for (const record of page.records) {
        if (hidden.has(record.did)) continue;
        seen.add(activityCountId(record));
      }
      cursor = page.cursor;
      hasMore = page.hasMore && Boolean(page.cursor);
    }
  }
  return seen.size;
}

async function fetchBumicertsFromActivity(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: BumicertRecord[]) => void,
  options?: ActivityQueryOptions,
): Promise<Page<BumicertRecord>> {
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : undefined;
  const variants = activityWhereVariants(options, badgeIndex);
  if (variants.length === 0) return { records: [], cursor: null, hasMore: false };
  if (variants.length === 1) {
    return collectPaged(
      (first, cursor, nextSignal) => fetchActivityPage(first, cursor, nextSignal, variants[0], options?.sort),
      target,
      after,
      signal,
      onProgress,
    );
  }

  const previous = parseMultiCursor(after, variants.length);
  const cursors = [...previous.cursors];
  const more = [...previous.more];
  let records: BumicertRecord[] = [];

  while (records.length < target && more.some(Boolean)) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const activeIndexes = more.flatMap((isActive, index) => (isActive ? [index] : []));
    const remaining = target - records.length;
    const basePageSize = Math.floor(remaining / activeIndexes.length);
    const extra = remaining % activeIndexes.length;
    const pages = await Promise.all(
      activeIndexes.map((variantIndex, order) => {
        const first = basePageSize + (order < extra ? 1 : 0);
        if (first <= 0) return Promise.resolve({ variantIndex, page: null });
        return fetchActivityPage(first, cursors[variantIndex] ?? null, signal, variants[variantIndex], options?.sort)
          .then((page) => ({ variantIndex, page }));
      }),
    );

    let madeProgress = false;
    for (const { variantIndex, page } of pages) {
      if (!page) continue;
      const previousCursor = cursors[variantIndex];
      const previousMore = more[variantIndex];
      records.push(...page.records);
      cursors[variantIndex] = page.cursor;
      more[variantIndex] = page.hasMore && Boolean(page.cursor);
      madeProgress ||= page.records.length > 0 || cursors[variantIndex] !== previousCursor || more[variantIndex] !== previousMore;
    }
    records = uniqueBumicerts(records, options?.sort);
    if (!madeProgress) break;
    onProgress?.(records);
  }

  return {
    records,
    cursor: encodeMultiCursor({ cursors, more }),
    hasMore: more.some(Boolean),
  };
}

/** Load up to `target` Bumicerts, paging the indexer's 1000-record cap. */
export async function fetchBumicerts(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: BumicertRecord[]) => void,
  options?: ActivityQueryOptions,
): Promise<Page<BumicertRecord>> {
  const rawPromise = publicExploreCache(
    "bumicerts-page",
    { target, after, options },
    () => options?.filters?.includes("donations")
      ? fetchDonationEnabledBumicerts(target, after, undefined, undefined, options)
      : fetchBumicertsFromActivity(target, after, undefined, undefined, options),
    signal,
  );
  // Hide Bumicerts owned by flagged test accounts on the public catalog, but
  // keep them when scoped to a single owner (their own profile / drill-down).
  const ownerScoped = Boolean(options?.creatorDid?.trim());
  const pagePromise = rawPromise.then(async (page) => {
    const hidden = await hiddenDidsForScope(ownerScoped, signal);
    if (hidden.size === 0) return page;
    return { ...page, records: page.records.filter((record) => !hidden.has(record.did)) };
  });
  if (onProgress) void pagePromise.then((page) => onProgress(page.records)).catch(() => {});
  return pagePromise;
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
          ${CERTIFIED_PROFILE_DATA_FIELDS}
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

type RawActivityStats = Pick<RawActivity, "contributors" | "locations" | "image" | "certifiedProfileData">;

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
  return publicExploreCache("bumicert-total-stats", {}, fetchBumicertStatsUncached, signal);
}

// ── 3. Projects (hypercert collections) ────────────────────────────────────

export type ProjectRecord = {
  kind: "project";
  id: string;
  did: string;
  rkey: string;
  atUri: string;
  cid: string | null;
  title: string;
  shortDescription: string | null;
  createdAt: string;
  type: string | null;
  imageUrl: string | null;
  imageRef: string | null;
  creatorName: string | null;
  creatorAvatarRef: string | null;
  bumicertUris: string[];
  bumicertCount: number;
  locationUri: string | null;
  /** ISO country code resolved from the project's location record, if any. */
  country: string | null;
  /** Work-scope / focus tags inherited from the project's single Cert. Only
   *  populated when the project was fetched with `withScopeTags`. */
  scopeTags?: string[];
  /** True when the project can receive donations through a linked button or external donation page. */
  acceptsDonations?: boolean;
  /** Per-source donation eligibility (native GainForest wallet vs Ma Earth campaign). */
  donationSources?: DonationSources;
  /** At-a-glance evidence counts for card display. Only populated when fetched
   *  with `withScopeTags`. */
  evidence?: ProjectEvidenceCounts;
};

export type ProjectEvidenceCounts = {
  /** Mapped site boundaries on the project's Cert. */
  boundaries: number;
  /** Timeline evidence items (attachments, excluding galleries). */
  timeline: number;
  /** Formal evaluations published about the project's Cert. */
  reviews: number;
};

type RawCollectionImage =
  | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
  | { __typename: "OrgHypercertsDefsSmallImage"; image?: { ref?: string | null } | null }
  | { __typename: "OrgHypercertsDefsLargeImage"; image?: { ref?: string | null } | null }
  | null;

type RawProjectCollection = {
  did: string;
  rkey: string;
  uri: string;
  cid?: string | null;
  createdAt: string;
  title?: string | null;
  type?: string | null;
  shortDescription?: string | null;
  avatar?: RawCollectionImage;
  banner?: RawCollectionImage;
  items?: Array<{ itemIdentifier?: { uri?: string | null; cid?: string | null } | null } | null> | null;
  location?: { uri?: string | null; cid?: string | null } | null;
  certifiedProfileData?: CertifiedProfileData;
};

const PROJECT_COLLECTION_NODE_FIELDS = `
  did rkey uri cid createdAt title type shortDescription
  ${CERTIFIED_PROFILE_DATA_FIELDS}
  location { uri cid }
  items { itemIdentifier { uri cid } }
  avatar {
    __typename
    ... on OrgHypercertsDefsUri { uri }
    ... on OrgHypercertsDefsSmallImage { image { ref } }
  }
  banner {
    __typename
    ... on OrgHypercertsDefsUri { uri }
    ... on OrgHypercertsDefsLargeImage { image { ref } }
  }
`;

const PROJECT_COLLECTION_QUERY = `
  query ExplorerProjects(
    $first: Int!
    $after: String
    $where: OrgHypercertsCollectionWhereInput
    $sortBy: OrgHypercertsCollectionSortField
    $sortDirection: SortDirection
  ) {
    orgHypercertsCollection(
      first: $first
      after: $after
      where: $where
      sortBy: $sortBy
      sortDirection: $sortDirection
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { ${PROJECT_COLLECTION_NODE_FIELDS} } }
    }
  }
`;

const PROJECT_COLLECTION_BY_DID_QUERY = `
  query ExplorerProjectsByDid($did: String!, $first: Int!, $after: String) {
    orgHypercertsCollection(
      where: { did: { eq: $did }, type: { in: ["project", "Project"] } }
      first: $first
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { ${PROJECT_COLLECTION_NODE_FIELDS} } }
    }
  }
`;

export type ProjectIndexFilter = "images" | "locations" | "timeline" | "donations" | "donations-gainforest" | "donations-maearth";

type ProjectQueryOptions = {
  query?: string;
  filters?: ProjectIndexFilter[];
  sort?: ExplorerSortMode;
  featuredBadgesOnly?: boolean;
  badgeFilters?: BumicertBadgeFilter[];
  /** Scope results to a single owner account (DID). Callers should also set
   *  featuredBadgesOnly:false so the account's full catalog is returned. */
  creatorDid?: string | null;
  /** Resolve each project's single Cert focus tags for card display. Adds one
   *  batched query per page, so only set it where the tags are shown. */
  withScopeTags?: boolean;
};

type ProjectWhere = Record<string, unknown>;

const PROJECT_TYPE_WHERE: ProjectWhere = { type: { in: ["project", "Project"] } };

function collectionImageMeta(image: RawCollectionImage): { url: string | null; ref: string | null } {
  if (image?.__typename === "OrgHypercertsDefsUri") return { url: image.uri?.trim() || null, ref: null };
  if (image?.__typename === "OrgHypercertsDefsSmallImage" || image?.__typename === "OrgHypercertsDefsLargeImage") {
    return { url: null, ref: normaliseRef(image.image?.ref) };
  }
  return { url: null, ref: null };
}

function mapProjectCollection(n: RawProjectCollection): ProjectRecord {
  const banner = collectionImageMeta(n.banner ?? null);
  const avatar = collectionImageMeta(n.avatar ?? null);
  const bumicertUris = Array.isArray(n.items)
    ? n.items
        .map((item) => item?.itemIdentifier?.uri)
        .filter((uri): uri is string => typeof uri === "string" && uri.includes("/org.hypercerts.claim.activity/"))
    : [];

  return {
    kind: "project",
    id: `${n.did}-${n.rkey}`,
    did: n.did,
    rkey: n.rkey,
    atUri: n.uri || `at://${n.did}/org.hypercerts.collection/${n.rkey}`,
    cid: n.cid ?? null,
    title: (n.title ?? "Untitled project").trim() || "Untitled project",
    shortDescription: sanitizeShortDescription(n.shortDescription),
    createdAt: n.createdAt,
    type: n.type?.trim() || null,
    imageUrl: banner.url ?? avatar.url,
    imageRef: banner.ref ?? avatar.ref,
    creatorName: profileName(n.certifiedProfileData),
    creatorAvatarRef: profileAvatarRef(n.certifiedProfileData),
    bumicertUris,
    bumicertCount: bumicertUris.length,
    locationUri: n.location?.uri ?? null,
    country: null,
    scopeTags: [],
  };
}

const PROJECT_CARD_META_BATCH_SIZE = 20;

type ProjectCardMeta = { scopeTags: string[]; evidence: ProjectEvidenceCounts };
type RawCardMetaActivity = {
  workScope?: { __typename?: string; scope?: string | null; expression?: string | null } | null;
  locations?: Array<{ uri?: string | null } | null> | null;
} | null;
type RawCardMetaCount = { totalCount?: number | null } | null;

/**
 * Resolve focus tags + at-a-glance evidence (boundaries, sightings, timeline,
 * reviews) for a page of projects in a SINGLE batched indexer round-trip.
 *
 * Each project contributes a few aliased root selections to one GraphQL query:
 *   - a{i}  its Cert's workScope + locations      → focus tags + site boundaries
 *   - t{i}  attachment totalCount on the project-or-Cert subject (no galleries) → timeline
 *   - e{i}  evaluation totalCount by subject       → reviews
 *
 * Reviews count formal evaluations only — comments live in Simocracy
 * collections that aren't indexed for cheap per-subject counting. Nature
 * sightings are intentionally omitted: `appGainforestDwcOccurrence` totalCount
 * runs ~0.5–0.7s per project and the indexer doesn't parallelize it, so at the
 * 48-per-page explorer size it added ~25s. Those two were what made the
 * explorer slow; the three metrics here all come back in one ~0.5s round-trip.
 */
async function fetchProjectCardMeta(
  pairs: Array<{ projectUri: string; certUri?: string }>,
  signal?: AbortSignal,
): Promise<Map<string, ProjectCardMeta>> {
  const keyed = pairs.filter((pair) => Boolean(pair.projectUri));
  return publicExploreCache(
    "project-card-meta",
    { pairs: keyed.map((p) => `${p.projectUri}|${p.certUri ?? ""}`).sort() },
    () => fetchProjectCardMetaUncached(keyed),
    signal,
  );
}

async function fetchProjectCardMetaUncached(
  pairs: Array<{ projectUri: string; certUri?: string }>,
): Promise<Map<string, ProjectCardMeta>> {
  const out = new Map<string, ProjectCardMeta>();
  if (pairs.length === 0) return out;

  const activityFields = `{
    workScope {
      __typename
      ... on OrgHypercertsClaimActivityWorkScopeString { scope }
      ... on OrgHypercertsWorkscopeCel { expression }
    }
    locations { uri }
  }`;

  const batches = Array.from(
    { length: Math.ceil(pairs.length / PROJECT_CARD_META_BATCH_SIZE) },
    (_, batchIndex) => pairs.slice(batchIndex * PROJECT_CARD_META_BATCH_SIZE, (batchIndex + 1) * PROJECT_CARD_META_BATCH_SIZE),
  );

  await Promise.all(batches.map(async (batch) => {
    const selections: string[] = [];
    batch.forEach((pair, i) => {
      const subjectUris = JSON.stringify([pair.projectUri, ...(pair.certUri ? [pair.certUri] : [])]);
      if (pair.certUri) {
        selections.push(`a${i}: orgHypercertsClaimActivityByUri(uri: ${JSON.stringify(pair.certUri)}) ${activityFields}`);
        selections.push(`e${i}: orgHypercertsContextEvaluation(first: 1, where: { subject: { uri: { eq: ${JSON.stringify(pair.certUri)} } } }) { totalCount }`);
      }
      selections.push(`t${i}: orgHypercertsContextAttachment(first: 1, where: { subjects: { any: { uri: { in: ${subjectUris} } } }, contentType: { neq: "gallery" } }) { totalCount }`);
    });

    const query = `query ProjectCardMeta {\n${selections.join("\n")}\n}`;
    const data = await indexerQuery<Record<string, RawCardMetaActivity | RawCardMetaCount>>(query, {});

    batch.forEach((pair, i) => {
      const activity = data?.[`a${i}`] as RawCardMetaActivity | undefined;
      const scopeTags = extractWorkScopeTags(activity?.workScope);
      const boundaries = Array.isArray(activity?.locations)
        ? activity!.locations.filter((loc) => Boolean(loc?.uri)).length
        : 0;
      const timeline = (data?.[`t${i}`] as RawCardMetaCount | undefined)?.totalCount ?? 0;
      const reviews = (data?.[`e${i}`] as RawCardMetaCount | undefined)?.totalCount ?? 0;
      out.set(pair.projectUri, { scopeTags, evidence: { boundaries, timeline, reviews } });
    });
  }));

  return out;
}

const EMPTY_EVIDENCE_COUNTS: ProjectEvidenceCounts = { boundaries: 0, timeline: 0, reviews: 0 };

/**
 * Lazily resolve the card metadata (focus/scope tags + at-a-glance evidence)
 * for an already-loaded page of projects. The explorer renders projects first
 * with this metadata omitted, then calls this to fill in the badges without
 * blocking the initial paint.
 *
 * Every returned record has `evidence` defined (zero-filled on miss/error) so
 * callers can use that as a terminal "already enriched" signal and avoid
 * re-fetching in a loop.
 */
export async function enrichProjectsWithCardMeta(
  records: ProjectRecord[],
  signal?: AbortSignal,
): Promise<ProjectRecord[]> {
  if (records.length === 0) return records;
  const pairs = records.map((record) => ({
    projectUri: record.atUri,
    certUri: record.bumicertUris[0],
  }));
  const metaByProject = await fetchProjectCardMeta(pairs, signal).catch(
    () => new Map<string, ProjectCardMeta>(),
  );
  return records.map((record) => {
    const meta = metaByProject.get(record.atUri);
    return {
      ...record,
      scopeTags: meta && meta.scopeTags.length > 0 ? meta.scopeTags : record.scopeTags,
      evidence: meta?.evidence ?? record.evidence ?? EMPTY_EVIDENCE_COUNTS,
    };
  });
}

type RawProjectCount = Pick<RawProjectCollection, "did" | "rkey" | "uri" | "title">;

const PROJECT_COLLECTION_COUNT_QUERY = `
  query ExplorerProjectCountRows(
    $first: Int!
    $after: String
    $where: OrgHypercertsCollectionWhereInput
    $sortBy: OrgHypercertsCollectionSortField
    $sortDirection: SortDirection
  ) {
    orgHypercertsCollection(
      first: $first
      after: $after
      where: $where
      sortBy: $sortBy
      sortDirection: $sortDirection
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did rkey uri title } }
    }
  }
`;

async function mapProjectConnection(
  conn: Connection<RawProjectCollection> | null | undefined,
  signal?: AbortSignal,
  options?: { withScopeTags?: boolean },
): Promise<Page<ProjectRecord>> {
  const nodes = (conn?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node): node is RawProjectCollection => Boolean(node?.did));
  let records = nodes.map(mapProjectCollection);
  records = await resolveImages(
    records,
    (record) => (record.imageRef && !record.imageUrl ? { did: record.did, ref: record.imageRef } : null),
    (record, url) => ({ ...record, imageUrl: url ?? record.imageUrl }),
    signal,
  );
  const locationUris = records
    .map((record) => record.locationUri)
    .filter((uri): uri is string => Boolean(uri));
  if (locationUris.length > 0) {
    const countryByLocation = await fetchCertifiedLocationCountriesByUri(locationUris, signal).catch(
      () => new Map<string, string>(),
    );
    records = records.map((record) =>
      record.locationUri && countryByLocation.has(record.locationUri)
        ? { ...record, country: countryByLocation.get(record.locationUri) ?? null }
        : record,
    );
  }
  if (options?.withScopeTags) {
    const pairs = records.map((record) => ({
      projectUri: record.atUri,
      certUri: record.bumicertUris[0],
    }));
    const metaByProject = await fetchProjectCardMeta(pairs, signal).catch(
      () => new Map<string, ProjectCardMeta>(),
    );
    records = records.map((record) => {
      const meta = metaByProject.get(record.atUri);
      if (!meta) return record;
      return {
        ...record,
        scopeTags: meta.scopeTags.length > 0 ? meta.scopeTags : record.scopeTags,
        evidence: meta.evidence,
      };
    });
  }
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

function projectSort(sort: ExplorerSortMode | undefined): { sortBy: string; sortDirection: "ASC" | "DESC" } {
  switch (sort) {
    case "oldest":
      return { sortBy: "createdAt", sortDirection: "ASC" };
    case "az":
      return { sortBy: "title", sortDirection: "ASC" };
    case "za":
      return { sortBy: "title", sortDirection: "DESC" };
    case "newest":
    default:
      return { sortBy: "createdAt", sortDirection: "DESC" };
  }
}

function mergeProjectWhere(...parts: Array<ProjectWhere | undefined>): ProjectWhere {
  return Object.assign({}, ...parts.filter(Boolean));
}

function projectFilterWhere(filters: ProjectIndexFilter[] | undefined): ProjectWhere | undefined {
  if (!filters?.length) return undefined;
  const where: ProjectWhere = {};
  if (filters.includes("images")) where.banner = { isNull: false };
  if (filters.includes("locations")) where.location = { isNull: false };
  return Object.keys(where).length > 0 ? where : undefined;
}

function projectRequiresDonationFilter(options?: ProjectQueryOptions): boolean {
  return options?.filters?.some((filter) => (DONATION_FILTER_KEYS as readonly string[]).includes(filter)) ?? false;
}

function projectSearchWhere(query: string | undefined): ProjectWhere[] {
  const q = query?.trim();
  if (!q) return [{}];
  return [{ title: { contains: q } }, { shortDescription: { contains: q } }];
}

function projectWhereVariants(options?: ProjectQueryOptions, badgeIndex?: FeaturedBadgeIndex): ProjectWhere[] {
  const badgeWheres = featuredBadgeRecordWhereVariants<ProjectWhere>(badgeIndex, "org.hypercerts.collection", options?.badgeFilters);
  if (badgeWheres.length === 0) return [];
  const projectCreatorWhere: ProjectWhere | undefined = options?.creatorDid?.trim()
    ? { did: { in: [options.creatorDid.trim()] } }
    : undefined;
  const base = mergeProjectWhere(PROJECT_TYPE_WHERE, projectFilterWhere(options?.filters), projectCreatorWhere);
  const variants: ProjectWhere[] = [];
  for (const badgeWhere of badgeWheres) {
    for (const searchWhere of projectSearchWhere(options?.query)) {
      variants.push(mergeProjectWhere(base, badgeWhere, searchWhere));
    }
  }
  return variants;
}

function compareProjects(a: ProjectRecord, b: ProjectRecord, sort: ExplorerSortMode | undefined): number {
  switch (sort) {
    case "oldest":
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case "az":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "za":
      return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
    case "newest":
    default:
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }
}

function uniqueProjects(records: ProjectRecord[], sort?: ExplorerSortMode): ProjectRecord[] {
  const map = new Map<string, ProjectRecord>();
  for (const record of records) map.set(record.id, record);
  return [...map.values()].sort((a, b) => compareProjects(a, b, sort));
}

async function fetchProjectPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
  where?: ProjectWhere,
  sort: ExplorerSortMode = "newest",
  withScopeTags?: boolean,
): Promise<Page<ProjectRecord>> {
  const { sortBy, sortDirection } = projectSort(sort);
  const data = await indexerQuery<{
    orgHypercertsCollection?: Connection<RawProjectCollection>;
  }>(PROJECT_COLLECTION_QUERY, { first, after, where: where ?? null, sortBy, sortDirection }, signal);
  return mapProjectConnection(data?.orgHypercertsCollection, signal, { withScopeTags });
}

async function fetchProjectCountPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
  where?: ProjectWhere,
  sort: ExplorerSortMode = "newest",
): Promise<Page<RawProjectCount>> {
  const { sortBy, sortDirection } = projectSort(sort);
  const data = await indexerQuery<{
    orgHypercertsCollection?: Connection<RawProjectCount>;
  }>(PROJECT_COLLECTION_COUNT_QUERY, { first, after, where: where ?? null, sortBy, sortDirection }, signal);
  const conn = data?.orgHypercertsCollection;
  const records = (conn?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node): node is RawProjectCount => Boolean(node?.did && node.rkey))
    .filter((node) => !isLikelyTestRecordName(node.title));
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

async function fetchProjectByDidPage(
  did: string,
  first: number,
  after: string | null,
  signal?: AbortSignal,
  withScopeTags?: boolean,
): Promise<Page<ProjectRecord>> {
  const data = await indexerQuery<{
    orgHypercertsCollection?: Connection<RawProjectCollection>;
  }>(PROJECT_COLLECTION_BY_DID_QUERY, { did, first, after }, signal);
  return mapProjectConnection(data?.orgHypercertsCollection, signal, { withScopeTags });
}

async function fetchProjectsFromCollections(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: ProjectRecord[]) => void,
  options?: ProjectQueryOptions,
): Promise<Page<ProjectRecord>> {
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : undefined;
  const variants = projectWhereVariants(options, badgeIndex);
  if (variants.length === 0) return { records: [], cursor: null, hasMore: false };
  const donationIndex = projectRequiresDonationFilter(options) ? await fetchDonationEligibilityIndex(signal) : null;
  const filterDonatable = (records: ProjectRecord[]) => donationIndex
    ? records.flatMap((record) => {
        const sources = recordDonationSources(record, donationIndex);
        if (!donationSourcesMatchFilters(sources, options?.filters)) return [];
        return [{ ...record, acceptsDonations: sources.gainforest || sources.maearth, donationSources: sources }];
      })
    : records;

  if (variants.length === 1) {
    if (!donationIndex) {
      return collectPaged(
        (first, cursor, nextSignal) => fetchProjectPage(first, cursor, nextSignal, variants[0], options?.sort, options?.withScopeTags),
        target,
        after,
        signal,
        onProgress,
      );
    }

    const records: ProjectRecord[] = [];
    let cursor = after;
    let hasMore = true;
    while (records.length < target && hasMore) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const page = await fetchProjectPage(INDEXER_MAX_PAGE, cursor, signal, variants[0], options?.sort, options?.withScopeTags);
      records.push(...filterDonatable(page.records));
      onProgress?.(uniqueProjects(records, options?.sort));
      cursor = page.cursor;
      hasMore = page.hasMore && Boolean(page.cursor);
    }
    // Do NOT slice to `target` here: the cursor has already advanced past every
    // raw record fetched, so any filtered record we drop now would be skipped
    // forever. `target` is a minimum fetch goal when post-filtering, not a cap.
    return { records: uniqueProjects(records, options?.sort), cursor, hasMore };
  }

  const previous = parseMultiCursor(after, variants.length);
  const pageTarget = donationIndex ? INDEXER_MAX_PAGE : target;
  const pages = await Promise.all(
    variants.map((where, index) => {
      if (!previous.more[index]) return Promise.resolve({ records: [], cursor: null, hasMore: false } satisfies Page<ProjectRecord>);
      return collectPaged(
        (first, cursor, nextSignal) => fetchProjectPage(first, cursor, nextSignal, where, options?.sort, options?.withScopeTags),
        pageTarget,
        previous.cursors[index] ?? null,
        signal,
      );
    }),
  );
  const records = uniqueProjects(filterDonatable(pages.flatMap((page) => page.records)), options?.sort);
  onProgress?.(records);
  return {
    // When donation-filtering, every surviving record must be returned: the
    // multi-cursor already points past all raw records fetched this round, so
    // slicing to `target` would permanently drop the excess.
    records,
    cursor: encodeMultiCursor({ cursors: pages.map((page) => page.cursor), more: pages.map((page) => page.hasMore) }),
    hasMore: pages.some((page) => page.hasMore),
  };
}

export async function fetchProjectTotalCount(signal?: AbortSignal, options?: ProjectQueryOptions): Promise<number> {
  return publicExploreCache("project-total-count", { options }, () => fetchProjectTotalCountUncached(undefined, options), signal);
}

async function fetchProjectTotalCountUncached(signal?: AbortSignal, options?: ProjectQueryOptions): Promise<number> {
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : undefined;
  const variants = projectWhereVariants(options, badgeIndex);
  if (variants.length === 0) return 0;
  const hidden = await hiddenDidsForScope(Boolean(options?.creatorDid?.trim()), signal);
  const donationIndex = projectRequiresDonationFilter(options) ? await fetchDonationEligibilityIndex(signal) : null;

  const seen = new Set<string>();
  for (const where of variants) {
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (donationIndex) {
        const page = await fetchProjectPage(INDEXER_MAX_PAGE, cursor, signal, where, options?.sort, false);
        for (const record of page.records) {
          if (hidden.has(record.did)) continue;
          if (!donationSourcesMatchFilters(recordDonationSources(record, donationIndex), options?.filters)) continue;
          seen.add(record.atUri);
        }
        cursor = page.cursor;
        hasMore = page.hasMore && Boolean(page.cursor);
        continue;
      }
      const page = await fetchProjectCountPage(INDEXER_MAX_PAGE, cursor, signal, where, options?.sort);
      for (const record of page.records) {
        if (hidden.has(record.did)) continue;
        seen.add(record.uri || `at://${record.did}/org.hypercerts.collection/${record.rkey}`);
      }
      cursor = page.cursor;
      hasMore = page.hasMore && Boolean(page.cursor);
    }
  }
  return seen.size;
}

/** Load org.hypercerts.collection records whose type is Project/project. */
export async function fetchProjects(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: ProjectRecord[]) => void,
  options?: ProjectQueryOptions,
): Promise<Page<ProjectRecord>> {
  const rawPromise = publicExploreCache(
    "projects-page",
    { target, after, options },
    () => fetchProjectsFromCollections(target, after, undefined, undefined, options),
    signal,
  );
  // Hide projects owned by flagged test accounts on the public catalog, but keep
  // them when the query is scoped to a single owner (their own profile).
  const ownerScoped = Boolean(options?.creatorDid?.trim());
  const pagePromise = rawPromise.then(async (page) => {
    const hidden = await hiddenDidsForScope(ownerScoped, signal);
    if (hidden.size === 0) return page;
    return { ...page, records: page.records.filter((record) => !hidden.has(record.did)) };
  });
  if (onProgress) void pagePromise.then((page) => onProgress(page.records)).catch(() => {});
  return pagePromise;
}

/** Load project collections created by a single account DID. */
export async function fetchProjectsByDid(
  did: string,
  target = 1000,
  after: string | null = null,
  signal?: AbortSignal,
  onProgress?: (records: ProjectRecord[]) => void,
  options?: { withScopeTags?: boolean },
): Promise<Page<ProjectRecord>> {
  return collectPaged(
    (first, cursor, nextSignal) => fetchProjectByDidPage(did, first, cursor, nextSignal, options?.withScopeTags),
    target,
    after,
    signal,
    onProgress,
  );
}

export type ProjectStats = {
  totalProjects: number | null;
  projectsWithBumicerts: number;
  bumicerts: number;
  projectsWithImages: number;
};

type RawProjectStats = Pick<RawProjectCollection, "items" | "avatar" | "banner">;

async function fetchProjectStatsPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
): Promise<StatsPage<RawProjectStats>> {
  const data = await indexerQuery<{
    orgHypercertsCollection?: Connection<RawProjectStats>;
  }>(PROJECT_COLLECTION_QUERY, {
    first,
    after,
    where: PROJECT_TYPE_WHERE,
    sortBy: "createdAt",
    sortDirection: "DESC",
  }, signal);
  const conn = data?.orgHypercertsCollection;
  const nodes = (conn?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node): node is RawProjectStats => Boolean(node));
  return {
    nodes,
    totalCount: conn?.totalCount ?? null,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

async function fetchProjectStatsUncached(): Promise<ProjectStats> {
  let after: string | null = null;
  let totalProjects: number | null = null;
  let seenRows = 0;
  let projectsWithBumicerts = 0;
  let bumicerts = 0;
  let projectsWithImages = 0;

  for (let page = 0; page < 100; page += 1) {
    const res = await fetchProjectStatsPage(INDEXER_MAX_PAGE, after);
    totalProjects ??= res.totalCount;
    seenRows += res.nodes.length;
    for (const node of res.nodes) {
      const itemCount = Array.isArray(node.items) ? node.items.length : 0;
      if (itemCount > 0) projectsWithBumicerts += 1;
      bumicerts += itemCount;
      if (collectionImageMeta(node.banner ?? null).url || collectionImageMeta(node.banner ?? null).ref || collectionImageMeta(node.avatar ?? null).url || collectionImageMeta(node.avatar ?? null).ref) {
        projectsWithImages += 1;
      }
    }
    if (!res.hasMore || !res.cursor) break;
    after = res.cursor;
  }

  return {
    totalProjects: totalProjects ?? seenRows,
    projectsWithBumicerts,
    bumicerts,
    projectsWithImages,
  };
}

export async function fetchProjectStats(signal?: AbortSignal): Promise<ProjectStats> {
  return publicExploreCache("project-total-stats", {}, fetchProjectStatsUncached, signal);
}

// ── 4. Project sites (organizations) ───────────────────────────────────────

/** Which lexicon a project-site row came from. */
type SiteSource = "certified";
/** Toolbar filter selection; legacy organization records are intentionally excluded. */
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
  /** Certified organization category (e.g. "nonprofit"). */
  orgType: string | null;
  /** AT-URI of the org's `app.certified.location` record, resolved to map coordinates on demand. */
  locationUri: string | null;
  createdAt: string | null;
  imageUrl: string | null;
  /** Wide profile banner image, when the organization has one. */
  bannerUrl: string | null;
  /** Square logo/avatar image, when the organization has one. */
  avatarUrl: string | null;
  coverRef: string | null;
  logoRef: string | null;
  /** Number of public Bumicerts created by this organization, when loaded. */
  bumicertCount: number | null;
  /** Number of nature sightings shared by this organization, when loaded. */
  observationCount: number | null;
  /** True when the organization can receive donations through a linked button or external donation page. */
  acceptsDonations: boolean | null;
  /** Per-source donation eligibility (native GainForest wallet vs Ma Earth campaign), when loaded. */
  donationSources: DonationSources | null;
};

const ORG_COUNT_BATCH_SIZE = 50;

type CountFieldBuilder = (did: string, index: number) => string;

async function fetchCountsByDid(
  dids: string[],
  queryName: string,
  fieldFor: CountFieldBuilder,
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const uniqueDids = Array.from(new Set(dids.filter(Boolean)));
  const counts = new Map(uniqueDids.map((did) => [did, 0]));
  if (uniqueDids.length === 0) return counts;

  const batches = Array.from(
    { length: Math.ceil(uniqueDids.length / ORG_COUNT_BATCH_SIZE) },
    (_, index) => uniqueDids.slice(index * ORG_COUNT_BATCH_SIZE, (index + 1) * ORG_COUNT_BATCH_SIZE),
  );

  await Promise.all(batches.map(async (batch, batchIndex) => {
    const query = `query ${queryName}${batchIndex} {\n${batch.map(fieldFor).join("\n")}\n}`;
    const data = await indexerQuery<Record<string, { totalCount?: number | null } | null>>(query, {}, signal);
    batch.forEach((did, index) => counts.set(did, data?.[`c${index}`]?.totalCount ?? 0));
  }));

  return counts;
}

function fetchBumicertCountsByDid(dids: string[], signal?: AbortSignal): Promise<Map<string, number>> {
  const uniqueDids = Array.from(new Set(dids.filter(Boolean))).sort();
  return publicExploreCache(
    "bumicert-counts-by-did",
    { dids: uniqueDids },
    () => fetchCountsByDid(
      uniqueDids,
      "OrganizationBumicertCounts",
      (did, index) => `c${index}: orgHypercertsClaimActivity(first: 0, where: { did: { eq: ${JSON.stringify(did)} } }) { totalCount }`,
    ),
    signal,
  );
}

function fetchObservationCountsByDid(dids: string[], signal?: AbortSignal): Promise<Map<string, number>> {
  const uniqueDids = Array.from(new Set(dids.filter(Boolean))).sort();
  return publicExploreCache(
    "observation-counts-by-did",
    { dids: uniqueDids },
    () => fetchCountsByDid(
      uniqueDids,
      "OrganizationObservationCounts",
      (did, index) => `c${index}: appGainforestDwcOccurrence(first: 0, where: { did: { eq: ${JSON.stringify(did)} } }) { totalCount }`,
    ),
    signal,
  );
}

type SiteIndexQuickFilter = "locations" | "bumicerts" | "observations" | "donations" | "donations-gainforest" | "donations-maearth";
export type SiteQueryOptions = {
  query?: string;
  country?: string | null;
  orgType?: string | null;
  quickFilters?: SiteIndexQuickFilter[];
  sort?: ExplorerSortMode;
  featuredBadgesOnly?: boolean;
  badgeFilters?: BumicertBadgeFilter[];
};

type SiteWhere = Record<string, unknown>;

function certifiedOrgSort(sort: ExplorerSortMode | undefined): { sortBy: string; sortDirection: "ASC" | "DESC" } {
  switch (sort) {
    case "oldest":
      return { sortBy: "createdAt", sortDirection: "ASC" };
    case "newest":
    default:
      return { sortBy: "createdAt", sortDirection: "DESC" };
  }
}

function siteMatchesOptions(record: SiteRecord, options?: SiteQueryOptions): boolean {
  const q = options?.query?.trim().toLowerCase();
  if (q) {
    const haystack = [record.name, record.country, record.orgType, record.source].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (options?.country && normalizeStatsCountry(record.country) !== options.country) return false;
  if (options?.orgType) {
    const types = (record.orgType ?? "").split(",").map((item) => item.trim().toLowerCase());
    if (!types.includes(options.orgType.toLowerCase())) return false;
  }
  const quick = options?.quickFilters ?? [];
  if (quick.includes("locations") && !record.locationUri) return false;
  if (quick.includes("bumicerts") && (record.bumicertCount ?? 0) <= 0) return false;
  if (quick.includes("observations") && (record.observationCount ?? 0) <= 0) return false;
  if (quick.includes("donations") && record.acceptsDonations !== true) return false;
  if (quick.includes("donations-gainforest") && record.donationSources?.gainforest !== true) return false;
  if (quick.includes("donations-maearth") && record.donationSources?.maearth !== true) return false;
  return true;
}

// ── Certified actor organizations (app.certified.actor.organization) ────────
//
// This lexicon's record carries no display name or image — those live in the
// actor's profile (app.certified.actor.profile/self). So we list the org
// records, then batch-resolve their profiles by URI (one aliased query per
// page) to get a name + avatar, and resolve the avatar blob to a URL.

const CERT_ORG_NODE_FIELDS = `
  did uri rkey createdAt visibility organizationType
  ${CERTIFIED_PROFILE_DATA_FIELDS}
  location { uri }
`;

const CERT_ORG_QUERY = `
  query ExplorerCertifiedOrgs(
    $first: Int!
    $after: String
    $where: AppCertifiedActorOrganizationWhereInput
    $sortBy: AppCertifiedActorOrganizationSortField
    $sortDirection: SortDirection
  ) {
    appCertifiedActorOrganization(
      first: $first
      after: $after
      where: $where
      sortBy: $sortBy
      sortDirection: $sortDirection
    ) {
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
  country?: string | null;
  location?: { uri?: string | null } | null;
  certifiedProfileData?: CertifiedProfileData;
};

type CertProfileInfo = { name: string | null; avatarRef: string | null };

export type IndexedCertifiedProfileCard = {
  displayName: string | null;
  avatarUrl: string | null;
};

/** Profile selection shared by the list join + the drawer detail. */
const CERT_PROFILE_SELECTION = `{
  displayName
  avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
}`;

type CertProfileNode = {
  displayName?: string | null;
  avatar?: { image?: { ref?: string | null } | null } | null;
} | null;

type DirectCertifiedOrgRecord = {
  locationUri: string | null;
  createdAt: string | null;
  foundedDate: string | null;
  visibility: string | null;
};

const directCertifiedOrgCache = new Map<string, Promise<DirectCertifiedOrgRecord | null>>();

async function fetchDirectCertifiedOrgRecord(
  did: string,
  signal?: AbortSignal,
): Promise<DirectCertifiedOrgRecord | null> {
  const read = async () => {
    const host = await resolvePdsHost(did, signal);
    if (!host) return null;
    const params = new URLSearchParams({ repo: did, collection: "app.certified.actor.organization", rkey: "self" });
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { value?: Record<string, unknown> } | null;
    const value = data?.value;
    if (!value) return null;
    const location = value.location;
    const locationUri = typeof location === "object" && location !== null && "uri" in location
      ? typeof location.uri === "string" ? location.uri : null
      : null;
    return {
      locationUri,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
      foundedDate: typeof value.foundedDate === "string" ? value.foundedDate : null,
      visibility: typeof value.visibility === "string" ? value.visibility : null,
    };
  };

  if (signal) return read();
  const cached = directCertifiedOrgCache.get(did);
  if (cached) return cached;
  const promise = read().catch((error) => {
    directCertifiedOrgCache.delete(did);
    if ((error as Error).name === "AbortError") throw error;
    return null;
  });
  directCertifiedOrgCache.set(did, promise);
  return promise;
}

const ORG_SELF_LOCATION_QUERY = `
  query OrgSelfLocation($uri: String!) {
    appCertifiedActorOrganizationByUri(uri: $uri) { location { uri } }
  }
`;

/** AT-URI of the organization's own location record — the certified location
 *  referenced by `app.certified.actor.organization/self` ("where the org is
 *  based"), as opposed to the sites its projects work in. Null when the org
 *  declares no location. Indexer first, direct-PDS record as fallback. */
export async function fetchOrganizationLocationUri(
  did: string,
  signal?: AbortSignal,
): Promise<string | null> {
  type OrgSelfLocationData = {
    appCertifiedActorOrganizationByUri?: { location?: { uri?: string | null } | null } | null;
  };
  const [data, direct] = await Promise.all([
    indexerQuery<OrgSelfLocationData>(
      ORG_SELF_LOCATION_QUERY,
      { uri: `at://${did}/app.certified.actor.organization/self` },
      signal,
    ).catch((err) => {
      if ((err as Error).name === "AbortError") throw err;
      return null;
    }),
    fetchDirectCertifiedOrgRecord(did, signal).catch(() => null),
  ]);
  // Same precedence as fetchAccountSummary: the live PDS record wins when readable.
  if (direct) return direct.locationUri;
  return sv(data?.appCertifiedActorOrganizationByUri?.location?.uri) ?? null;
}

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
    /* names/avatars are best-effort */
  }
  return map;
}

export async function fetchIndexedCertifiedProfileCards(
  dids: string[],
  signal?: AbortSignal,
): Promise<Map<string, IndexedCertifiedProfileCard>> {
  const profiles = await fetchCertProfiles(dids, signal);
  const cards = new Map<string, IndexedCertifiedProfileCard>();

  await Promise.all(
    [...profiles].map(async ([did, profile]) => {
      let avatarUrl: string | null = null;
      if (profile.avatarRef) {
        try {
          avatarUrl = await resolveBlobUrl(did, profile.avatarRef, signal);
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
        }
      }
      cards.set(did, { displayName: profile.name, avatarUrl });
    }),
  );

  return cards;
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
    bannerUrl: null,
    avatarUrl: null,
    coverRef: null,
    logoRef: profile?.avatarRef ?? null,
    bumicertCount: null,
    observationCount: null,
    acceptsDonations: null,
    donationSources: null,
  };
}

async function hydrateCertOrgs(
  nodes: RawCertOrg[],
  signal?: AbortSignal,
  includeBumicertCounts = false,
  includeObservationCounts = false,
  includeImages = true,
  includeDonationStatus = false,
): Promise<SiteRecord[]> {
  const missingProfileDids = nodes
    .filter((n) => !profileName(n.certifiedProfileData) && !profileAvatarRef(n.certifiedProfileData))
    .map((n) => n.did);
  const dids = nodes.map((n) => n.did);
  const locationUris = nodes
    .map((n) => sv(n.location?.uri))
    .filter((uri): uri is string => Boolean(uri));

  // Profiles, location countries, and per-org counts are independent of one
  // another — run them in parallel instead of as four sequential round trips.
  // The non-profile lookups never reject (they fall back to empty maps), so an
  // abort surfaces from the awaits below without leaving unhandled rejections.
  const profilesPromise = fetchCertProfiles(missingProfileDids, signal);
  const countriesPromise = fetchCertifiedLocationCountriesByUri(locationUris, signal)
    .catch(() => new Map<string, string>());
  const bumicertCountsPromise = includeBumicertCounts
    ? fetchBumicertCountsByDid(dids, signal).catch(() => new Map<string, number>())
    : null;
  const observationCountsPromise = includeObservationCounts
    ? fetchObservationCountsByDid(dids, signal).catch(() => new Map<string, number>())
    : null;
  const donationIndexPromise = includeDonationStatus
    ? fetchDonationEligibilityIndex(signal).catch(() => null)
    : null;

  const profiles = await profilesPromise;
  let records = nodes.map((n) => mapCertOrg(n, {
    name: profileName(n.certifiedProfileData) ?? profiles.get(n.did)?.name ?? null,
    avatarRef: profileAvatarRef(n.certifiedProfileData) ?? profiles.get(n.did)?.avatarRef ?? null,
  }));
  if (includeImages) {
    records = await resolveImages(
      records,
      (r) => (r.logoRef ? { did: r.did, ref: r.logoRef } : null),
      (r, url) => ({ ...r, avatarUrl: url, imageUrl: url ?? r.imageUrl }),
      signal,
      SITE_IMAGE_RESOLVE_LIMIT,
    );
  }
  const countryByLocation = await countriesPromise;
  records = records.map((record) => ({
    ...record,
    country: record.locationUri ? countryByLocation.get(record.locationUri) ?? record.country : record.country,
  }));
  if (bumicertCountsPromise) {
    const counts = await bumicertCountsPromise;
    records = records.map((record) => ({ ...record, bumicertCount: counts.get(record.did) ?? 0 }));
  }
  if (observationCountsPromise) {
    const counts = await observationCountsPromise;
    records = records.map((record) => ({ ...record, observationCount: counts.get(record.did) ?? 0 }));
  }
  if (donationIndexPromise) {
    const donationIndex = await donationIndexPromise;
    records = records.map((record) => {
      const sources: DonationSources = donationIndex
        ? recordDonationSources(record, donationIndex)
        : { gainforest: false, maearth: hasMaEarthDonationUrl(record.did) };
      return { ...record, acceptsDonations: sources.gainforest || sources.maearth, donationSources: sources };
    });
  }
  return records;
}

function certifiedWhere(options?: SiteQueryOptions): SiteWhere | undefined {
  const where: SiteWhere = {};
  const quick = options?.quickFilters ?? [];
  if (quick.includes("locations")) where.location = { isNull: false };
  if (options?.orgType) where.organizationType = { isNull: false };
  return Object.keys(where).length > 0 ? where : undefined;
}

function mergeSiteWhere(...parts: Array<SiteWhere | undefined>): SiteWhere {
  return Object.assign({}, ...parts.filter(Boolean));
}

function siteWhereVariants(options?: SiteQueryOptions, badgeIndex?: FeaturedBadgeIndex): SiteWhere[] {
  const badgeWheres = featuredBadgeRecordWhereVariants<SiteWhere>(badgeIndex, "app.certified.actor.organization", options?.badgeFilters);
  if (badgeWheres.length === 0) return [];
  const base = certifiedWhere(options);
  return badgeWheres.map((badgeWhere) => mergeSiteWhere(base, badgeWhere));
}

async function fetchCertOrgPage(
  first: number,
  after: string | null,
  signal?: AbortSignal,
  where?: SiteWhere,
  sort?: ExplorerSortMode,
  includeBumicertCounts = false,
  includeObservationCounts = false,
  includeImages = true,
  includeDonationStatus = false,
): Promise<Page<SiteRecord>> {
  const { sortBy, sortDirection } = certifiedOrgSort(sort);
  const data = await indexerQuery<{
    appCertifiedActorOrganization?: Connection<RawCertOrg>;
  }>(CERT_ORG_QUERY, { first, after, where: where ?? null, sortBy, sortDirection }, signal);
  const conn = data?.appCertifiedActorOrganization;
  const nodes = (conn?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawCertOrg => Boolean(n?.did));
  const records = (await hydrateCertOrgs(nodes, signal, includeBumicertCounts, includeObservationCounts, includeImages, includeDonationStatus))
    .filter((record) => !isLikelyTestRecordName(record.name));
  return {
    records,
    cursor: conn?.pageInfo?.endCursor ?? null,
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
  };
}

export type OrganizationStats = {
  organizations: number | null;
  countries: number;
  countryCodes: string[];
  withBumicerts: number;
  withObservations: number;
  mappedPlaces: number;
};

const CERT_ORG_STATS_QUERY = `
  query ExplorerCertifiedOrganizationStats($first: Int!, $after: String) {
    appCertifiedActorOrganization(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { did ${CERTIFIED_PROFILE_DATA_FIELDS} location { uri } } }
    }
  }
`;

type RawCertOrgStats = Pick<RawCertOrg, "did" | "location" | "certifiedProfileData">;

type CertifiedLocationStatsNode = CertifiedLocationLike & {
  location?: {
    __typename?: string | null;
    string?: string | null;
  } | null;
};

const LOCATION_COUNTRY_BATCH_SIZE = 100;

export async function fetchCertifiedLocationCountriesByUri(
  uris: string[],
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const uniqueUris = Array.from(new Set(uris.filter(Boolean))).sort();
  return publicExploreCache(
    "certified-location-countries",
    { uris: uniqueUris },
    () => fetchCertifiedLocationCountriesByUriUncached(uniqueUris),
    signal,
  );
}

async function fetchCertifiedLocationCountriesByUriUncached(uris: string[]): Promise<Map<string, string>> {
  const countries = new Map<string, string>();
  if (uris.length === 0) return countries;

  const fields = `{
    location {
      __typename
      ... on AppCertifiedLocationString { string }
    }
  }`;

  const batches = Array.from(
    { length: Math.ceil(uris.length / LOCATION_COUNTRY_BATCH_SIZE) },
    (_, index) => uris.slice(index * LOCATION_COUNTRY_BATCH_SIZE, (index + 1) * LOCATION_COUNTRY_BATCH_SIZE),
  );

  await Promise.all(batches.map(async (batch) => {
    const query = `query CertifiedLocationCountries {\n${batch
      .map((uri, index) => `l${index}: appCertifiedLocationByUri(uri: ${JSON.stringify(uri)}) ${fields}`)
      .join("\n")}\n}`;

    const data = await indexerQuery<Record<string, CertifiedLocationStatsNode | null>>(query, {});
    batch.forEach((uri, index) => {
      const country = countryCodeFromCertifiedLocation(data?.[`l${index}`]);
      if (country) countries.set(uri, country);
    });
  }));

  return countries;
}

function normalizeStatsCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
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

async function fetchCertifiedOrganizationStats(signal?: AbortSignal): Promise<OrganizationStats> {
  let after: string | null = null;
  let organizations: number | null = null;
  let seenRows = 0;
  let withBumicerts = 0;
  let withObservations = 0;
  let mappedPlaces = 0;
  const countries = new Set<string>();

  for (let page = 0; page < 100; page += 1) {
    const res = await fetchCertifiedOrgStatsPage(INDEXER_MAX_PAGE, after, signal);
    organizations ??= res.totalCount;
    seenRows += res.nodes.length;
    const dids = res.nodes.map((node) => node.did);
    const locationEntries = res.nodes.map((node) => node.location?.uri ?? null);
    const [countryByLocation, bumicertCounts, observationCounts] = await Promise.all([
      fetchCertifiedLocationCountriesByUri(
        locationEntries.filter((uri): uri is string => Boolean(uri)),
        signal,
      ).catch(() => new Map<string, string>()),
      fetchBumicertCountsByDid(dids, signal).catch(() => new Map<string, number>()),
      fetchObservationCountsByDid(dids, signal).catch(() => new Map<string, number>()),
    ]);
    for (const [index, node] of res.nodes.entries()) {
      const locationUri = locationEntries[index];
      const country = locationUri ? countryByLocation.get(locationUri) : null;
      if (country) countries.add(country);
      if ((bumicertCounts.get(node.did) ?? 0) > 0) withBumicerts += 1;
      if ((observationCounts.get(node.did) ?? 0) > 0) withObservations += 1;
      if (locationUri) mappedPlaces += 1;
    }
    if (!res.hasMore || !res.cursor) break;
    after = res.cursor;
  }

  return {
    organizations: organizations ?? seenRows,
    countries: countries.size,
    countryCodes: [...countries].sort(),
    withBumicerts,
    withObservations,
    mappedPlaces,
  };
}

async function fetchOrganizationStatsUncached(_source: SiteSourceFilter): Promise<OrganizationStats> {
  return fetchCertifiedOrganizationStats();
}

export async function fetchOrganizationStats(
  source: SiteSourceFilter = "both",
  signal?: AbortSignal,
): Promise<OrganizationStats> {
  return publicExploreCache("organization-total-stats", { source }, () => fetchOrganizationStatsUncached(source), signal);
}

function siteTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export async function fetchSiteTotalCount(signal?: AbortSignal, options?: SiteQueryOptions): Promise<number> {
  return publicExploreCache("site-total-count", { options }, () => fetchSiteTotalCountUncached(undefined, options), signal);
}

async function fetchSiteTotalCountUncached(signal?: AbortSignal, options?: SiteQueryOptions): Promise<number> {
  const includeBumicertCounts = options?.quickFilters?.includes("bumicerts") ?? false;
  const includeObservationCounts = options?.quickFilters?.includes("observations") ?? false;
  const includeDonationStatus = options?.quickFilters?.some((filter) => (DONATION_FILTER_KEYS as readonly string[]).includes(filter)) ?? false;
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : undefined;
  const variants = siteWhereVariants(options, badgeIndex);
  if (variants.length === 0) return 0;

  const seen = new Map<string, SiteRecord>();
  for (const where of variants) {
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const page = await fetchCertOrgPage(INDEXER_MAX_PAGE, cursor, signal, where, options?.sort, includeBumicertCounts, includeObservationCounts, false, includeDonationStatus);
      for (const record of page.records) {
        if (siteMatchesOptions(record, options)) seen.set(record.id, record);
      }
      cursor = page.cursor;
      hasMore = page.hasMore && Boolean(page.cursor);
    }
  }
  return seen.size;
}

/**
 * Load up to `target` organization profiles. Legacy organization records are
 * intentionally ignored; the optional `source` argument is kept so older call
 * sites that pass "both" still receive certified organization records.
 */
export async function fetchSites(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: SiteRecord[]) => void,
  _source: SiteSourceFilter = "both",
  options?: SiteQueryOptions,
): Promise<Page<SiteRecord>> {
  const pagePromise = publicExploreCache(
    "sites-page",
    { target, after, source: _source, options },
    () => fetchSitesUncached(target, after, undefined, undefined, _source, options),
    signal,
  );
  if (onProgress) void pagePromise.then((page) => onProgress(page.records)).catch(() => {});
  return pagePromise;
}

async function fetchSitesUncached(
  target: number,
  after: string | null,
  signal?: AbortSignal,
  onProgress?: (records: SiteRecord[]) => void,
  _source: SiteSourceFilter = "both",
  options?: SiteQueryOptions,
): Promise<Page<SiteRecord>> {
  const sortSites = (records: SiteRecord[]) => records.filter((record) => siteMatchesOptions(record, options)).sort((a, b) => {
    switch (options?.sort) {
      case "oldest":
        return siteTime(a.createdAt) - siteTime(b.createdAt);
      case "az":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "za":
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      case "newest":
      default:
        return siteTime(b.createdAt) - siteTime(a.createdAt);
    }
  });

  const includeBumicertCounts = options?.quickFilters?.includes("bumicerts") ?? false;
  const includeObservationCounts = options?.quickFilters?.includes("observations") ?? false;
  const includeDonationStatus = options?.quickFilters?.some((filter) => (DONATION_FILTER_KEYS as readonly string[]).includes(filter)) ?? false;
  const hasClientSideFilters = Boolean(
    options?.query?.trim() ||
    options?.country ||
    options?.orgType ||
    includeBumicertCounts ||
    includeObservationCounts ||
    includeDonationStatus,
  );
  const collectAllForNameSort = options?.sort === "az" || options?.sort === "za";
  const badgeIndex = options?.featuredBadgesOnly ? await fetchFeaturedBadgeIndex(signal) : undefined;
  const variants = siteWhereVariants(options, badgeIndex);
  if (variants.length === 0) return { records: [], cursor: null, hasMore: false };

  const uniqueSites = (records: SiteRecord[]) => {
    const map = new Map<string, SiteRecord>();
    for (const record of records) map.set(record.id, record);
    return [...map.values()];
  };

  const collectForWhere = async (where: SiteWhere, initialCursor: string | null): Promise<Page<SiteRecord>> => {
    const records: SiteRecord[] = [];
    let cursor = initialCursor;
    let hasMore = true;

    while (hasMore && (collectAllForNameSort || hasClientSideFilters || sortSites(records).length < target)) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const previousCursor = cursor;
      const matchedCount = sortSites(records).length;
      const first = collectAllForNameSort || hasClientSideFilters
        ? INDEXER_MAX_PAGE
        : Math.min(INDEXER_MAX_PAGE, Math.max(1, target - matchedCount));
      const page = await fetchCertOrgPage(first, cursor, signal, where, options?.sort, includeBumicertCounts, includeObservationCounts, true, includeDonationStatus);
      records.push(...page.records);
      cursor = page.cursor;
      const advanced = Boolean(cursor) && cursor !== previousCursor;
      hasMore = page.hasMore && advanced;
      if (!advanced) break;
    }

    const sorted = sortSites(uniqueSites(records));
    return {
      records: (collectAllForNameSort || hasClientSideFilters) ? sorted : sorted.slice(0, target),
      cursor,
      hasMore,
    };
  };

  if (variants.length === 1) {
    const page = await collectForWhere(variants[0]!, after);
    onProgress?.(page.records.slice(0, target));
    return page;
  }

  const previous = parseMultiCursor(after, variants.length);
  const pages = await Promise.all(
    variants.map((where, index) => {
      if (!previous.more[index]) return Promise.resolve({ records: [], cursor: null, hasMore: false } satisfies Page<SiteRecord>);
      return collectForWhere(where, previous.cursors[index] ?? null);
    }),
  );
  const sorted = sortSites(uniqueSites(pages.flatMap((page) => page.records)));
  const records = (collectAllForNameSort || hasClientSideFilters) ? sorted : sorted.slice(0, target);
  onProgress?.(records.slice(0, target));
  return {
    records,
    cursor: encodeMultiCursor({ cursors: pages.map((page) => page.cursor), more: pages.map((page) => page.hasMore) }),
    hasMore: pages.some((page) => page.hasMore),
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
  rawRecord?: Record<string, unknown> | null;
};

type ManagedLocationData =
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
          ${CERTIFIED_PROFILE_DATA_FIELDS}
          name description locationType
          location {
            __typename
            ... on AppCertifiedLocationString { string }
            ... on OrgHypercertsDefsUri { uri }
            ... on OrgHypercertsDefsSmallBlob { blob { ref } }
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
  certifiedProfileData?: CertifiedProfileData;
  location?: {
    __typename?: string;
    string?: string | null;
    uri?: string | null;
    blob?: { ref?: string | null } | null;
  } | null;
};

function parseLocationCoord(s: string): { lat: number; lon: number } | null {
  const parts = s.split(/[,\s]+/).map((p) => parseFloat(p)).filter((n) => !isNaN(n));
  if (parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return { lat: parts[0], lon: parts[1] };
  }
  return null;
}

async function mapLocation(raw: RawLocationNode, signal?: AbortSignal): Promise<ManagedLocation> {
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
    } else if (loc.__typename === "OrgHypercertsDefsSmallBlob" && loc.blob?.ref) {
      const uri = await resolveBlobUrl(raw.did, loc.blob.ref, signal).catch((err) => {
        if ((err as Error).name === "AbortError") throw err;
        return null;
      });
      location = uri ? { kind: "uri", uri } : { kind: "unknown" };
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
    all.push(...(await Promise.all(nodes.map((node) => mapLocation(node, signal)))));
    if (!conn?.pageInfo?.hasNextPage || !conn?.pageInfo?.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

const DEFAULT_SITE_BY_DID_QUERY = `
  query DefaultSiteByDid($did: String!) {
    appGainforestOrganizationDefaultSite(
      where: { did: { eq: $did } }
      first: 1
      sortDirection: DESC
      sortBy: createdAt
    ) {
      edges { node { site } }
    }
  }
`;

type RawDefaultSiteNode = { site?: string | null };

export async function fetchDefaultSiteByDid(
  did: string,
  signal?: AbortSignal,
): Promise<string | null> {
  type DefaultSitePage = {
    appGainforestOrganizationDefaultSite?: Connection<RawDefaultSiteNode>;
  };
  const data = await indexerQuery<DefaultSitePage>(
    DEFAULT_SITE_BY_DID_QUERY,
    { did },
    signal,
  );
  const node = data?.appGainforestOrganizationDefaultSite?.edges?.[0]?.node;
  return node?.site?.trim() || null;
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
          ${CERTIFIED_PROFILE_DATA_FIELDS}
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
  certifiedProfileData?: CertifiedProfileData;
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

export type AudioRecordingItem = {
  metadata: { did: string; uri: string; rkey: string; cid: string };
  record: {
    name: string | null;
    description: unknown;
    createdAt: string | null;
    blob: unknown;
    metadata: unknown;
    license: string | null;
    recordedBy: string | null;
    tags: string[] | null;
    occurrenceRef: string | null;
    deploymentRef: string | null;
    siteRef: string | null;
  };
};

export type AudioDeploymentItem = {
  metadata: { did: string; uri: string; rkey: string; cid: string };
  record: {
    createdAt: string | null;
    name: string | null;
    deviceModel: string | null;
    deviceSerialNumber: string | null;
    firmwareVersion: string | null;
    gain: string | null;
    recordingSchedule: string | null;
    sampleRateHz: number | null;
    microphoneType: string | null;
    mountingHeight: string | null;
    mountingOrientation: string | null;
    batteryType: string | null;
    storageMedia: string | null;
    deployedAt: string | null;
    retrievedAt: string | null;
    decimalLatitude: string | null;
    decimalLongitude: string | null;
    altitude: string | null;
    habitat: string | null;
    eventRef: string | null;
    siteRef: string | null;
    remarks: string | null;
  };
};

export type AudioEventItem = {
  metadata: { did: string; uri: string; rkey: string; cid: string };
  record: {
    createdAt: string | null;
    eventID: string | null;
    eventDate: string | null;
    eventTime: string | null;
    habitat: string | null;
    samplingProtocol: string | null;
    samplingEffort: string | null;
    fieldNotes: string | null;
    eventRemarks: string | null;
    decimalLatitude: string | null;
    decimalLongitude: string | null;
    geodeticDatum: string | null;
    coordinateUncertaintyInMeters: string | null;
    country: string | null;
    countryCode: string | null;
    stateProvince: string | null;
    county: string | null;
    municipality: string | null;
    locality: string | null;
    minimumElevationInMeters: string | null;
    maximumElevationInMeters: string | null;
    locationRemarks: string | null;
    monitoringProgramme: string | null;
    monitoringFrequency: string | null;
    temperature: string | null;
    humidity: string | null;
    windSpeed: string | null;
    cloudCover: string | null;
    precipitation: string | null;
    weatherRemarks: string | null;
    moonPhase: string | null;
    teamSize: string | null;
    recordedBy: string | null;
    equipmentUsed: string | null;
    qualityControlNotes: string | null;
    completeness: string | null;
  };
};

export type AudioWorkspace = {
  events: AudioEventItem[];
  deployments: AudioDeploymentItem[];
  recordings: AudioRecordingItem[];
};

const AUDIO_RECORDINGS_WORKSPACE_QUERY = `
  query AudioRecordingsWorkspaceByDid($did: String!, $first: Int!, $after: String) {
    appGainforestAcAudio(
      where: { did: { eq: $did } }
      sortDirection: DESC
      sortBy: createdAt
      first: $first
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri rkey cid createdAt name license recordedBy tags occurrenceRef deploymentRef siteRef
          description { text }
          blob { file { ref mimeType size } }
          metadata { bitDepth channels codec duration fileFormat fileSizeBytes maxFrequencyHz recordedAt sampleRate }
        }
      }
    }
  }
`;

const AUDIO_DEPLOYMENTS_BY_DID_QUERY = `
  query AudioDeploymentsByDid($did: String!, $first: Int!, $after: String) {
    appGainforestAcDeployment(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did uri rkey cid createdAt name deviceModel deviceSerialNumber firmwareVersion gain recordingSchedule sampleRateHz microphoneType mountingHeight mountingOrientation batteryType storageMedia deployedAt retrievedAt decimalLatitude decimalLongitude altitude habitat eventRef siteRef remarks } }
    }
  }
`;

const AUDIO_EVENTS_BY_DID_QUERY = `
  query AudioEventsByDid($did: String!, $first: Int!, $after: String) {
    appGainforestDwcEvent(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did uri rkey cid createdAt eventID eventDate eventTime habitat samplingProtocol samplingEffort fieldNotes eventRemarks decimalLatitude decimalLongitude geodeticDatum coordinateUncertaintyInMeters country countryCode stateProvince county municipality locality minimumElevationInMeters maximumElevationInMeters locationRemarks monitoringProgramme monitoringFrequency temperature humidity windSpeed cloudCover precipitation weatherRemarks moonPhase teamSize recordedBy equipmentUsed qualityControlNotes completeness } }
    }
  }
`;

type RawAudioWorkspaceNode = RawAudioNode & {
  license?: string | null;
  recordedBy?: string | null;
  tags?: string[] | null;
  occurrenceRef?: string | null;
  deploymentRef?: string | null;
  siteRef?: string | null;
  description?: { text?: string | null; facets?: unknown[] | null } | null;
  metadata?: (RawAudioNode["metadata"] & {
    bitDepth?: number | null;
    fileFormat?: string | null;
    fileSizeBytes?: number | null;
    maxFrequencyHz?: number | null;
  }) | null;
};

type RawAudioDeploymentNode = AudioDeploymentItem["metadata"] & AudioDeploymentItem["record"];
type RawAudioEventNode = AudioEventItem["metadata"] & AudioEventItem["record"];

function audioDescription(description: RawAudioWorkspaceNode["description"]): unknown {
  if (!description) return null;
  return {
    $type: "app.gainforest.common.defs#richtext",
    text: description.text ?? "",
    ...(description.facets && description.facets.length > 0 ? { facets: description.facets } : {}),
  };
}

async function audioBlobForNode(node: RawAudioWorkspaceNode, signal?: AbortSignal): Promise<unknown> {
  const file = node.blob?.file;
  const ref = normaliseRef(file?.ref);
  if (!ref) return null;
  const url = await resolveBlobUrl(node.did, ref, signal).catch(() => null);
  if (!url) return null;
  return {
    $type: "app.gainforest.common.defs#audio",
    file: {
      $type: "blob",
      uri: url,
      cid: ref,
      mimeType: file?.mimeType ?? undefined,
      size: file?.size ?? undefined,
    },
  };
}

function audioMetadataForNode(node: RawAudioWorkspaceNode): unknown {
  const metadata = node.metadata;
  if (!metadata) return null;
  return {
    $type: "app.gainforest.ac.audio#metadata",
    ...(metadata.codec !== undefined && { codec: metadata.codec }),
    ...(metadata.channels !== undefined && { channels: metadata.channels }),
    ...(metadata.duration !== undefined && { duration: metadata.duration }),
    ...(metadata.recordedAt !== undefined && { recordedAt: metadata.recordedAt }),
    ...(metadata.sampleRate !== undefined && { sampleRate: metadata.sampleRate }),
    ...(metadata.bitDepth !== undefined && { bitDepth: metadata.bitDepth }),
    ...(metadata.fileFormat !== undefined && { fileFormat: metadata.fileFormat }),
    ...(metadata.fileSizeBytes !== undefined && { fileSizeBytes: metadata.fileSizeBytes }),
    ...(metadata.maxFrequencyHz !== undefined && { maxFrequencyHz: metadata.maxFrequencyHz }),
  };
}

async function mapAudioWorkspaceNode(node: RawAudioWorkspaceNode, signal?: AbortSignal): Promise<AudioRecordingItem> {
  return {
    metadata: { did: node.did, uri: node.uri, rkey: node.rkey, cid: node.cid },
    record: {
      name: node.name ?? null,
      description: audioDescription(node.description),
      createdAt: node.createdAt ?? null,
      blob: await audioBlobForNode(node, signal),
      metadata: audioMetadataForNode(node),
      license: node.license ?? null,
      recordedBy: node.recordedBy ?? null,
      tags: node.tags ?? null,
      occurrenceRef: node.occurrenceRef ?? null,
      deploymentRef: node.deploymentRef ?? null,
      siteRef: node.siteRef ?? null,
    },
  };
}

async function fetchAudioRecordingItemsByDid(did: string, signal?: AbortSignal): Promise<AudioRecordingItem[]> {
  const all: AudioRecordingItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const data: { appGainforestAcAudio?: Connection<RawAudioWorkspaceNode> } | null = await indexerQuery<{ appGainforestAcAudio?: Connection<RawAudioWorkspaceNode> }>(
      AUDIO_RECORDINGS_WORKSPACE_QUERY,
      { did, first: 200, after: cursor },
      signal,
    );
    const conn: Connection<RawAudioWorkspaceNode> | undefined = data?.appGainforestAcAudio;
    const nodes: RawAudioWorkspaceNode[] = (conn?.edges ?? []).map((edge) => edge?.node).filter((node): node is RawAudioWorkspaceNode => Boolean(node?.did));
    all.push(...(await Promise.all(nodes.map((node) => mapAudioWorkspaceNode(node, signal)))));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

async function fetchAudioDeploymentItemsByDid(did: string, signal?: AbortSignal): Promise<AudioDeploymentItem[]> {
  const all: AudioDeploymentItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const data: { appGainforestAcDeployment?: Connection<RawAudioDeploymentNode> } | null = await indexerQuery<{ appGainforestAcDeployment?: Connection<RawAudioDeploymentNode> }>(
      AUDIO_DEPLOYMENTS_BY_DID_QUERY,
      { did, first: 200, after: cursor },
      signal,
    );
    const conn: Connection<RawAudioDeploymentNode> | undefined = data?.appGainforestAcDeployment;
    const nodes: RawAudioDeploymentNode[] = (conn?.edges ?? []).map((edge) => edge?.node).filter((node): node is RawAudioDeploymentNode => Boolean(node?.did));
    all.push(...nodes.map(({ did, uri, rkey, cid, ...record }) => ({ metadata: { did, uri, rkey, cid }, record })));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

async function fetchAudioEventItemsByDid(did: string, signal?: AbortSignal): Promise<AudioEventItem[]> {
  const all: AudioEventItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const data: { appGainforestDwcEvent?: Connection<RawAudioEventNode> } | null = await indexerQuery<{ appGainforestDwcEvent?: Connection<RawAudioEventNode> }>(
      AUDIO_EVENTS_BY_DID_QUERY,
      { did, first: 200, after: cursor },
      signal,
    );
    const conn: Connection<RawAudioEventNode> | undefined = data?.appGainforestDwcEvent;
    const nodes: RawAudioEventNode[] = (conn?.edges ?? []).map((edge) => edge?.node).filter((node): node is RawAudioEventNode => Boolean(node?.did));
    all.push(...nodes.map(({ did, uri, rkey, cid, ...record }) => ({ metadata: { did, uri, rkey, cid }, record })));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

export async function fetchAudioWorkspaceByDid(did: string, signal?: AbortSignal): Promise<AudioWorkspace> {
  const [events, deployments, recordings] = await Promise.all([
    fetchAudioEventItemsByDid(did, signal),
    fetchAudioDeploymentItemsByDid(did, signal),
    fetchAudioRecordingItemsByDid(did, signal),
  ]);
  return { events, deployments, recordings };
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
  const collected: OccurrenceRecord[] = [];
  let cursor: string | null = after;
  let hasNextPage = true;
  for (let page = 0; page < 20; page++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    // Only request what is still needed so the returned cursor never points
    // past records we would then drop (which would skip them on the next call).
    const res = await fetchOccurrencePage(Math.min(INDEXER_MAX_PAGE, target - collected.length), cursor, signal, where);
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

async function fetchOccurrencesByDatasetRef(
  did: string,
  datasetRef: string,
  signal?: AbortSignal,
  target = INDEXER_MAX_PAGE,
): Promise<OccurrenceRecord[]> {
  const where = { did: { eq: did }, datasetRef: { eq: datasetRef } };
  const collected: OccurrenceRecord[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  for (let page = 0; page < 50 && collected.length < target; page += 1) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const res = await fetchOccurrencePage(Math.min(INDEXER_MAX_PAGE, target - collected.length), cursor, signal, where);
    cursor = res.cursor;
    hasNextPage = res.hasNextPage;
    collected.push(...res.nodes.map(mapOccurrence));
    if (!hasNextPage || !cursor) break;
  }

  return collected.slice(0, target);
}

export async function fetchOccurrencesByDatasetRefs(
  did: string,
  datasetRefs: string[],
  signal?: AbortSignal,
  targetPerDataset = INDEXER_MAX_PAGE,
): Promise<OccurrenceRecord[]> {
  const uniqueRefs = Array.from(new Set(datasetRefs.map((ref) => ref.trim()).filter(Boolean)));
  const grouped: OccurrenceRecord[][] = [];
  const concurrency = 4;

  for (let index = 0; index < uniqueRefs.length; index += concurrency) {
    const batch = uniqueRefs.slice(index, index + concurrency);
    grouped.push(...await Promise.all(
      batch.map((datasetRef) => fetchOccurrencesByDatasetRef(did, datasetRef, signal, targetPerDataset)),
    ));
  }

  const byUri = new Map<string, OccurrenceRecord>();
  for (const record of grouped.flat()) byUri.set(record.atUri, record);
  return Array.from(byUri.values());
}

export async function fetchOccurrencesBySiteRef(
  did: string,
  siteRef: string,
  target = 10000,
  signal?: AbortSignal,
): Promise<Page<OccurrenceRecord>> {
  const where = { did: { eq: did }, siteRef: { eq: siteRef } };
  const collected: OccurrenceRecord[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  for (let page = 0; page < 50; page++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    // Only request what is still needed so the returned cursor never points
    // past records we would then drop.
    const res = await fetchOccurrencePage(Math.min(INDEXER_MAX_PAGE, target - collected.length), cursor, signal, where);
    cursor = res.cursor;
    hasNextPage = res.hasNextPage;

    for (const record of res.nodes.map(mapOccurrence)) {
      if (collected.length >= target) break;
      collected.push(record);
    }

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
  establishmentMeans?: string | null;
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
      edges { node { did uri rkey name description recordCount createdAt establishmentMeans ${CERTIFIED_PROFILE_DATA_FIELDS} } }
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
  establishmentMeans?: string | null;
  certifiedProfileData?: CertifiedProfileData;
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
        establishmentMeans: node.establishmentMeans?.trim() || null,
      })),
    );

    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }

  return all;
}

// ── 8. Manage section — tree measurements and photos by DID ───────────────

export type TreeMeasurementRecord = {
  metadata: {
    did: string;
    uri: string;
    rkey: string;
    cid: string | null;
    createdAt: string | null;
  };
  record: {
    occurrenceRef: string | null;
    result: unknown | null;
    measuredBy: string | null;
    measuredByID: string | null;
    measurementDate: string | null;
    measurementMethod: string | null;
    measurementRemarks: string | null;
    createdAt: string | null;
    legacyMeasurementType: string | null;
    legacyMeasurementValue: string | null;
    legacyMeasurementUnit: string | null;
    schemaVersion: "bundled" | "legacy";
  };
};

const TREE_MEASUREMENTS_BY_DID_QUERY = `
  query TreeMeasurementsByDid($did: String!, $first: Int!, $after: String) {
    appGainforestDwcMeasurement(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri rkey cid createdAt occurrenceRef measuredBy measuredByID measurementDate measurementMethod measurementRemarks
          result {
            __typename
            ... on AppGainforestDwcMeasurementFloraMeasurement {
              dbh totalHeight basalDiameter canopyCoverPercent
              dbhMeasurementHeight girth basalArea stemCount heightToFirstBranch buttressHeight heightMeasurementMethod crownDiameter crownDepth crownPosition crownDieback abovegroundBiomass belowgroundBiomass carbonContent woodDensity biomassAllometricEquation annualDiameterIncrement estimatedAge growthForm vitalityStatus healthScore damageType damageCause decayClass floweringStatus phenology leafAreaIndex colonyDiameter colonyHeight colonyMorphology bleachingStatus liveTissueCoverPercent depthBelowSurface
            }
            ... on AppGainforestDwcMeasurementFaunaMeasurement { bodyMass totalLength groupSize }
            ... on AppGainforestDwcMeasurementGenericMeasurement { measurements { measurementType measurementValue measurementUnit measurementMethod measurementRemarks measurementAccuracy } }
          }
        }
      }
    }
  }
`;

type RawTreeMeasurementNode = {
  did: string;
  uri: string;
  rkey: string;
  cid?: string | null;
  createdAt?: string | null;
  occurrenceRef?: string | null;
  measuredBy?: string | null;
  measuredByID?: string | null;
  measurementDate?: string | null;
  measurementMethod?: string | null;
  measurementRemarks?: string | null;
  result?: (Record<string, unknown> & { __typename?: string | null }) | null;
};

function omitUndefinedFields<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined || record[key] === null) delete record[key];
  }
  return record;
}

function normalizeTreeMeasurementResult(result: RawTreeMeasurementNode["result"]): unknown | null {
  if (!result) return null;
  const { __typename, ...rest } = result;
  if (__typename === "AppGainforestDwcMeasurementFloraMeasurement") {
    return omitUndefinedFields({
      $type: "app.gainforest.dwc.measurement#floraMeasurement",
      ...rest,
    });
  }
  if (__typename === "AppGainforestDwcMeasurementFaunaMeasurement") {
    return omitUndefinedFields({
      $type: "app.gainforest.dwc.measurement#faunaMeasurement",
      ...rest,
    });
  }
  if (__typename === "AppGainforestDwcMeasurementGenericMeasurement") {
    return omitUndefinedFields({
      $type: "app.gainforest.dwc.measurement#genericMeasurement",
      ...rest,
    });
  }
  return omitUndefinedFields({ ...rest });
}

function mapTreeMeasurement(node: RawTreeMeasurementNode): TreeMeasurementRecord {
  return {
    metadata: {
      did: node.did,
      uri: node.uri,
      rkey: node.rkey,
      cid: node.cid ?? null,
      createdAt: node.createdAt ?? null,
    },
    record: {
      occurrenceRef: node.occurrenceRef?.trim() || null,
      result: normalizeTreeMeasurementResult(node.result ?? null),
      measuredBy: node.measuredBy?.trim() || null,
      measuredByID: node.measuredByID?.trim() || null,
      measurementDate: node.measurementDate?.trim() || null,
      measurementMethod: node.measurementMethod?.trim() || null,
      measurementRemarks: node.measurementRemarks?.trim() || null,
      createdAt: node.createdAt ?? null,
      legacyMeasurementType: null,
      legacyMeasurementValue: null,
      legacyMeasurementUnit: null,
      schemaVersion: "bundled",
    },
  };
}

export async function fetchMeasurementsByDid(
  did: string,
  signal?: AbortSignal,
): Promise<TreeMeasurementRecord[]> {
  const all: TreeMeasurementRecord[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 50; page += 1) {
    type MeasurementPage = { appGainforestDwcMeasurement?: Connection<RawTreeMeasurementNode> };
    const data: MeasurementPage | null = await indexerQuery<MeasurementPage>(
      TREE_MEASUREMENTS_BY_DID_QUERY,
      { did, first: 200, after: cursor },
      signal,
    );
    const conn: Connection<RawTreeMeasurementNode> | undefined = data?.appGainforestDwcMeasurement;
    const nodes = (conn?.edges ?? [])
      .map((edge) => edge?.node)
      .filter((node): node is RawTreeMeasurementNode => Boolean(node?.did && node?.uri && node?.rkey));
    all.push(...nodes.map(mapTreeMeasurement));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }

  return all;
}

export type TreeMultimediaRecord = {
  metadata: {
    did: string;
    uri: string;
    rkey: string;
    cid: string | null;
    createdAt: string | null;
  };
  record: {
    occurrenceRef: string | null;
    siteRef: string | null;
    subjectPart: string | null;
    subjectPartUri: string | null;
    subjectOrientation: string | null;
    file: unknown | null;
    format: string | null;
    accessUri: string | null;
    variantLiteral: string | null;
    caption: string | null;
    creator: string | null;
    createDate: string | null;
    createdAt: string | null;
  };
};

export type ObservationMediaItem = TreeMultimediaRecord;

const MULTIMEDIA_NODE_FIELDS = `
  did uri rkey cid createdAt occurrenceRef siteRef subjectPart subjectPartUri subjectOrientation
  file { ref mimeType size }
  format accessUri variantLiteral caption creator createDate
`;

const TREE_MULTIMEDIA_BY_DID_QUERY = `
  query TreeMultimediaByDid($did: String!, $first: Int!, $after: String) {
    appGainforestAcMultimedia(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${MULTIMEDIA_NODE_FIELDS} } }
    }
  }
`;

const OCCURRENCE_MULTIMEDIA_QUERY = `
  query ObservationMedia($did: String!, $occurrenceRef: String!, $first: Int!, $after: String) {
    appGainforestAcMultimedia(
      where: { did: { eq: $did }, occurrenceRef: { eq: $occurrenceRef } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${MULTIMEDIA_NODE_FIELDS} } }
    }
  }
`;

type RawTreeMultimediaNode = {
  did: string;
  uri: string;
  rkey: string;
  cid?: string | null;
  createdAt?: string | null;
  occurrenceRef?: string | null;
  siteRef?: string | null;
  subjectPart?: string | null;
  subjectPartUri?: string | null;
  subjectOrientation?: string | null;
  file?: { ref?: string | null; mimeType?: string | null; size?: number | null } | null;
  format?: string | null;
  accessUri?: string | null;
  variantLiteral?: string | null;
  caption?: string | null;
  creator?: string | null;
  createDate?: string | null;
};

async function mapTreeMultimedia(node: RawTreeMultimediaNode, signal?: AbortSignal): Promise<TreeMultimediaRecord> {
  const ref = normaliseRef(node.file?.ref);
  const resolvedUrl = ref ? await resolveBlobUrl(node.did, ref, signal).catch(() => null) : null;
  const accessUri = resolvedUrl ?? node.accessUri?.trim() ?? null;
  return {
    metadata: {
      did: node.did,
      uri: node.uri,
      rkey: node.rkey,
      cid: node.cid ?? null,
      createdAt: node.createdAt ?? null,
    },
    record: {
      occurrenceRef: node.occurrenceRef?.trim() || null,
      siteRef: node.siteRef?.trim() || null,
      subjectPart: node.subjectPart?.trim() || null,
      subjectPartUri: node.subjectPartUri?.trim() || null,
      subjectOrientation: node.subjectOrientation?.trim() || null,
      file: ref
        ? {
            $type: "blob",
            uri: accessUri,
            cid: ref,
            mimeType: node.file?.mimeType ?? null,
            size: node.file?.size ?? null,
          }
        : null,
      format: node.format?.trim() || node.file?.mimeType || null,
      accessUri,
      variantLiteral: node.variantLiteral?.trim() || null,
      caption: node.caption?.trim() || null,
      creator: node.creator?.trim() || null,
      createDate: node.createDate?.trim() || null,
      createdAt: node.createdAt ?? null,
    },
  };
}

function isUnsupportedMultimediaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return message.includes("multimedia") && (message.includes("cannot query") || message.includes("unknown field") || message.includes("namespace"));
}

export async function fetchMultimediaByDid(
  did: string,
  signal?: AbortSignal,
): Promise<TreeMultimediaRecord[]> {
  const all: TreeMultimediaRecord[] = [];
  let cursor: string | null = null;

  try {
    for (let page = 0; page < 50; page += 1) {
      type MultimediaPage = { appGainforestAcMultimedia?: Connection<RawTreeMultimediaNode> };
      const data: MultimediaPage | null = await indexerQuery<MultimediaPage>(
        TREE_MULTIMEDIA_BY_DID_QUERY,
        { did, first: 200, after: cursor },
        signal,
      );
      const conn: Connection<RawTreeMultimediaNode> | undefined = data?.appGainforestAcMultimedia;
      const nodes = (conn?.edges ?? [])
        .map((edge) => edge?.node)
        .filter((node): node is RawTreeMultimediaNode => Boolean(node?.did && node?.uri && node?.rkey));
      all.push(...(await Promise.all(nodes.map((node) => mapTreeMultimedia(node, signal)))));
      if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      cursor = conn.pageInfo.endCursor;
    }
  } catch (error) {
    if (isUnsupportedMultimediaError(error)) return [];
    throw error;
  }

  return all;
}

export async function fetchObservationMedia(
  did: string,
  occurrenceRef: string,
  signal?: AbortSignal,
): Promise<ObservationMediaItem[]> {
  const all: ObservationMediaItem[] = [];
  let cursor: string | null = null;

  try {
    for (let page = 0; page < 10; page += 1) {
      type MultimediaPage = { appGainforestAcMultimedia?: Connection<RawTreeMultimediaNode> };
      const data: MultimediaPage | null = await indexerQuery<MultimediaPage>(
        OCCURRENCE_MULTIMEDIA_QUERY,
        { did, occurrenceRef, first: 50, after: cursor },
        signal,
      );
      const conn: Connection<RawTreeMultimediaNode> | undefined = data?.appGainforestAcMultimedia;
      const nodes = (conn?.edges ?? [])
        .map((edge) => edge?.node)
        .filter((node): node is RawTreeMultimediaNode => Boolean(node?.did && node?.uri && node?.rkey));
      all.push(...(await Promise.all(nodes.map((node) => mapTreeMultimedia(node, signal)))));
      if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      cursor = conn.pageInfo.endCursor;
    }
  } catch (error) {
    if (isUnsupportedMultimediaError(error)) return [];
    throw error;
  }

  return all;
}

export async function fetchObservationMediaCounts(
  occurrenceRefs: string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const unique = Array.from(new Set(occurrenceRefs.filter(Boolean)));
  try {
    for (let start = 0; start < unique.length; start += 40) {
      const batch = unique.slice(start, start + 40);
      const query = `query ObservationMediaCounts {\n${batch.map((uri, index) =>
        `c${index}: appGainforestAcMultimedia(first: 0, where: { occurrenceRef: { eq: ${JSON.stringify(uri)} } }) { totalCount }`,
      ).join("\n")}\n}`;
      const data = await indexerQuery<Record<string, { totalCount?: number | null } | null>>(query, {}, signal);
      batch.forEach((uri, index) => counts.set(uri, data?.[`c${index}`]?.totalCount ?? 0));
    }
  } catch (error) {
    if (isUnsupportedMultimediaError(error)) return counts;
    throw error;
  }
  return counts;
}

// ── 8b. Measurements attached to a single observation ──────────────────────
//
// Trees (and any sighting that carries field data) are occurrences with one or
// more linked measurement records. These helpers read those measurements so the
// values can be shown inline on the sighting itself — both on the gallery card
// and the detail view — instead of living in a separate "measurements" tab.

const OCCURRENCE_MEASUREMENT_NODE_FIELDS = `
  did uri rkey cid createdAt occurrenceRef measuredBy measuredByID measurementDate measurementMethod measurementRemarks
  result {
    __typename
    ... on AppGainforestDwcMeasurementFloraMeasurement {
      dbh totalHeight basalDiameter canopyCoverPercent girth stemCount estimatedAge
    }
    ... on AppGainforestDwcMeasurementFaunaMeasurement { bodyMass totalLength groupSize }
    ... on AppGainforestDwcMeasurementGenericMeasurement { measurements { measurementType measurementValue measurementUnit measurementMethod measurementRemarks measurementAccuracy } }
  }
`;

const OCCURRENCE_MEASUREMENTS_QUERY = `
  query ObservationMeasurements($occurrenceRef: String!, $first: Int!, $after: String) {
    appGainforestDwcMeasurement(
      where: { occurrenceRef: { eq: $occurrenceRef } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${OCCURRENCE_MEASUREMENT_NODE_FIELDS} } }
    }
  }
`;

function isUnsupportedMeasurementError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return message.includes("measurement") && (message.includes("cannot query") || message.includes("unknown field") || message.includes("namespace"));
}

/** Measurement records linked to one occurrence (its `occurrenceRef`). */
export async function fetchMeasurementsByOccurrence(
  occurrenceRef: string,
  signal?: AbortSignal,
): Promise<TreeMeasurementRecord[]> {
  if (!occurrenceRef) return [];
  const all: TreeMeasurementRecord[] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < 10; page += 1) {
      type MeasurementPage = { appGainforestDwcMeasurement?: Connection<RawTreeMeasurementNode> };
      const data: MeasurementPage | null = await indexerQuery<MeasurementPage>(
        OCCURRENCE_MEASUREMENTS_QUERY,
        { occurrenceRef, first: 50, after: cursor },
        signal,
      );
      const conn: Connection<RawTreeMeasurementNode> | undefined = data?.appGainforestDwcMeasurement;
      const nodes = (conn?.edges ?? [])
        .map((edge) => edge?.node)
        .filter((node): node is RawTreeMeasurementNode => Boolean(node?.did && node?.uri && node?.rkey));
      all.push(...nodes.map(mapTreeMeasurement));
      if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      cursor = conn.pageInfo.endCursor;
    }
  } catch (error) {
    if (isUnsupportedMeasurementError(error)) return [];
    throw error;
  }
  return all;
}

/** Measurements for many occurrences at once, keyed by `occurrenceRef`. Used by
 *  the gallery so each card can show its sighting's measurements without N
 *  round-trips. */
export async function fetchObservationMeasurements(
  occurrenceRefs: string[],
  signal?: AbortSignal,
): Promise<Map<string, TreeMeasurementRecord[]>> {
  const byOccurrence = new Map<string, TreeMeasurementRecord[]>();
  const unique = Array.from(new Set(occurrenceRefs.filter(Boolean)));
  if (unique.length === 0) return byOccurrence;
  try {
    for (let start = 0; start < unique.length; start += 20) {
      const batch = unique.slice(start, start + 20);
      const query = `query ObservationMeasurementsBatch {\n${batch
        .map((uri, index) =>
          `m${index}: appGainforestDwcMeasurement(first: 20, where: { occurrenceRef: { eq: ${JSON.stringify(uri)} } }) { edges { node { ${OCCURRENCE_MEASUREMENT_NODE_FIELDS} } } }`,
        )
        .join("\n")}\n}`;
      const data = await indexerQuery<Record<string, Connection<RawTreeMeasurementNode> | null>>(query, {}, signal);
      batch.forEach((uri, index) => {
        const conn = data?.[`m${index}`];
        const nodes = (conn?.edges ?? [])
          .map((edge) => edge?.node)
          .filter((node): node is RawTreeMeasurementNode => Boolean(node?.did && node?.uri && node?.rkey));
        byOccurrence.set(uri, nodes.map(mapTreeMeasurement));
      });
    }
  } catch (error) {
    if (isUnsupportedMeasurementError(error)) return byOccurrence;
    throw error;
  }
  return byOccurrence;
}

/** A single display-ready measurement value for an observation. */
export type ObservationMeasurementFact = {
  /** Stable key for a well-known field, used for translated labels. Null for
   *  free-form (generic) measurements, which carry their own label in `label`. */
  key: string | null;
  /** Human label for free-form generic measurements (user data, not translated). */
  label: string | null;
  /** Display value, with any unit already appended. */
  value: string;
};

const FLORA_MEASUREMENT_FACTS: Array<{ field: string; key: string; unit?: string }> = [
  { field: "dbh", key: "dbh", unit: "cm" },
  { field: "totalHeight", key: "height", unit: "m" },
  { field: "basalDiameter", key: "rootCollarDiameter", unit: "cm" },
  { field: "canopyCoverPercent", key: "canopyCover", unit: "%" },
  { field: "girth", key: "girth", unit: "cm" },
  { field: "stemCount", key: "stemCount" },
  { field: "estimatedAge", key: "estimatedAge", unit: "yr" },
];

const FAUNA_MEASUREMENT_FACTS: Array<{ field: string; key: string; unit?: string }> = [
  { field: "bodyMass", key: "bodyMass", unit: "g" },
  { field: "totalLength", key: "totalLength", unit: "cm" },
  { field: "groupSize", key: "groupSize" },
];

function formatMeasurementValue(raw: unknown, unit?: string): string | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  if (!unit) return text;
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

function isPlainMeasurementObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Flatten a sighting's measurement records into display-ready facts (deduped). */
export function summarizeObservationMeasurements(records: TreeMeasurementRecord[]): ObservationMeasurementFact[] {
  const facts: ObservationMeasurementFact[] = [];
  const seen = new Set<string>();
  const push = (fact: ObservationMeasurementFact) => {
    const dedupeKey = `${fact.key ?? fact.label ?? ""}:${fact.value}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    facts.push(fact);
  };

  for (const record of records) {
    const result = record.record.result;
    if (!isPlainMeasurementObject(result)) continue;
    const type = typeof result.$type === "string" ? result.$type : "";

    if (type.includes("faunaMeasurement")) {
      for (const def of FAUNA_MEASUREMENT_FACTS) {
        const value = formatMeasurementValue(result[def.field], def.unit);
        if (value) push({ key: def.key, label: null, value });
      }
      continue;
    }

    if (type.includes("genericMeasurement")) {
      const entries = Array.isArray(result.measurements) ? result.measurements : [];
      for (const entry of entries) {
        if (!isPlainMeasurementObject(entry)) continue;
        const measurementType = typeof entry.measurementType === "string" ? entry.measurementType.trim() : "";
        const measurementValue = typeof entry.measurementValue === "string"
          ? entry.measurementValue.trim()
          : typeof entry.measurementValue === "number"
            ? String(entry.measurementValue)
            : "";
        if (!measurementValue) continue;
        const measurementUnit = typeof entry.measurementUnit === "string" ? entry.measurementUnit.trim() : "";
        push({
          key: null,
          label: measurementType || null,
          value: measurementUnit ? `${measurementValue} ${measurementUnit}` : measurementValue,
        });
      }
      continue;
    }

    // Flora (the common tree case) and any unrecognised bundled measurement use
    // the flora fields, which cover the standard tree data.
    for (const def of FLORA_MEASUREMENT_FACTS) {
      const value = formatMeasurementValue(result[def.field], def.unit);
      if (value) push({ key: def.key, label: null, value });
    }
  }

  return facts;
}

// ── 9. Bumicert project updates attachments ─────────────────────────────

type TimelineAttachmentSubject = { uri: string | null; cid: string | null };

export type TimelineAttachmentItem = {
  metadata: {
    did: string | null;
    uri: string | null;
    rkey: string | null;
    cid: string | null;
    createdAt: string | null;
    indexedAt: string | null;
  };
  creatorInfo: {
    did: string | null;
    organizationName: string | null;
    organizationLogo: { uri: string | null; cid: string | null; mimeType: string | null; size: number | null } | null;
  } | null;
  record: {
    title: string | null;
    shortDescription: string | null;
    description: unknown;
    contentType: string | null;
    subjects: TimelineAttachmentSubject[] | null;
    content: unknown;
    createdAt: string | null;
  };
};

export type TimelineDatasetRecord = {
  metadata: { did: string; uri: string; rkey: string; cid: string; createdAt: string | null };
  record: { name: string; description: string | null; recordCount: number | null; createdAt: string | null };
};

const TIMELINE_ATTACHMENT_LEAFLET_FACETS_FRAGMENT = `
  fragment TimelineAttachmentLeafletFacets on PubLeafletRichtextFacet {
    index { byteStart byteEnd }
    features {
      __typename
      ... on PubLeafletRichtextFacetLink { uri }
      ... on PubLeafletRichtextFacetAtMention { href }
    }
  }
`;

const TIMELINE_ATTACHMENT_LEAFLET_BLOCKS_SELECTION = `
  blocks {
    alignment
    block {
      __typename
      ... on PubLeafletBlocksHeader { level plaintext facets { ...TimelineAttachmentLeafletFacets } }
      ... on PubLeafletBlocksText { plaintext facets { ...TimelineAttachmentLeafletFacets } }
      ... on PubLeafletBlocksBlockquote { plaintext facets { ...TimelineAttachmentLeafletFacets } }
      ... on PubLeafletBlocksCode { plaintext language }
      ... on PubLeafletBlocksImage { alt image { ref mimeType size } aspectRatio { width height } }
      ... on PubLeafletBlocksIframe { url height aspectRatio { width height } }
      ... on PubLeafletBlocksWebsite { src title description previewImage { ref } }
      ... on PubLeafletBlocksButton { text url }
      ... on PubLeafletBlocksHorizontalRule { empty }
      ... on PubLeafletBlocksUnorderedList {
        children { content {
          __typename
          ... on PubLeafletBlocksText { plaintext facets { ...TimelineAttachmentLeafletFacets } }
          ... on PubLeafletBlocksHeader { plaintext }
        } }
      }
      ... on PubLeafletBlocksOrderedList {
        children { content {
          __typename
          ... on PubLeafletBlocksText { plaintext facets { ...TimelineAttachmentLeafletFacets } }
        } }
      }
    }
  }
`;

const TIMELINE_ATTACHMENTS_BY_DID_QUERY = `
  ${TIMELINE_ATTACHMENT_LEAFLET_FACETS_FRAGMENT}
  query TimelineAttachmentsByDid($did: String!, $first: Int!, $after: String) {
    orgHypercertsContextAttachment(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri rkey cid createdAt
          ${CERTIFIED_PROFILE_DATA_FIELDS}
          title shortDescription contentType
          subjects { uri cid }
          description {
            __typename
            ... on OrgHypercertsDefsDescriptionString {
              value
              facets {
                index { byteStart byteEnd }
                features {
                  ... on AppBskyRichtextFacetMention { did }
                  ... on AppBskyRichtextFacetLink { uri }
                  ... on AppBskyRichtextFacetTag { tag }
                }
              }
            }
            ... on ComAtprotoRepoStrongRef { uri cid }
            ... on PubLeafletPagesLinearDocument { id ${TIMELINE_ATTACHMENT_LEAFLET_BLOCKS_SELECTION} }
          }
          content {
            __typename
            ... on OrgHypercertsDefsUri { uri }
            ... on OrgHypercertsDefsSmallBlob { blob { ref mimeType size } }
          }
        }
      }
    }
  }
`;

const TIMELINE_DATASET_BY_URI_QUERY = `
  query TimelineDatasetByUri($uri: String!) {
    appGainforestDwcDatasetByUri(uri: $uri) {
      did uri rkey cid createdAt name description recordCount
    }
  }
`;

const TIMELINE_LOCATION_BY_URI_QUERY = `
  query TimelineLocationByUri($uri: String!) {
    appCertifiedLocationByUri(uri: $uri) {
      did uri rkey cid createdAt name description locationType
      location {
        __typename
        ... on AppCertifiedLocationString { string }
        ... on OrgHypercertsDefsUri { uri }
      }
    }
  }
`;

type RawTimelineBskyFacet = {
  index?: { byteStart?: number | null; byteEnd?: number | null } | null;
  features?: Array<{ did?: string | null; uri?: string | null; tag?: string | null } | null> | null;
};

type RawTimelineLeafletFacet = {
  index?: { byteStart?: number | null; byteEnd?: number | null } | null;
  features?: Array<{ __typename?: string | null; uri?: string | null; href?: string | null } | null> | null;
};

type RawTimelineLeafletContent = {
  __typename?: string | null;
  plaintext?: string | null;
  facets?: RawTimelineLeafletFacet[] | null;
};

type RawTimelineBlobLike = {
  ref?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

type RawTimelineLeafletBlockValue = RawTimelineLeafletContent & {
  level?: number | null;
  language?: string | null;
  alt?: string | null;
  image?: RawTimelineBlobLike | null;
  previewImage?: RawTimelineBlobLike | null;
  aspectRatio?: { width?: number | null; height?: number | null } | null;
  url?: string | null;
  height?: number | null;
  src?: string | null;
  title?: string | null;
  description?: string | null;
  text?: string | null;
  empty?: boolean | null;
  children?: Array<{ content?: RawTimelineLeafletContent | null } | null> | null;
};

type RawTimelineLeafletBlock = {
  alignment?: string | null;
  block?: RawTimelineLeafletBlockValue | null;
};

type RawTimelineDescription =
  | string
  | {
      __typename?: string | null;
      value?: string | null;
      facets?: RawTimelineBskyFacet[] | null;
      uri?: string | null;
      cid?: string | null;
      id?: string | null;
      blocks?: RawTimelineLeafletBlock[] | null;
    }
  | null;

type RawTimelineAttachment = {
  did?: string | null;
  uri?: string | null;
  rkey?: string | null;
  cid?: string | null;
  createdAt?: string | null;
  title?: string | null;
  shortDescription?: string | null;
  contentType?: string | null;
  subjects?: Array<{ uri?: string | null; cid?: string | null } | null> | null;
  description?: RawTimelineDescription;
  content?: Array<{
    __typename?: string | null;
    uri?: string | null;
    blob?: RawTimelineBlobLike | null;
  } | null> | null;
  certifiedProfileData?: CertifiedProfileData;
};

type RawTimelineDataset = {
  did: string;
  uri: string;
  rkey: string;
  cid: string;
  createdAt?: string | null;
  name: string;
  description?: string | null;
  recordCount?: number | null;
};

type RawTimelineLocation = {
  did: string;
  uri: string;
  rkey: string;
  cid: string;
  createdAt?: string | null;
  name?: string | null;
  description?: string | null;
  locationType?: string | null;
  location?: { __typename?: string | null; string?: string | null; uri?: string | null } | null;
};

function normalizeTimelineBskyFacets(facets: RawTimelineBskyFacet[] | null | undefined): unknown[] {
  return (facets ?? []).flatMap((facet) => {
    if (!facet?.index) return [];

    const features: unknown[] = [];
    for (const feature of facet.features ?? []) {
      if (!feature) continue;
      if (typeof feature.did === "string") features.push({ $type: "app.bsky.richtext.facet#mention", did: feature.did });
      if (typeof feature.uri === "string") features.push({ $type: "app.bsky.richtext.facet#link", uri: feature.uri });
      if (typeof feature.tag === "string") features.push({ $type: "app.bsky.richtext.facet#tag", tag: feature.tag });
    }

    return [{
      index: {
        byteStart: facet.index.byteStart ?? 0,
        byteEnd: facet.index.byteEnd ?? 0,
      },
      features,
    }];
  });
}

function normalizeTimelineLeafletFacets(facets: RawTimelineLeafletFacet[] | null | undefined): unknown[] {
  return (facets ?? []).flatMap((facet) => {
    if (!facet?.index) return [];
    const features: unknown[] = [];
    for (const feature of facet.features ?? []) {
      if (!feature?.__typename) continue;
      features.push({
        __typename: feature.__typename,
        ...(feature.uri ? { uri: feature.uri } : {}),
        ...(feature.href ? { href: feature.href } : {}),
      });
    }
    return [{
      index: {
        byteStart: facet.index.byteStart ?? 0,
        byteEnd: facet.index.byteEnd ?? 0,
      },
      features,
    }];
  });
}

function normalizeTimelineAspectRatio(
  value: { width?: number | null; height?: number | null } | null | undefined,
): { width: number; height: number } | null {
  return value?.width && value.height ? { width: value.width, height: value.height } : null;
}

async function resolveTimelineLeafletBlob(
  blob: RawTimelineBlobLike | null | undefined,
  did: string | null | undefined,
  signal?: AbortSignal,
): Promise<{ $type: "blob"; uri: string | null; cid: string | null; mimeType: string | null; size: number | null } | null> {
  const ref = normaliseRef(blob?.ref);
  let uri: string | null = null;
  if (did && ref) {
    try {
      uri = await resolveBlobUrl(did, ref, signal);
    } catch {
      uri = null;
    }
  }
  return blob || ref
    ? { $type: "blob", uri, cid: ref, mimeType: blob?.mimeType ?? null, size: blob?.size ?? null }
    : null;
}

function timelineLeafletBlockType(typename: string): string {
  return typename
    .replace(/^PubLeafletBlocks/, "pub.leaflet.blocks.")
    .replace(/\.([A-Z])/, (_match, letter: string) => `.${letter.toLowerCase()}`);
}

async function normalizeTimelineLeafletContent(
  value: RawTimelineLeafletContent | null | undefined,
): Promise<unknown> {
  if (!value?.__typename) return value ?? null;
  return {
    __typename: value.__typename,
    $type: timelineLeafletBlockType(value.__typename),
    plaintext: value.plaintext ?? "",
    facets: normalizeTimelineLeafletFacets(value.facets),
  };
}

async function normalizeTimelineLeafletBlock(
  value: RawTimelineLeafletBlockValue | null | undefined,
  did: string | null | undefined,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!value?.__typename) return value ?? null;
  const base = {
    __typename: value.__typename,
    $type: timelineLeafletBlockType(value.__typename),
  };

  if (value.__typename === "PubLeafletBlocksText") {
    return { ...base, plaintext: value.plaintext ?? "", facets: normalizeTimelineLeafletFacets(value.facets) };
  }
  if (value.__typename === "PubLeafletBlocksHeader") {
    return { ...base, plaintext: value.plaintext ?? "", level: value.level ?? null, facets: normalizeTimelineLeafletFacets(value.facets) };
  }
  if (value.__typename === "PubLeafletBlocksBlockquote") {
    return { ...base, plaintext: value.plaintext ?? "", facets: normalizeTimelineLeafletFacets(value.facets) };
  }
  if (value.__typename === "PubLeafletBlocksCode") {
    return { ...base, plaintext: value.plaintext ?? "", language: value.language ?? null };
  }
  if (value.__typename === "PubLeafletBlocksImage") {
    return {
      ...base,
      alt: value.alt ?? null,
      image: await resolveTimelineLeafletBlob(value.image, did, signal),
      aspectRatio: normalizeTimelineAspectRatio(value.aspectRatio),
    };
  }
  if (value.__typename === "PubLeafletBlocksIframe") {
    return { ...base, url: value.url ?? null, height: value.height ?? null, aspectRatio: normalizeTimelineAspectRatio(value.aspectRatio) };
  }
  if (value.__typename === "PubLeafletBlocksWebsite") {
    return {
      ...base,
      src: value.src ?? null,
      title: value.title ?? null,
      description: value.description ?? null,
      previewImage: await resolveTimelineLeafletBlob(value.previewImage, did, signal),
    };
  }
  if (value.__typename === "PubLeafletBlocksButton") {
    return { ...base, text: value.text ?? "", url: value.url ?? null };
  }
  if (value.__typename === "PubLeafletBlocksHorizontalRule") {
    return { ...base, empty: value.empty ?? true };
  }
  if (value.__typename === "PubLeafletBlocksUnorderedList" || value.__typename === "PubLeafletBlocksOrderedList") {
    return {
      ...base,
      children: await Promise.all((value.children ?? []).map(async (child) => ({
        content: await normalizeTimelineLeafletContent(child?.content),
      }))),
    };
  }

  return value;
}

async function normalizeTimelineDescription(
  value: RawTimelineAttachment["description"],
  did: string | null | undefined,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!value) return null;
  if (typeof value === "string") {
    return value.trim() ? { $type: "org.hypercerts.defs#descriptionString", value } : null;
  }
  if (value.__typename === "OrgHypercertsDefsDescriptionString") {
    return {
      $type: "org.hypercerts.defs#descriptionString",
      value: value.value ?? "",
      facets: normalizeTimelineBskyFacets(value.facets),
    };
  }
  if (value.__typename === "ComAtprotoRepoStrongRef") {
    return { uri: value.uri ?? null, cid: value.cid ?? null };
  }
  if (value.__typename === "PubLeafletPagesLinearDocument" || Array.isArray(value.blocks)) {
    return {
      $type: "pub.leaflet.pages.linearDocument",
      id: value.id ?? null,
      blocks: await Promise.all((value.blocks ?? []).map(async (block) => ({
        $type: "pub.leaflet.pages.linearDocument#block",
        ...(block?.alignment ? { alignment: block.alignment } : {}),
        block: await normalizeTimelineLeafletBlock(block?.block, did, signal),
      }))),
    };
  }
  return value;
}

async function normalizeTimelineContent(
  items: RawTimelineAttachment["content"],
  did: string | null | undefined,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const normalized: unknown[] = [];
  for (const item of items ?? []) {
    if (!item?.__typename) continue;
    if (item.__typename === "OrgHypercertsDefsUri") {
      normalized.push({ $type: "org.hypercerts.defs#uri", uri: item.uri ?? "" });
      continue;
    }
    if (item.__typename === "OrgHypercertsDefsSmallBlob") {
      const ref = normaliseRef(item.blob?.ref);
      let uri: string | null = null;
      if (did && ref) {
        try {
          uri = await resolveBlobUrl(did, ref, signal);
        } catch {
          uri = null;
        }
      }
      normalized.push({
        $type: "org.hypercerts.defs#smallBlob",
        blob: {
          $type: "blob",
          uri,
          cid: ref,
          mimeType: item.blob?.mimeType ?? null,
          size: item.blob?.size ?? null,
        },
      });
    }
  }
  return normalized;
}

async function mapTimelineAttachment(
  node: RawTimelineAttachment,
  signal?: AbortSignal,
): Promise<TimelineAttachmentItem> {
  const did = node.did ?? null;
  const avatarRef = profileAvatarRef(node.certifiedProfileData);
  let logoUrl: string | null = null;
  if (did && avatarRef) {
    try {
      logoUrl = await resolveBlobUrl(did, avatarRef, signal);
    } catch {
      logoUrl = null;
    }
  }

  return {
    metadata: {
      did,
      uri: node.uri ?? null,
      rkey: node.rkey ?? null,
      cid: node.cid ?? null,
      createdAt: node.createdAt ?? null,
      indexedAt: null,
    },
    creatorInfo: did
      ? {
          did,
          organizationName: profileName(node.certifiedProfileData) ?? did,
          organizationLogo: logoUrl ? { uri: logoUrl, cid: null, mimeType: null, size: null } : null,
        }
      : null,
    record: {
      title: node.title?.trim() || null,
      shortDescription: node.shortDescription?.trim() || null,
      description: await normalizeTimelineDescription(node.description, did, signal),
      contentType: node.contentType?.trim() || null,
      subjects: (node.subjects ?? []).map((subject) => ({ uri: subject?.uri ?? null, cid: subject?.cid ?? null })),
      content: await normalizeTimelineContent(node.content, did, signal),
      createdAt: node.createdAt ?? null,
    },
  };
}

export async function fetchTimelineAttachmentsByDid(
  did: string,
  signal?: AbortSignal,
): Promise<TimelineAttachmentItem[]> {
  const all: TimelineAttachmentItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    type AttachmentPage = { orgHypercertsContextAttachment?: Connection<RawTimelineAttachment> };
    const data: AttachmentPage | null = await indexerQuery<AttachmentPage>(
      TIMELINE_ATTACHMENTS_BY_DID_QUERY,
      { did, first: 100, after: cursor },
      signal,
    );
    const conn: Connection<RawTimelineAttachment> | undefined = data?.orgHypercertsContextAttachment;
    const nodes = (conn?.edges ?? [])
      .map((edge) => edge?.node)
      .filter((node): node is RawTimelineAttachment => Boolean(node));
    all.push(...await Promise.all(nodes.map((node) => mapTimelineAttachment(node, signal))));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

export async function fetchTimelineDatasetByUri(
  uri: string,
  signal?: AbortSignal,
): Promise<TimelineDatasetRecord | null> {
  const data = await indexerQuery<{ appGainforestDwcDatasetByUri?: RawTimelineDataset | null }>(
    TIMELINE_DATASET_BY_URI_QUERY,
    { uri },
    signal,
  );
  const node = data?.appGainforestDwcDatasetByUri;
  if (!node?.uri) return null;
  return {
    metadata: { did: node.did, uri: node.uri, rkey: node.rkey, cid: node.cid, createdAt: node.createdAt ?? null },
    record: {
      name: node.name,
      description: node.description?.trim() || null,
      recordCount: typeof node.recordCount === "number" ? node.recordCount : null,
      createdAt: node.createdAt ?? null,
    },
  };
}

export async function fetchTimelineLocationByUri(
  uri: string,
  signal?: AbortSignal,
): Promise<ManagedLocation | null> {
  const data = await indexerQuery<{ appCertifiedLocationByUri?: RawTimelineLocation | null }>(
    TIMELINE_LOCATION_BY_URI_QUERY,
    { uri },
    signal,
  );
  const node = data?.appCertifiedLocationByUri;
  if (!node?.uri) return null;
  return mapLocation({
    ...node,
    createdAt: node.createdAt ?? null,
    location: node.location
      ? {
          __typename: node.location.__typename ?? undefined,
          string: node.location.string,
          uri: node.location.uri,
        }
      : null,
  });
}

// ── 10. Project image galleries ────────────────────────────────────────────

export type ProjectGalleryImage = {
  id: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  cid: string | null;
  attachmentUri: string;
  /** Linked project URI, or null for account-level galleries not tied to a project. */
  projectUri: string | null;
};

export type ProjectImageGallery = {
  id: string;
  attachmentUri: string;
  attachmentTitle: string | null;
  shortDescription: string | null;
  createdAt: string | null;
  /** Linked project URI, or null for account-level galleries not tied to a project. */
  projectUri: string | null;
  projectCid: string | null;
  projectTitle: string | null;
  images: ProjectGalleryImage[];
};

const PROJECT_GALLERIES_BY_DID_QUERY = `
  query ProjectGalleriesByDid($did: String!, $first: Int!, $after: String) {
    orgHypercertsContextAttachment(
      where: { did: { eq: $did }, contentType: { eq: "gallery" } }
      first: $first
      after: $after
      sortDirection: DESC
      sortBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri rkey cid createdAt title shortDescription contentType
          subjects { uri cid }
          content {
            __typename
            ... on OrgHypercertsDefsUri { uri }
            ... on OrgHypercertsDefsSmallBlob { blob { ref mimeType size } }
          }
        }
      }
    }
  }
`;

type RawProjectGalleryAttachment = {
  did?: string | null;
  uri?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  title?: string | null;
  shortDescription?: string | null;
  contentType?: string | null;
  subjects?: Array<{ uri?: string | null; cid?: string | null } | null> | null;
  content?: Array<{
    __typename?: string | null;
    uri?: string | null;
    blob?: { ref?: string | null; mimeType?: string | null; size?: number | null } | null;
  } | null> | null;
};

function projectSubjectFromAttachment(subjects: RawProjectGalleryAttachment["subjects"]): { uri: string; cid: string | null } | null {
  const subject = subjects?.find((item) => typeof item?.uri === "string" && item.uri.includes("/org.hypercerts.collection/"));
  return subject?.uri ? { uri: subject.uri, cid: subject.cid ?? null } : null;
}

function isGalleryImageMimeType(mimeType: string | null | undefined): boolean {
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
}

function isLikelyGalleryImageUri(uri: string): boolean {
  if (uri.startsWith("data:image/")) return true;
  try {
    return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(new URL(uri).pathname);
  } catch {
    return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(uri);
  }
}

async function mapProjectGalleryAttachment(
  node: RawProjectGalleryAttachment,
  signal?: AbortSignal,
): Promise<ProjectImageGallery | null> {
  const did = node.did ?? null;
  const attachmentUri = node.uri ?? (did && node.rkey ? `at://${did}/org.hypercerts.context.attachment/${node.rkey}` : null);
  if (!did || !attachmentUri || node.contentType?.toLowerCase() !== "gallery") return null;
  const subject = projectSubjectFromAttachment(node.subjects);
  // A gallery either links to a project (project gallery) or has no subjects at
  // all (an account-level gallery uploaded straight from the profile). If it is
  // pinned to some other subject (e.g. a Cert or location), it isn't ours.
  const hasAnySubject = Array.isArray(node.subjects) && node.subjects.some((item) => typeof item?.uri === "string");
  if (!subject && hasAnySubject) return null;
  const projectUri = subject?.uri ?? null;
  const projectCid = subject?.cid ?? null;

  const images = (await Promise.all((node.content ?? []).map(async (item, index): Promise<ProjectGalleryImage | null> => {
    if (!item?.__typename) return null;
    if (item.__typename === "OrgHypercertsDefsSmallBlob") {
      const cid = normaliseRef(item.blob?.ref);
      if (!cid || !isGalleryImageMimeType(item.blob?.mimeType)) return null;
      try {
        const url = await resolveBlobUrl(did, cid, signal);
        return url ? { id: `${attachmentUri}#${cid}`, url, cid, mimeType: item.blob?.mimeType ?? null, size: item.blob?.size ?? null, attachmentUri, projectUri } : null;
      } catch (error) {
        if ((error as Error).name === "AbortError") throw error;
        return null;
      }
    }
    if (item.__typename === "OrgHypercertsDefsUri") {
      const url = item.uri?.trim();
      if (!url || !isLikelyGalleryImageUri(url)) return null;
      return { id: `${attachmentUri}#uri-${index}`, url, cid: null, mimeType: null, size: null, attachmentUri, projectUri };
    }
    return null;
  }))).filter((image): image is ProjectGalleryImage => Boolean(image));

  if (images.length === 0) return null;
  return {
    id: attachmentUri,
    attachmentUri,
    attachmentTitle: node.title?.trim() || null,
    shortDescription: node.shortDescription?.trim() || null,
    createdAt: node.createdAt ?? null,
    projectUri,
    projectCid,
    projectTitle: null,
    images,
  };
}

export async function fetchProjectImageGalleriesByDid(
  did: string,
  signal?: AbortSignal,
): Promise<ProjectImageGallery[]> {
  const all: ProjectImageGallery[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    type GalleryPage = { orgHypercertsContextAttachment?: Connection<RawProjectGalleryAttachment> };
    const data: GalleryPage | null = await indexerQuery<GalleryPage>(PROJECT_GALLERIES_BY_DID_QUERY, { did, first: 100, after: cursor }, signal);
    const conn: Connection<RawProjectGalleryAttachment> | undefined = data?.orgHypercertsContextAttachment;
    const nodes = (conn?.edges ?? []).map((edge) => edge?.node).filter((node): node is RawProjectGalleryAttachment => Boolean(node));
    const galleries = await Promise.all(nodes.map((node) => mapProjectGalleryAttachment(node, signal)));
    all.push(...galleries.filter((gallery): gallery is ProjectImageGallery => Boolean(gallery)));
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

export function attachProjectTitlesToGalleries(
  galleries: ProjectImageGallery[],
  projects: ProjectRecord[],
): ProjectImageGallery[] {
  const projectTitles = new Map(projects.map((project) => [project.atUri, project.title]));
  return galleries.map((gallery) => ({
    ...gallery,
    projectTitle: (gallery.projectUri ? projectTitles.get(gallery.projectUri) : null) ?? gallery.projectTitle,
  }));
}

// ── Unified record type for the detail drawer ──────────────────────────────

export type ExplorerRecord = OccurrenceRecord | BumicertRecord | ProjectRecord | SiteRecord;
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

  if (collection === "app.gainforest.ac.audio") {
    const data = await indexerQuery<{ appGainforestAcAudioByUri?: RawAudioRecord | null }>(
      AUDIO_BY_URI_QUERY,
      { uri: atUri },
      signal,
    );
    const n = data?.appGainforestAcAudioByUri;
    if (!n?.did) return null;
    const audio = await resolveAudioBlob(n, signal);
    return mapAudioRecord(n, audio.ref, audio.url);
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

  if (collection === "org.hypercerts.collection") {
    const data = await indexerQuery<{ orgHypercertsCollectionByUri?: RawProjectCollection | null }>(
      `query ExplorerProjectByUri($uri: String!) {
        orgHypercertsCollectionByUri(uri: $uri) { ${PROJECT_COLLECTION_NODE_FIELDS} }
      }`,
      { uri: atUri },
      signal,
    );
    const n = data?.orgHypercertsCollectionByUri;
    if (!n?.did) return null;
    const rec = mapProjectCollection(n);
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
    const profile = profileName(n.certifiedProfileData) || profileAvatarRef(n.certifiedProfileData)
      ? { name: profileName(n.certifiedProfileData), avatarRef: profileAvatarRef(n.certifiedProfileData) }
      : (await fetchCertProfiles([n.did], signal)).get(n.did);
    const rec = mapCertOrg(n, profile);
    if (rec.logoRef) {
      try {
        rec.avatarUrl = await resolveBlobUrl(rec.did, rec.logoRef, signal);
        rec.imageUrl = rec.avatarUrl;
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

type DetailField = { label: string; value: string; wide?: boolean };
export type DetailSection = { title: string | null; fields: DetailField[] };
export type DetailBadge = { label: string; tone: "ok" | "warn" | "down" | "info" };
type DetailLink = { label: string; href: string };
/** A social/website link, rendered as a minimalist icon button in the drawer. */
type SocialLink = { href: string; platform: string };

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
  certifiedProfileData?: CertifiedProfileData;
  conservationStatus?: {
    iucnCategory?: string | null;
    nativeStatus?: string | null;
    citesAppendix?: string | null;
    iucnAssessmentDate?: string | null;
    nationalStatus?: string | null;
  } | null;
};

const OCCURRENCE_DETAIL_FIELDS = `
  did createdAt ${CERTIFIED_PROFILE_DATA_FIELDS} scientificName scientificNameAuthorship vernacularName taxonRank taxonomicStatus
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
    section("Name details", [
      field("Scientific name", sciName || null, true),
      field("Common name", f("vernacularName")),
      field("Name rank", f("taxonRank") ? cap(f("taxonRank")!) : null),
      field("Nature group", lineage || null, true),
    ]),
    section("Sighting details", [
      field("Sighting type", f("basisOfRecord")),
      field("Count", individuals),
      field("Life stage", f("lifeStage") ? cap(f("lifeStage")!) : null),
      field("Sex", f("sex") ? cap(f("sex")!) : null),
      field("Reproductive condition", f("reproductiveCondition")),
      field("Behavior", f("behavior")),
    ]),
    section("Place", [
      field("Place name", f("locality") ?? f("verbatimLocality"), true),
      field("City or town", f("municipality")),
      field("Area", f("county")),
      field("State / province", f("stateProvince")),
      field("Country", [countryFlagSafe(f("countryCode")), f("country")].filter(Boolean).join(" ") || null),
      field("Map location", coords, true),
      field("Elevation", elevation),
      field("Habitat", f("habitat"), true),
    ]),
    section("Shared details", [
      field("Shared by", profileName(n.certifiedProfileData)),
      field("Observed by", f("recordedBy")),
      field("Observed", eventWhen || null),
      field("Named by", f("identifiedBy")),
      field("Date named", f("dateIdentified")),
      field("Shared", f("createdAt") ? formatDateTime(f("createdAt")!) : null, true),
    ]),
    section("Source details", [
      field("Source name", f("datasetName")),
      field("Organization code", f("institutionCode")),
      field("Source group", f("collectionCode")),
      field("Survey method", f("samplingProtocol")),
      field("License", f("license")),
      field("Rights holder", f("rightsHolder")),
      field("Sighting ID", f("occurrenceID"), true),
    ]),
  ].filter((s) => s.fields.length > 0);

  const links: DetailLink[] = [];
  const gbif = f("gbifTaxonKey");
  if (gbif) links.push({ label: "Open outside reference", href: `https://www.gbif.org/species/${gbif}` });
  const ref = f("references");
  if (ref && /^https?:\/\//.test(ref)) links.push({ label: "Reference", href: ref });

  return {
    blurb: f("occurrenceRemarks") ?? f("fieldNotes") ?? f("identificationRemarks"),
    badges,
    sections,
    links,
  };
}

// Tiny local helper for occurrence detail rows where the country name already
// comes from the source record.
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
  certifiedProfileData?: CertifiedProfileData;
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
      ${CERTIFIED_PROFILE_DATA_FIELDS}
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

// Owner organization socials from the certified actor record and profile.
const OWNER_SOCIALS_QUERY = `
  query OwnerSocials($cert: String!, $profile: String!) {
    cert: appCertifiedActorOrganizationByUri(uri: $cert) {
      ${CERTIFIED_PROFILE_DATA_FIELDS}
      urls { url }
      longDescription { __typename ... on OrgHypercertsDefsDescriptionString { value } }
    }
    profile: appCertifiedActorProfileByUri(uri: $profile) {
      website
      description
    }
  }
`;

type OwnerOrg = {
  cert?: (CertifiedOrgNode & { certifiedProfileData?: CertifiedProfileData }) | null;
  profile?: {
    website?: string | null;
    description?: string | null;
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

/** Merge an owning organization's certified socials and pick a bio fallback. */
function buildOwnerSocials(owner: OwnerOrg | null): { socials: SocialLink[]; bio: string | null } {
  const urls: Array<string | null | undefined> = [owner?.profile?.website];
  for (const u of owner?.cert?.urls ?? []) urls.push(u?.url);
  const socials = socialsFromUrls(urls);
  const bio =
    (owner?.cert?.longDescription?.__typename === "OrgHypercertsDefsDescriptionString"
      ? sv(owner.cert.longDescription.value)
      : null) ?? sv(owner?.profile?.description);
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
    .map((s) => ({ label: s, tone: "info" }));

  const contributors = Array.isArray(n.contributors) ? n.contributors.length : 0;
  const sites = Array.isArray(n.locations) ? n.locations.length : 0;
  const start = sv(n.startDate);
  const end = sv(n.endDate);
  const period = start || end ? `${start ? formatDate(start) : "—"} → ${end ? formatDate(end) : "—"}` : null;

  const sections = [
    section("Claim", [
      field("Published by", profileName(n.certifiedProfileData), true),
      field("Work period", period, true),
      field("People named", contributors ? formatNumber(contributors) : null),
      field("Project places", sites ? formatNumber(sites) : null),
      field("Created", sv(n.createdAt) ? formatDateTime(n.createdAt as string) : null, true),
    ]),
  ].filter((s) => s.fields.length > 0);

  return { blurb, richBody, badges, sections, links: [], socials: owner.socials };
}

/** Fetch an owning organization's socials/bio for a record DID. */
async function fetchOwnerSocials(
  did: string,
  signal?: AbortSignal,
): Promise<{ socials: SocialLink[]; bio: string | null }> {
  try {
    const data = await indexerQuery<OwnerOrg>(
      OWNER_SOCIALS_QUERY,
      {
        cert: `at://${did}/app.certified.actor.organization/self`,
        profile: `at://${did}/app.certified.actor.profile/self`,
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

// ── Certified actor org detail ──────────────────────────────────────────────

const CERT_ORG_DETAIL_QUERY = `
  query CertifiedOrgDetail($org: String!, $profile: String!) {
    org: appCertifiedActorOrganizationByUri(uri: $org) {
      createdAt organizationType visibility foundedDate
      ${CERTIFIED_PROFILE_DATA_FIELDS}
      location { uri }
      urls { url }
      longDescription { __typename ... on OrgHypercertsDefsDescriptionString { value } }
    }
    profile: appCertifiedActorProfileByUri(uri: $profile) {
      displayName description website
      ${CERTIFIED_PROFILE_DATA_FIELDS}
    }
  }
`;

type CertOrgDetailNode = {
  org?: {
    organizationType?: string[] | null;
    location?: { uri?: string | null } | null;
    visibility?: string | null;
    foundedDate?: string | null;
    urls?: Array<{ url?: string | null }> | null;
    longDescription?: { __typename?: string; value?: string | null } | null;
    createdAt?: string | null;
    certifiedProfileData?: CertifiedProfileData;
  } | null;
  profile?: {
    displayName?: string | null;
    description?: string | null;
    website?: string | null;
    certifiedProfileData?: CertifiedProfileData;
  } | null;
};

function buildCertOrgDetail(d: CertOrgDetailNode, createdAt: string | null, country: string | null): RecordDetail {
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
      field("Country", country ? formatCountry(country) : null),
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
    const [data, directOrg] = await Promise.all([
      indexerQuery<CertOrgDetailNode>(
        CERT_ORG_DETAIL_QUERY,
        {
          org: atUri,
          profile: `at://${did}/app.certified.actor.profile/self`,
        },
        signal,
      ),
      fetchDirectCertifiedOrgRecord(did, signal).catch(() => null),
    ]);
    if (!data?.org) return null;
    const locationUri = directOrg ? directOrg.locationUri : sv(data.org.location?.uri) ?? null;
    const country = await fetchCertifiedLocationCountryCode(locationUri, signal).catch(() => null);
    return buildCertOrgDetail(
      data,
      sv(data.org.createdAt) ?? directOrg?.createdAt ?? null,
      country,
    );
  }
  return null;
}

// ── Account summary (handle → profile drawer) ──────────────────────────
//
// Clicking a handle anywhere opens a drawer about that DID: when its repo was
// created (PLC audit log), whether it publishes a certified organization
// profile, and how many Bumicerts + nature sightings it owns.
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
  bumicertCount: number;
  observationCount: number;
};

type AccountSummaryNode = {
  occ?: { totalCount?: number | null } | null;
  bumi?: { totalCount?: number | null } | null;
  certOrg?: {
    createdAt?: string | null;
    organizationType?: string[] | null;
    location?: { uri?: string | null } | null;
    visibility?: string | null;
    foundedDate?: string | null;
    certifiedProfileData?: CertifiedProfileData;
  } | null;
  certProfile?: {
    displayName?: string | null;
    description?: string | null;
    website?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
    certifiedProfileData?: CertifiedProfileData;
  } | null;
};

const ACCOUNT_SUMMARY_QUERY = `
  query AccountSummary($did: String!, $certOrg: String!, $certProfile: String!) {
    occ: appGainforestDwcOccurrence(first: 0, where: { did: { eq: $did } }) { totalCount }
    bumi: orgHypercertsClaimActivity(first: 0, where: { did: { eq: $did } }) { totalCount }
    certOrg: appCertifiedActorOrganizationByUri(uri: $certOrg) {
      createdAt organizationType visibility foundedDate
      ${CERTIFIED_PROFILE_DATA_FIELDS}
      location { uri }
    }
    certProfile: appCertifiedActorProfileByUri(uri: $certProfile) {
      displayName description website
      ${CERTIFIED_PROFILE_DATA_FIELDS}
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
  const [data, plc, directCertOrg] = await Promise.all([
    indexerQuery<AccountSummaryNode>(
      ACCOUNT_SUMMARY_QUERY,
      {
        did,
        certOrg: `at://${did}/app.certified.actor.organization/self`,
        certProfile: `at://${did}/app.certified.actor.profile/self`,
      },
      signal,
    ),
    fetchPlcIdentity(did, signal),
    fetchDirectCertifiedOrgRecord(did, signal).catch(() => null),
  ]);

  const certOrg = data?.certOrg ?? null;
  const profile = data?.certProfile ?? null;

  const certType =
    (certOrg?.organizationType ?? [])
      .map((t) => sv(t))
      .filter((t): t is string => Boolean(t))
      .map(cap)
      .join(", ") || null;

  // Avatar precedence: certified profile avatar → certified profile data.
  const avatarRef =
    normaliseRef(profile?.avatar?.image?.ref) ??
    profileAvatarRef(profile?.certifiedProfileData) ??
    profileAvatarRef(certOrg?.certifiedProfileData);
  let avatarUrl: string | null = null;
  if (avatarRef) {
    try {
      avatarUrl = await resolveBlobUrl(did, avatarRef, signal);
    } catch {
      /* monogram fallback in the UI */
    }
  }

  const rawVisibility = sv(certOrg?.visibility);
  const locationUri = directCertOrg ? directCertOrg.locationUri : sv(certOrg?.location?.uri) ?? null;
  const country = await fetchCertifiedLocationCountryCode(locationUri, signal).catch(() => null);

  return {
    did,
    handle: plc.handle,
    displayName: sv(profile?.displayName) ?? profileName(profile?.certifiedProfileData) ?? profileName(certOrg?.certifiedProfileData) ?? null,
    avatarUrl,
    bio: sv(profile?.description) ?? null,
    website: sv(profile?.website) ?? null,
    country,
    createdAt: sv(plc.createdAt) ?? sv(certOrg?.createdAt) ?? directCertOrg?.createdAt ?? null,
    foundedDate: sv(certOrg?.foundedDate) ?? directCertOrg?.foundedDate ?? null,
    visibility: rawVisibility === "unlisted" || rawVisibility === "Unlisted" ? "Unlisted" : rawVisibility ? "Public" : directCertOrg?.visibility === "unlisted" ? "Unlisted" : directCertOrg?.visibility ? "Public" : null,
    hasCertifiedProfile: Boolean(profile),
    hasCertifiedOrg: Boolean(certOrg) || Boolean(directCertOrg),
    certOrgType: certType,
    bumicertCount: data?.bumi?.totalCount ?? 0,
    observationCount: data?.occ?.totalCount ?? 0,
  };
}
