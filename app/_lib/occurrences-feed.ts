/**
 * Live Darwin Core occurrence feed for the /explorer page.
 *
 * Walks the `appGainforestDwcOccurrence` GraphQL connection on
 * Hyperindex newest-first and resolves each record's `imageEvidence`
 * blob ref to a public PDS sync URL via plc.directory ; the shape
 * the explorer's specimen wall consumes.
 *
 * Sister-fetcher to `app/_lib/occurrences.ts`, which only asks for
 * `totalCount` for the /research hero KPI. This module pulls actual
 * edge rows (with images) and is therefore a much heavier call, so
 * it is intentionally only used by the explorer page; do not import
 * it from the landing.
 *
 * Why "live" in production works even though the walk is heavy:
 *
 *   - The page is server-rendered with `export const revalidate = 900`
 *     in `app/explorer/page.tsx`. After the first render, Next caches
 *     the full HTML for 15 minutes and serves it instantly to every
 *     subsequent visitor.
 *   - Every per-page indexer call below also passes
 *     `next: { revalidate: 900 }`, so each cursor page caches
 *     individually. After the first walk, any other server work that
 *     re-walks the same cursors reuses the cached pages instead of
 *     hitting Hyperindex again.
 *   - PDS-host lookups on plc.directory cache for 24h via the same
 *     mechanism + a module-scoped Map, so the second request for the
 *     same DID is free.
 *
 * Trade-off: the FIRST request after a deploy / cache eviction walks
 * the indexer (currently ~20-30 pages × ~6s each ≈ 2 minutes). That
 * happens during Next's static generation at build time, OR for the
 * single visitor who lands on the page after the cache expires. They
 * get a slow page; everyone else gets cached HTML.
 *
 * Records WITHOUT `imageEvidence` are skipped because the wall is
 * visual; the newest pages on the indexer are very sparse on image-
 * bearing records (most are auto-uploaded sensor entries), which is
 * why MAX_PAGES is generous below.
 */

const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL?.trim() ||
  "https://hi.gainforest.app/graphql";

/** Revalidate every 15 minutes ; matches bumicerts.ts. */
const REVALIDATE_SECONDS = 60 * 15;

/** PDS resolution cached for 24h ; PDS hosts rarely change. */
const PLC_REVALIDATE_SECONDS = 60 * 60 * 24;

/** Per-page size when walking the indexer. The indexer caps `first`
 *  at 100 regardless of the value passed, so 100 is the natural
 *  upper bound. Smaller pages mean more roundtrips. */
const PAGE_SIZE = 100;

/** Max pages to walk before giving up.
 *
 *  50 × 100 = 5000 records is enough to find ~120 image-bearing
 *  records given the indexer's current image-density. Bump this if
 *  the wall starts looking sparse; the cost is a slower first
 *  render. After the first walk the per-page cache kicks in and
 *  subsequent revalidations are fast. */
const MAX_PAGES = 50;

/** Parallel PDS lookups during the image-resolution pass. plc.directory
 *  + each community's PDS are independent hosts, so we can fan out
 *  without hammering any one of them. */
const RESOLVE_CONCURRENCY = 8;

export type LiveOccurrence = {
  id: string;
  did: string;
  rkey: string;
  /** Resolved PDS blob URL for the image. Never null in the returned
   *  list ; records without an image are filtered out. */
  imageUrl: string;
  scientificName: string | null;
  vernacularName: string | null;
  family: string | null;
  genus: string | null;
  /** Two-letter ISO country code if known. */
  countryCode: string | null;
  country: string | null;
  locality: string | null;
  lat: number | null;
  lon: number | null;
  /** IUCN red-list category (e.g. "LC", "NT", "VU", "EN", "CR"). */
  iucn: string | null;
  createdAt: string;
  eventDate: string | null;
  atUri: string;
};

