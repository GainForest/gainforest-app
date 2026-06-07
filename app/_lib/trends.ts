/**
 * Cumulative daily trend series for the hero KPI metrics, built from each
 * record's `createdAt`. These power the inline sparklines + the expand-to-full
 * chart modal on the home KPI band.
 *
 * Only the cheap collections are charted: Bumicerts (~800), project sites
 * (~100), and funding receipts (~200). Species observations (~400K) are
 * deliberately excluded — a per-day cumulative there would need hundreds of
 * filtered `totalCount` scans (~7s each on Hyperindex) and can't be built in
 * request time, so that card stays a plain stat.
 *
 * All fetches are cached via Next `revalidate`, mirroring kpis.ts.
 */

import { INDEXER_URL, FACILITATOR_DID } from "./urls";
import { ms, seriesFromIncrements, cumulativeTailSeries, type MetricSeries } from "./series";

export type { MetricSeries } from "./series";

const REVALIDATE = 60 * 15; // 15 minutes, matches kpis.ts.

export type ExplorerTrends = {
  /** Recent cumulative tail (newest ~1000 records) anchored to the true total.
   *  Species observations (~400k) can't be charted in full at request time, so
   *  we surface the recent growth slope from one cheap page. */
  observations: MetricSeries | null;
  bumicerts: MetricSeries | null;
  sites: MetricSeries | null;
  totalRaised: MetricSeries | null;
};

const USD = new Set(["USD", "USDC"]);

type Page<T> = { edges?: { node?: T | null }[] | null; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null };

/** Paginate a collection pulling only the fields needed for a series. */
async function fetchNodes<T>(
  rootField: string,
  selection: string,
  whereClause = "",
  cap = 5000,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  while (out.length < cap) {
    const args = [`first: 1000`, whereClause, after ? `after: "${after}"` : ""]
      .filter(Boolean)
      .join(", ");
    const query = `{ ${rootField}(${args}) { edges { node { ${selection} certifiedProfileData { displayName } } } pageInfo { hasNextPage endCursor } } }`;
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) break;
    const json = (await res.json()) as { data?: Record<string, Page<T>>; errors?: unknown };
    const conn = json.data?.[rootField];
    if (!conn) break;
    for (const e of conn.edges ?? []) if (e?.node) out.push(e.node);
    const page = conn.pageInfo;
    if (!page?.hasNextPage || !page.endCursor || page.endCursor === after) break;
    after = page.endCursor;
  }
  return out;
}

/** One cheap query: the newest 1000 occurrence timestamps + the true total
 *  count, turned into a cumulative tail ending at that total. */
async function fetchObservationsTail(): Promise<MetricSeries | null> {
  const query = `{
    appGainforestDwcOccurrence(first: 1000, sortBy: createdAt, sortDirection: DESC) {
      totalCount
      edges { node { createdAt certifiedProfileData { displayName } } }
    }
  }`;
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { appGainforestDwcOccurrence?: { totalCount?: number; edges?: { node?: { createdAt?: string; certifiedProfileData?: { displayName?: string | null } | null } }[] } };
  };
  const conn = json.data?.appGainforestDwcOccurrence;
  if (!conn) return null;
  const times = (conn.edges ?? []).map((e) => ms(e?.node?.createdAt)).filter((t) => !Number.isNaN(t));
  const total = conn.totalCount ?? times.length;
  return cumulativeTailSeries(times, total);
}

export async function fetchTrends(): Promise<ExplorerTrends> {
  const [observations, bumiNodes, siteNodes, receiptNodes] = await Promise.all([
    fetchObservationsTail().catch(() => null),
    fetchNodes<{ createdAt?: string }>("orgHypercertsClaimActivity", "createdAt").catch(() => []),
    fetchNodes<{ createdAt?: string }>("appCertifiedActorOrganization", "createdAt").catch(() => []),
    fetchNodes<{ createdAt?: string; amount?: string; currency?: string }>(
      "orgHypercertsFundingReceipt",
      "createdAt amount currency",
      `where: { did: { eq: "${FACILITATOR_DID}" } }`,
    ).catch(() => []),
  ]);

  const bumicerts = seriesFromIncrements(
    bumiNodes.map((n) => ({ t: ms(n.createdAt), inc: 1 })),
  );
  const sites = seriesFromIncrements(siteNodes.map((n) => ({ t: ms(n.createdAt), inc: 1 })));
  const totalRaised = seriesFromIncrements(
    receiptNodes
      .filter((n) => USD.has((n.currency ?? "").toUpperCase()))
      .map((n) => ({ t: ms(n.createdAt), inc: parseFloat(n.amount ?? "0") || 0 })),
  );

  return { observations, bumicerts, sites, totalRaised };
}
