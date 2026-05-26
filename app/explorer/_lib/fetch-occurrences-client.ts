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

type PageResult = {
  hasNextPage: boolean;
  endCursor: string | null;
  nodes: RawNode[];
};

async function fetchPage(
  after: string | null,
  signal: AbortSignal,
): Promise<PageResult> {
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

/** Run a list of async tasks with bounded concurrency. Unlike a
 *  classic `mapConcurrent`, each task is responsible for emitting its
 *  own result ; this function only enforces the concurrency limit.
 *  The wall uses it to push records into the running list as soon as
 *  each PDS lookup resolves, instead of waiting for an entire batch
 *  to settle. */
async function runWithLimit(
  tasks: ReadonlyArray<() => Promise<void>>,
  limit: number,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      await tasks[i]!();
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    worker,
  );
  await Promise.all(workers);
}

export type WalkOptions = {
  /** Max image-bearing records to collect. Default 200. */
  target?: number;
  /** Max indexer pages to walk. Default 80. */
  maxPages?: number;
  /** Called with the running list every time a new record finishes
   *  resolving. Lets the UI fill cards in card-by-card instead of
   *  waiting for entire indexer pages. */
  onProgress?: (records: LiveOccurrence[]) => void;
  /** Standard AbortController signal; the walker bails between
   *  per-record resolutions when fired. */
  signal: AbortSignal;
};

/**
 * Walk the indexer in the browser and stream resolved image-bearing
 * occurrence records into the UI.
 *
 * The walk is pipelined: as soon as a page lands, we kick off the
 * next page's fetch IN PARALLEL with resolving the current page's
 * image-bearing records. This matters because the indexer is
 * cursor-paginated (Relay-style; you need each page's `endCursor`
 * before you can ask for the next) and each page takes ~6 s round-
 * trip ; without pipelining, an indexer stretch with no
 * image-bearing records would freeze the wall for that 6 s × N
 * stretch even though the per-page resolution work is trivial.
 *
 * Each successfully resolved record fires `onProgress` immediately
 * (not in batches), so the specimen wall fills in card-by-card as
 * PDS lookups complete. Returns the final list once the target is
 * hit or the indexer runs out of pages.
 */
export async function walkOccurrences(
  options: WalkOptions,
): Promise<LiveOccurrence[]> {
  const target = Math.max(1, options.target ?? DEFAULT_TARGET);
  const maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);
  const { signal, onProgress } = options;

  const records: LiveOccurrence[] = [];

  /* Start the first page fetch immediately. Subsequent pages start
     as soon as we have the previous page's endCursor (i.e. the
     moment its body lands), in parallel with resolving its records. */
  let pending: Promise<PageResult> | null = fetchPage(null, signal);

  for (let page = 0; page < maxPages && pending; page++) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    const result: PageResult = await pending;
    const { hasNextPage, endCursor, nodes } = result;

    /* Kick off the next page fetch before we start resolving this
       page's records, so the network is busy while we wait on PDS
       lookups. The `<` guard stops us from over-fetching once we
       already have enough records ; without it we'd spend an extra
       page-fetch worth of time after the target is hit. */
    const willContinue =
      hasNextPage &&
      endCursor &&
      page + 1 < maxPages &&
      records.length < target;
    pending = willContinue ? fetchPage(endCursor, signal) : null;

    /* Collect this page's image-bearing nodes and resolve them
       concurrently. Each task pushes its own result and fires
       `onProgress` the moment its PDS lookup lands, so the wall
       sees a stream of records rather than batches at page
       boundaries. The concurrency limit caps simultaneous PDS
       requests without forcing a batch barrier. */
    const candidates = nodes.filter((n) => n.imageEvidence?.file?.ref);
    if (candidates.length > 0) {
      const tasks = candidates.map((n) => async () => {
        if (records.length >= target || signal.aborted) return;
        const r = await nodeToRecord(n, signal);
        if (!r || signal.aborted) return;
        if (records.length >= target) return;
        records.push(r);
        onProgress?.(records.slice(0, target));
      });
      await runWithLimit(tasks, RESOLVE_CONCURRENCY);
    }

    if (records.length >= target) {
      /* Drop any in-flight next-page fetch; we have what we need. */
      pending = null;
      break;
    }
  }

  return records.slice(0, target);
}