export type LiveOccurrencesSnapshot = {
  /** Global Darwin Core record count from the indexer (all communities). */
  total: number;
  /** Records returned in this snapshot (with images). */
  records: LiveOccurrence[];
  /** Unique scientific-name count across `records`. */
  taxa: number;
  /** Unique community DIDs across `records`. */
  communities: number;
  /** When this snapshot was assembled (server time). Useful for the
   *  visitor to see the wall isn't a museum piece. */
  generatedAt: string;
  fromFallback: boolean;
};

// ── GraphQL ──────────────────────────────────────────────────────────────────

const OCCURRENCE_PAGE_QUERY = `
  query ExplorerOccurrenceFeed($first: Int!, $after: String) {
    appGainforestDwcOccurrence(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          did rkey createdAt eventDate
          scientificName vernacularName
          family genus
          country countryCode locality
          decimalLatitude decimalLongitude
          conservationStatus { iucnCategory }
          imageEvidence {
            file { ref mimeType size }
          }
        }
      }
    }
  }
`;

type RawOccurrenceNode = {
  did: string;
  rkey: string;
  createdAt: string;
  eventDate?: string | null;
  scientificName?: string | null;
  vernacularName?: string | null;
  family?: string | null;
  genus?: string | null;
  country?: string | null;
  countryCode?: string | null;
  locality?: string | null;
  decimalLatitude?: number | string | null;
  decimalLongitude?: number | string | null;
  conservationStatus?: { iucnCategory?: string | null } | null;
  imageEvidence?: {
    file?: { ref?: string | null } | null;
  } | null;
};

