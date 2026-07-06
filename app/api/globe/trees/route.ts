import { NextResponse } from "next/server";
import { GLOBE_URL } from "../../../_lib/urls";
import { fetchMaEarthOrganizationDids } from "../../../_lib/indexer";
import { fetchOrganizationTreeCount } from "../../../globe/_lib/trees";
import type { GlobeTreeStat } from "../../../globe/_lib/globe-types";

// Measured-tree stats for the globe's "Tree data" tab: which organizations
// have uploaded tree data, and how many trees each file contains.
//
// The tree files themselves are not indexed anywhere — they live as `trees`
// blobs on each org's site records (or as legacy bucket shapefiles) — so this
// route resolves every roster organization's tree source server-side, counts
// the point features, and memoizes the result. Counting streams through
// `fetchOrganizationTreeCount` (uncached) so full geometry is never retained.
export const dynamic = "force-dynamic";
// A cold build resolves the tree source of every roster org; give the
// function room beyond the platform default.
export const maxDuration = 300;

const STATS_TTL_MS = 6 * 3_600_000;
/** A build that found nothing at all is retried much sooner. */
const DEGRADED_STATS_TTL_MS = 60_000;
/** How many orgs are resolved concurrently. */
const COUNT_CONCURRENCY = 24;
/** Per-org budget: PDS resolution + site records + tree file download. */
const PER_ORG_TIMEOUT_MS = 30_000;

const UPSTREAM_REVALIDATE_SECONDS = 3600;

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await fn(items[index]!);
      }
    }),
  );
}

/** Same discovery set as `/api/globe/organizations`: the curated Green Globe
 *  index plus every Ma Earth–badged organization. The client joins the counts
 *  back onto the roster it already has, so only DIDs are needed here. */
async function discoverDids(): Promise<string[]> {
  const dids = new Set<string>();
  try {
    const res = await fetch(`${GLOBE_URL}/api/list-organizations`, {
      next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
    });
    if (res.ok) {
      const orgs = (await res.json()) as Array<{ did?: string | null }>;
      for (const org of orgs) {
        const did = org?.did?.trim();
        if (did) dids.add(did);
      }
    }
  } catch {
    /* fall through with whatever we have */
  }
  try {
    for (const did of await fetchMaEarthOrganizationDids()) dids.add(did);
  } catch (error) {
    console.warn("[globe/trees] Ma Earth badge index failed", error);
  }
  return [...dids];
}

async function buildStats(): Promise<GlobeTreeStat[]> {
  const dids = await discoverDids();
  const stats: GlobeTreeStat[] = [];
  await mapWithConcurrency(dids, COUNT_CONCURRENCY, async (did) => {
    try {
      const trees = await fetchOrganizationTreeCount(did, AbortSignal.timeout(PER_ORG_TIMEOUT_MS));
      if (trees > 0) stats.push({ did, trees });
    } catch {
      /* unresolvable org — skipped */
    }
  });
  return stats.sort((a, b) => b.trees - a.trees);
}

let statsMemo: { at: number; ttl: number; promise: Promise<GlobeTreeStat[]> } | null = null;

export async function GET() {
  if (!statsMemo || Date.now() - statsMemo.at > statsMemo.ttl) {
    const promise = buildStats();
    const memo = { at: Date.now(), ttl: STATS_TTL_MS, promise };
    statsMemo = memo;
    promise.then(
      (stats) => {
        // An empty build is more likely an upstream hiccup than reality.
        if (statsMemo === memo && stats.length === 0) memo.ttl = DEGRADED_STATS_TTL_MS;
      },
      () => {
        // A failed build should not poison the memo.
        if (statsMemo === memo) statsMemo = null;
      },
    );
  }

  let stats: GlobeTreeStat[] = [];
  try {
    stats = await statsMemo.promise;
  } catch {
    /* return an empty list; the client shows the unavailable state */
  }

  return NextResponse.json(
    { organizations: stats },
    {
      headers: {
        "cache-control":
          stats.length === 0
            ? "s-maxage=60, stale-while-revalidate=300"
            : "s-maxage=3600, stale-while-revalidate=21600",
      },
    },
  );
}
