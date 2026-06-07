/**
 * Server-side KPI prefetch for the hero band.
 *
 * Cheap aggregate queries against Hyperindex (`totalCount` only, no edge
 * rows) plus a single funding-receipt sweep for the raised total. All run in
 * parallel and each swallows its own error so a flaky upstream degrades to a
 * "—" rather than failing the page. Cached via Next's `revalidate` so the
 * shell stays fast and out of the per-request hot path.
 */

import { cachedAsync } from "./async-cache";
import { INDEXER_URL, FACILITATOR_DID } from "./urls";

const REVALIDATE = 60 * 15; // 15 minutes, matches gainforest-app's cadence.
const TOTAL_STATS_CACHE_MS = REVALIDATE * 1000;

export type ExplorerKpis = {
  occurrences: number | null;
  bumicerts: number | null;
  sites: number | null;
  locations: number | null;
  totalRaised: number | null;
  totalDonations: number | null;
};

const TOTALS_QUERY = `
  query ExplorerTotals {
    occ: appGainforestDwcOccurrence(first: 0) { totalCount }
    act: orgHypercertsClaimActivity(first: 0) { totalCount }
    org: appGainforestOrganizationInfo(first: 0) { totalCount }
    certOrg: appCertifiedActorOrganization(first: 0) { totalCount }
    loc: appCertifiedLocation(first: 0) { totalCount }
  }
`;

const RECEIPTS_TOTALS_QUERY = `
  query ExplorerReceiptTotals($did: String!, $after: String) {
    orgHypercertsFundingReceipt(
      where: { did: { eq: $did } }
      first: 200
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { amount currency } }
    }
  }
`;

export type CollectionTotals = Pick<
  ExplorerKpis,
  "occurrences" | "bumicerts" | "sites" | "locations"
>;

async function fetchTotalsUncached(): Promise<CollectionTotals> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: TOTALS_QUERY }),
      next: { revalidate: REVALIDATE },
    });
    const json = (await res.json()) as {
      data?: {
        occ?: { totalCount?: number | null };
        act?: { totalCount?: number | null };
        org?: { totalCount?: number | null };
        certOrg?: { totalCount?: number | null };
        loc?: { totalCount?: number | null };
      };
    };
    const d = json.data;
    const organizationCounts = [d?.org?.totalCount, d?.certOrg?.totalCount]
      .filter((count): count is number => typeof count === "number");
    const organizationProfiles = organizationCounts.reduce((sum, count) => sum + count, 0);
    return {
      occurrences: d?.occ?.totalCount ?? null,
      bumicerts: d?.act?.totalCount ?? null,
      sites: organizationCounts.length > 0 ? organizationProfiles : null,
      locations: d?.loc?.totalCount ?? null,
    };
  } catch {
    return { occurrences: null, bumicerts: null, sites: null, locations: null };
  }
}

const USD = new Set(["USD", "USDC"]);

export async function fetchTotals(): Promise<CollectionTotals> {
  return cachedAsync("home-collection-totals", TOTAL_STATS_CACHE_MS, fetchTotalsUncached);
}

async function fetchRaisedUncached(): Promise<
  Pick<ExplorerKpis, "totalRaised" | "totalDonations">
> {
  try {
    let after: string | null = null;
    let total = 0;
    let count = 0;
    for (let page = 0; page < 5; page++) {
      const res: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: RECEIPTS_TOTALS_QUERY,
          variables: { did: FACILITATOR_DID, after },
        }),
        next: { revalidate: REVALIDATE },
      });
      const json = (await res.json()) as {
        data?: {
          orgHypercertsFundingReceipt?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: { amount?: string; currency?: string } | null }>;
          } | null;
        };
      };
      const conn = json.data?.orgHypercertsFundingReceipt;
      if (!conn) break;
      for (const e of conn.edges ?? []) {
        const node = e?.node;
        if (!node) continue;
        if (!USD.has((node.currency ?? "").toUpperCase())) continue;
        const amt = parseFloat(node.amount ?? "0");
        if (Number.isFinite(amt)) {
          total += amt;
          count += 1;
        }
      }
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return { totalRaised: total, totalDonations: count };
  } catch {
    return { totalRaised: null, totalDonations: null };
  }
}

export async function fetchRaised(): Promise<
  Pick<ExplorerKpis, "totalRaised" | "totalDonations">
> {
  return cachedAsync("home-raised-totals", TOTAL_STATS_CACHE_MS, fetchRaisedUncached);
}

export async function fetchKpis(): Promise<ExplorerKpis> {
  const [totals, raised] = await Promise.all([fetchTotals(), fetchRaised()]);
  return { ...totals, ...raised };
}