type OccurrencePageResponse = {
  data?: {
    appGainforestDwcOccurrence?: {
      totalCount?: number | null;
      pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
      edges?: Array<{ node?: RawOccurrenceNode | null } | null> | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

async function fetchPage(after: string | null): Promise<{
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
  nodes: RawOccurrenceNode[];
}> {
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({
      operationName: "ExplorerOccurrenceFeed",
      query: OCCURRENCE_PAGE_QUERY,
      variables: { first: PAGE_SIZE, after: after ?? null },
    }),
    // Each cursor page caches independently. After the first walk
    // these reads are free for 15 minutes.
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const json = (await res.json()) as OccurrencePageResponse;
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "graphql error");
  }
  const page = json.data?.appGainforestDwcOccurrence;
  if (!page) throw new Error("indexer returned no occurrence connection");
  const nodes: RawOccurrenceNode[] = [];
  for (const edge of page.edges ?? []) {
    if (edge?.node) nodes.push(edge.node);
  }
  return {
    totalCount: page.totalCount ?? 0,
    hasNextPage: Boolean(page.pageInfo?.hasNextPage),
    endCursor: page.pageInfo?.endCursor ?? null,
    nodes,
  };
}

// ── PDS resolution ───────────────────────────────────────────────────────────

const pdsHostCache = new Map<string, string | null>();

async function resolvePdsHost(did: string): Promise<string | null> {
  if (pdsHostCache.has(did)) return pdsHostCache.get(did) ?? null;
  try {
    const res = await fetch(`https://plc.directory/${did}`, {
      next: { revalidate: PLC_REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      pdsHostCache.set(did, null);
      return null;
    }
    const doc: { service?: Array<{ type?: string; serviceEndpoint?: string }> } =
      await res.json();
    const endpoint = doc.service?.find(
      (s) => s.type === "AtprotoPersonalDataServer",
    )?.serviceEndpoint;
    const host = endpoint ? new URL(endpoint).host : null;
    pdsHostCache.set(did, host);
    return host;
  } catch {
    pdsHostCache.set(did, null);
    return null;
  }
}

async function resolveBlobUrl(
  did: string,
  cidRef: string,
): Promise<string | null> {
  const host = await resolvePdsHost(did);
  if (!host) return null;
  return `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cidRef)}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Process an array in fixed-concurrency batches. Mirrors the shape
 *  of `p-limit` without the dependency ; we only need it once. */
async function mapConcurrent<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

export type FetchOccurrencesOptions = {
  /** Max number of image-bearing records to return. Default 48. */
  count?: number;
  /** Max pages of 100 records to walk before giving up. Default 50.
   *  Increase if the wall is looking sparse and you accept a slower
   *  first render. */
  maxPages?: number;
};

export async function fetchLiveOccurrences(
  options: FetchOccurrencesOptions = {},
): Promise<LiveOccurrencesSnapshot> {
  const count = Math.max(1, options.count ?? 48);
  const maxPages = Math.max(1, options.maxPages ?? MAX_PAGES);
  /* Slight over-fetch buffer so we still hit `count` even if a few
     PDS lookups fail. The indexer's per-record image-density is low
     so the candidate pool is already much larger than `count` by
     the time we stop walking; the buffer is just defensive. */
  const candidateTarget = Math.ceil(count * 1.25);

  try {
    /* Pass 1 ; page the indexer until we have enough image-bearing
       nodes. Cursor-based, so the loop is serial; per-page caching
       (REVALIDATE_SECONDS) makes subsequent walks within 15 min
       essentially free. */
    const matches: RawOccurrenceNode[] = [];
    let totalCount = 0;
    let after: string | null = null;

    for (let page = 0; page < maxPages; page++) {
      const { totalCount: tc, hasNextPage, endCursor, nodes } = await fetchPage(after);
      if (tc) totalCount = tc;
      for (const n of nodes) {
        if (!n.imageEvidence?.file?.ref) continue;
        matches.push(n);
      }
      if (matches.length >= candidateTarget) break;
      if (!hasNextPage || !endCursor) break;
      after = endCursor;
    }

    if (matches.length === 0) {
      throw new Error("indexer returned no image-bearing records");
    }

    /* Pass 2 ; resolve PDS hosts and build image URLs concurrently. */
    const resolvedNullable = await mapConcurrent(
      matches.slice(0, candidateTarget),
      RESOLVE_CONCURRENCY,
      async (n): Promise<LiveOccurrence | null> => {
        const ref = n.imageEvidence?.file?.ref;
        if (!ref) return null;
        const url = await resolveBlobUrl(n.did, ref);
        if (!url) return null;
        return {
          id: `${n.did}-${n.rkey}`,
          did: n.did,
          rkey: n.rkey,
          imageUrl: url,
          scientificName: n.scientificName?.trim() || null,
          vernacularName: n.vernacularName?.trim() || null,
          family: n.family?.trim() || null,
          genus: n.genus?.trim() || null,
          countryCode: n.countryCode?.trim() || null,
          country: n.country?.trim() || null,
          locality: n.locality?.trim() || null,
          lat: asNumber(n.decimalLatitude),
          lon: asNumber(n.decimalLongitude),
          iucn: n.conservationStatus?.iucnCategory?.trim() || null,
          createdAt: n.createdAt,
          eventDate: n.eventDate?.trim() || null,
          atUri: `at://${n.did}/app.gainforest.dwc.occurrence/${n.rkey}`,
        };
      },
    );
    const resolved = resolvedNullable.filter(
      (r): r is LiveOccurrence => r !== null,
    );

    if (resolved.length === 0) {
      throw new Error("indexer ok but no images resolved");
    }

    const records = resolved.slice(0, count);
    const taxa = new Set(records.map((r) => r.scientificName).filter((v) => v));
    const communities = new Set(records.map((r) => r.did));
    return {
      total: totalCount || FALLBACK_TOTAL,
      records,
      taxa: taxa.size,
      communities: communities.size,
      generatedAt: new Date().toISOString(),
      fromFallback: false,
    };
  } catch (err) {
    console.warn(
      "[explorer] live occurrences fetch failed, using fallback",
      err instanceof Error ? err.message : err,
    );
    return {
      ...FALLBACK_SNAPSHOT,
      generatedAt: new Date().toISOString(),
      fromFallback: true,
    };
  }
}

// ── Static fallback ──────────────────────────────────────────────────────────

/** Observed Darwin Core record count at baseline; matches occurrences.ts. */
const FALLBACK_TOTAL = 417_053;

