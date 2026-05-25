/**
 * Client-side Darwin Core occurrence walker for the /explorer
 * specimen wall.
 *
 * Runs entirely in the visitor's browser. Hyperindex
 * (`hi.gainforest.app/graphql`) and `plc.directory` both serve
 * `access-control-allow-origin: *`, so no API proxy is needed; the
 * browser fetches indexer pages and resolves PDS blob URLs directly.
 *
 * Why client-side and not server: the indexer's newest pages are
 * heavily skewed toward auto-uploaded sensor records with
 * `imageEvidence: null`. Finding ~30 image-bearing records requires
 * walking 1500-3000 records (~6 s per page), which blows past
 * Vercel's static-generation timeout for the page. Doing the walk in
 * the browser lets the page itself render instantly and the wall
 * fill in progressively.
 *
 * Progress callback: every time a new batch of resolved records is
 * available, `onProgress` is called with the running list. The
 * consumer (`<SpecimenWall />`) replaces its render with the new
 * list each time, so the wall fills in as cards become available
 * instead of waiting for the full walk.
 */

const INDEXER_URL = "https://hi.gainforest.app/graphql";

/** Per-page size when walking the indexer. Hyperindex caps at 100. */
const PAGE_SIZE = 100;

/** Stop after this many image-bearing records. The wall reads well
 *  with a deep sample ; ~200 cards is enough that the rolling
 *  marquee never visibly repeats, and that the taxa / community
 *  tallies in the right rail aren't a tiny outlier sample. */
const DEFAULT_TARGET = 200;

/** Safety cap on indexer pages walked. 80 × 100 = 8000 records is
 *  generous enough to cover sparse image-density stretches without
 *  spinning forever. The walk is progressive (records emit via
 *  onProgress as soon as each page resolves) so the wall is
 *  populated long before the full walk completes. */
const DEFAULT_MAX_PAGES = 80;

/** Parallel PDS lookups when resolving image URLs. */
const RESOLVE_CONCURRENCY = 8;

const OCCURRENCE_PAGE_QUERY = `
  query ExplorerOccurrenceClient($first: Int!, $after: String) {
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

export type LiveOccurrence = {
  id: string;
  did: string;
  rkey: string;
  imageUrl: string;
  scientificName: string | null;
  vernacularName: string | null;
  family: string | null;
  genus: string | null;
  countryCode: string | null;
  country: string | null;
  locality: string | null;
  lat: number | null;
  lon: number | null;
  iucn: string | null;
  createdAt: string;
  eventDate: string | null;
  atUri: string;
};

type RawNode = {
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
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
};

type PageResponse = {
  data?: {
    appGainforestDwcOccurrence?: {
      totalCount?: number | null;
      pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
      edges?: Array<{ node?: RawNode | null } | null> | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

async function fetchPage(
  after: string | null,
  signal: AbortSignal,
): Promise<{
  hasNextPage: boolean;
  endCursor: string | null;
  nodes: RawNode[];
}> {
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationName: "ExplorerOccurrenceClient",
      query: OCCURRENCE_PAGE_QUERY,
      variables: { first: PAGE_SIZE, after: after ?? null },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const json = (await res.json()) as PageResponse;
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "graphql error");
  }
  const page = json.data?.appGainforestDwcOccurrence;
  if (!page) throw new Error("indexer returned no occurrence connection");
  const nodes: RawNode[] = [];
  for (const edge of page.edges ?? []) {
    if (edge?.node) nodes.push(edge.node);
  }
  return {
    hasNextPage: Boolean(page.pageInfo?.hasNextPage),
    endCursor: page.pageInfo?.endCursor ?? null,
    nodes,
  };
}

// PDS host resolution ; memoised across walks so a repeated DID is free.
const pdsHostCache = new Map<string, string | null>();

async function resolvePdsHost(
  did: string,
  signal: AbortSignal,
): Promise<string | null> {
  if (pdsHostCache.has(did)) return pdsHostCache.get(did) ?? null;
  try {
    const res = await fetch(`https://plc.directory/${did}`, { signal });
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
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    pdsHostCache.set(did, null);
    return null;
  }
}

function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function nodeToRecord(
  n: RawNode,
  signal: AbortSignal,
): Promise<LiveOccurrence | null> {
  const ref = n.imageEvidence?.file?.ref;
  if (!ref) return null;
  const host = await resolvePdsHost(n.did, signal);
  if (!host) return null;
  const imageUrl = `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    n.did,
  )}&cid=${encodeURIComponent(ref)}`;
  return {
    id: `${n.did}-${n.rkey}`,
    did: n.did,
    rkey: n.rkey,
    imageUrl,
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
}

/** Process an array in fixed-concurrency batches. Mirrors p-limit
 *  without the dependency. */
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
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    worker,
  );
  await Promise.all(workers);
  return out;
}

export type WalkOptions = {
  /** Max image-bearing records to collect. Default 32. */
  target?: number;
  /** Max indexer pages to walk. Default 50. */
  maxPages?: number;
  /** Called with the running list every time a new page of records
   *  finishes resolving. Lets the UI render progressively. */
  onProgress?: (records: LiveOccurrence[]) => void;
  /** Standard AbortController signal; the walker bails between
   *  page fetches when fired. */
  signal: AbortSignal;
};

/**
 * Walk the indexer in the browser and return resolved
 * image-bearing occurrence records.
 *
 * Records are emitted via `onProgress` as soon as each page's
 * matches are resolved, then the final list is returned.
 */
export async function walkOccurrences(
  options: WalkOptions,
): Promise<LiveOccurrence[]> {
  const target = Math.max(1, options.target ?? DEFAULT_TARGET);
  const maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);
  const { signal, onProgress } = options;

  const records: LiveOccurrence[] = [];
  let after: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    const { hasNextPage, endCursor, nodes } = await fetchPage(after, signal);

    /* Collect this page's image-bearing nodes, then resolve their
       PDS blob URLs concurrently before continuing to the next
       page. This lets the wall fill in as soon as the first
       image-rich page lands instead of waiting for the whole walk. */
    const candidates = nodes.filter((n) => n.imageEvidence?.file?.ref);
    if (candidates.length > 0) {
      const resolved = await mapConcurrent(
        candidates,
        RESOLVE_CONCURRENCY,
        (n) => nodeToRecord(n, signal),
      );
      for (const r of resolved) if (r) records.push(r);
      onProgress?.(records.slice(0, target));
    }

    if (records.length >= target) break;
    if (!hasNextPage || !endCursor) break;
    after = endCursor;
  }

  return records.slice(0, target);
}