/** Curated fallback so the wall is never empty. Five entries is the
 *  minimum that still reads as a wall in the marquee (the duplicate-
 *  set seam needs at least a handful of cards to avoid an obvious
 *  loop). All fallback rows reuse the same local image so we never
 *  ship a 404 in fallback mode ; `community-mangrove.webp` is the
 *  documentary mangrove-fieldwork shot from /data-commons. */
const FALLBACK_SNAPSHOT: LiveOccurrencesSnapshot = {
  total: FALLBACK_TOTAL,
  generatedAt: "1970-01-01T00:00:00.000Z",
  fromFallback: true,
  taxa: 5,
  communities: 2,
  records: [
    {
      id: "fallback-occ-1",
      did: "did:plc:fallback",
      rkey: "fb1",
      imageUrl: "/data-commons/community-mangrove.webp",
      scientificName: "Panthera onca",
      vernacularName: "Jaguar",
      family: "Felidae",
      genus: "Panthera",
      countryCode: "BR",
      country: "Brazil",
      locality: "Amazonas",
      lat: -3.12,
      lon: -60.02,
      iucn: "NT",
      createdAt: "2026-05-10T00:00:00.000Z",
      eventDate: "2026-05-10",
      atUri: "at://did:plc:fallback/app.gainforest.dwc.occurrence/fb1",
    },
    {
      id: "fallback-occ-2",
      did: "did:plc:fallback",
      rkey: "fb2",
      imageUrl: "/data-commons/community-mangrove.webp",
      scientificName: "Harpia harpyja",
      vernacularName: "Harpy eagle",
      family: "Accipitridae",
      genus: "Harpia",
      countryCode: "BR",
      country: "Brazil",
      locality: "Amazonas",
      lat: -2.99,
      lon: -60.07,
      iucn: "VU",
      createdAt: "2026-05-09T00:00:00.000Z",
      eventDate: "2026-05-09",
      atUri: "at://did:plc:fallback/app.gainforest.dwc.occurrence/fb2",
    },
    {
      id: "fallback-occ-3",
      did: "did:plc:fallback",
      rkey: "fb3",
      imageUrl: "/data-commons/community-mangrove.webp",
      scientificName: "Inia geoffrensis",
      vernacularName: "Amazon river dolphin",
      family: "Iniidae",
      genus: "Inia",
      countryCode: "BR",
      country: "Brazil",
      locality: "Rio Negro",
      lat: -3.1,
      lon: -60.2,
      iucn: "EN",
      createdAt: "2026-05-08T00:00:00.000Z",
      eventDate: "2026-05-08",
      atUri: "at://did:plc:fallback/app.gainforest.dwc.occurrence/fb3",
    },
    {
      id: "fallback-occ-4",
      did: "did:plc:fallback",
      rkey: "fb4",
      imageUrl: "/data-commons/community-mangrove.webp",
      scientificName: "Ara macao",
      vernacularName: "Scarlet macaw",
      family: "Psittacidae",
      genus: "Ara",
      countryCode: "PE",
      country: "Peru",
      locality: "Madre de Dios",
      lat: -12.6,
      lon: -69.18,
      iucn: "LC",
      createdAt: "2026-05-07T00:00:00.000Z",
      eventDate: "2026-05-07",
      atUri: "at://did:plc:fallback/app.gainforest.dwc.occurrence/fb4",
    },
    {
      id: "fallback-occ-5",
      did: "did:plc:fallback",
      rkey: "fb5",
      imageUrl: "/data-commons/community-mangrove.webp",
      scientificName: "Rhizophora mangle",
      vernacularName: "Red mangrove",
      family: "Rhizophoraceae",
      genus: "Rhizophora",
      countryCode: "PH",
      country: "Philippines",
      locality: "Palawan",
      lat: 9.83,
      lon: 118.74,
      iucn: "LC",
      createdAt: "2026-05-06T00:00:00.000Z",
      eventDate: "2026-05-06",
      atUri: "at://did:plc:fallback/app.gainforest.dwc.occurrence/fb5",
    },
  ],
};
