/**
 * Donations dashboard data layer — a faithful port of the bumicerts monorepo's
 * dashboard (apps/bumicerts/app/(marketplace)/dashboard). Every funding receipt
 * across every org is written to the facilitator repo, so we fetch
 * `orgHypercertsFundingReceipt(where: { did: { eq: FACILITATOR_DID } })` and
 * recompute the same KPIs, time-series, top-donor, per-org, and recent-
 * transaction aggregations the live dashboard renders.
 *
 * Runs in the browser (CORS-open indexer); paged at 200/req.
 */

import { INDEXER_URL, FACILITATOR_DID, blockExplorerUrl } from "./urls";

// ── Raw receipt fetch ──────────────────────────────────────────────────────

export type DonorRef =
  | { type: "did"; id: string }
  | { type: "wallet"; id: string }
  | null;

export type FundingReceipt = {
  uri: string;
  amount: number;
  currency: string;
  occurredAt: string | null;
  from: DonorRef;
  /** Org DID that received the funds (from the `for` activity AT-URI). */
  orgDid: string | null;
  bumicertUri: string | null;
  txHash: string | null;
  paymentNetwork: string | null;
};

const RECEIPTS_QUERY = `
  query DashboardReceipts($did: String!, $first: Int!, $after: String) {
    orgHypercertsFundingReceipt(
      where: { did: { eq: $did } }
      first: $first
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          uri createdAt occurredAt amount currency transactionId paymentNetwork
          from {
            __typename
            ... on OrgHypercertsFundingReceiptText { value }
            ... on AppCertifiedDefsDid { did }
          }
          for { uri }
        }
      }
    }
  }
`;

type RawFrom =
  | { __typename: "OrgHypercertsFundingReceiptText"; value?: string | null }
  | { __typename: "AppCertifiedDefsDid"; did?: string | null }
  | null;

type RawReceipt = {
  uri: string;
  createdAt?: string | null;
  occurredAt?: string | null;
  amount?: string | null;
  currency?: string | null;
  transactionId?: string | null;
  paymentNetwork?: string | null;
  from?: RawFrom;
  for?: { uri?: string | null } | null;
};

function extractDonor(from: RawFrom): DonorRef {
  if (!from) return null;
  if (from.__typename === "AppCertifiedDefsDid" && from.did) {
    return { type: "did", id: from.did };
  }
  if (from.__typename === "OrgHypercertsFundingReceiptText" && from.value) {
    return { type: "wallet", id: from.value };
  }
  return null;
}

/** at://did:plc:org/org.hypercerts.claim.activity/rkey → did:plc:org */
function orgDidFromUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const m = uri.match(/^at:\/\/(did:[a-z0-9]+:[a-z0-9]+)\//i);
  return m ? m[1] : null;
}

function mapReceipt(n: RawReceipt): FundingReceipt {
  const amount = parseFloat(n.amount ?? "0");
  return {
    uri: n.uri,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: (n.currency ?? "USD").toUpperCase(),
    occurredAt: n.occurredAt ?? n.createdAt ?? null,
    from: extractDonor(n.from ?? null),
    orgDid: orgDidFromUri(n.for?.uri),
    bumicertUri: n.for?.uri ?? null,
    txHash: n.transactionId ?? null,
    paymentNetwork: n.paymentNetwork ?? null,
  };
}

export async function fetchReceipts(signal?: AbortSignal): Promise<FundingReceipt[]> {
  const all: FundingReceipt[] = [];
  let after: string | null = null;
  for (let page = 0; page < 25; page++) {
    const res: Response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: RECEIPTS_QUERY,
        variables: { did: FACILITATOR_DID, first: 200, after },
      }),
      signal,
    });
    const json = (await res.json()) as {
      data?: {
        orgHypercertsFundingReceipt?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          edges?: Array<{ node?: RawReceipt | null }>;
        } | null;
      };
    };
    const conn = json.data?.orgHypercertsFundingReceipt;
    if (!conn) break;
    for (const e of conn.edges ?? []) {
      if (e?.node?.uri) all.push(mapReceipt(e.node));
    }
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return all;
}

// ── Aggregations (ported from dashboard/_utils/aggregations.ts) ─────────────

const USD = new Set(["USD", "USDC"]);
const isUsd = (r: FundingReceipt) => USD.has(r.currency);

export type DashboardKpis = {
  totalRaised: number;
  totalDonations: number;
  uniqueDonors: number;
  avgDonation: number;
  activeBumicerts: number;
  countries: number;
};

export function computeKpis(
  receipts: FundingReceipt[],
  orgCountry: Map<string, string>,
): DashboardKpis {
  const usd = receipts.filter(isUsd);
  let totalRaised = 0;
  const donors = new Set<string>();
  const bumicerts = new Set<string>();
  const countries = new Set<string>();
  for (const r of usd) {
    totalRaised += r.amount;
    if (r.from) donors.add(r.from.id);
    if (r.bumicertUri) bumicerts.add(r.bumicertUri);
    if (r.orgDid && orgCountry.has(r.orgDid)) {
      countries.add(orgCountry.get(r.orgDid)!);
    }
  }
  const totalDonations = usd.length;
  return {
    totalRaised,
    totalDonations,
    uniqueDonors: donors.size,
    avgDonation: totalDonations > 0 ? totalRaised / totalDonations : 0,
    activeBumicerts: bumicerts.size,
    countries: countries.size,
  };
}

export type TimePoint = { date: string; amount: number; count: number };

export function computeTimeSeries(receipts: FundingReceipt[]): TimePoint[] {
  const usd = receipts.filter(isUsd);
  const map = new Map<string, { amount: number; count: number }>();
  for (const r of usd) {
    if (!r.occurredAt) continue;
    const d = new Date(r.occurredAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    const ex = map.get(key);
    if (ex) {
      ex.amount += r.amount;
      ex.count += 1;
    } else {
      map.set(key, { amount: r.amount, count: 1 });
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}

export type TopDonor = {
  rank: number;
  id: string;
  type: "did" | "wallet";
  total: number;
  count: number;
  lastAt: string | null;
};

export function computeTopDonors(receipts: FundingReceipt[], limit = 25): TopDonor[] {
  const usd = receipts.filter(isUsd);
  const map = new Map<
    string,
    { type: "did" | "wallet"; total: number; count: number; lastAt: string | null }
  >();
  for (const r of usd) {
    if (!r.from) continue;
    const ex = map.get(r.from.id);
    if (ex) {
      ex.total += r.amount;
      ex.count += 1;
      if (r.occurredAt && (!ex.lastAt || r.occurredAt > ex.lastAt)) ex.lastAt = r.occurredAt;
    } else {
      map.set(r.from.id, {
        type: r.from.type,
        total: r.amount,
        count: 1,
        lastAt: r.occurredAt,
      });
    }
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, limit)
    .map(([id, d], i) => ({ rank: i + 1, id, ...d }));
}

export type OrgRow = {
  orgDid: string;
  total: number;
  bumicerts: number;
  donors: number;
};

export function computePerOrg(receipts: FundingReceipt[]): OrgRow[] {
  const usd = receipts.filter(isUsd);
  const map = new Map<
    string,
    { total: number; bumicerts: Set<string>; donors: Set<string> }
  >();
  for (const r of usd) {
    if (!r.orgDid) continue;
    const ex = map.get(r.orgDid);
    if (ex) {
      ex.total += r.amount;
      if (r.bumicertUri) ex.bumicerts.add(r.bumicertUri);
      if (r.from) ex.donors.add(r.from.id);
    } else {
      map.set(r.orgDid, {
        total: r.amount,
        bumicerts: new Set(r.bumicertUri ? [r.bumicertUri] : []),
        donors: new Set(r.from ? [r.from.id] : []),
      });
    }
  }
  return Array.from(map.entries())
    .map(([orgDid, v]) => ({
      orgDid,
      total: v.total,
      bumicerts: v.bumicerts.size,
      donors: v.donors.size,
    }))
    .sort((a, b) => b.total - a.total);
}

export type TxRow = {
  uri: string;
  date: string | null;
  donor: DonorRef;
  amount: number;
  currency: string;
  bumicertUri: string | null;
  bumicertRkey: string | null;
  bumicertDid: string | null;
  txHash: string | null;
  txUrl: string | null;
};

export function computeRecentTransactions(
  receipts: FundingReceipt[],
  limit = 30,
): TxRow[] {
  return [...receipts]
    .sort((a, b) => {
      const da = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
      const db = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
      return db - da;
    })
    .slice(0, limit)
    .map((r) => {
      const m = r.bumicertUri?.match(
        /^at:\/\/(did:[a-z0-9]+:[a-z0-9]+)\/[^/]+\/(.+)$/i,
      );
      return {
        uri: r.uri,
        date: r.occurredAt,
        donor: r.from,
        amount: r.amount,
        currency: r.currency,
        bumicertUri: r.bumicertUri,
        bumicertDid: m ? m[1] : null,
        bumicertRkey: m ? m[2] : null,
        txHash: r.txHash,
        txUrl: blockExplorerUrl(r.txHash, r.paymentNetwork),
      };
    });
}

// ── Org country map (for the geographic-reach KPI) ─────────────────────────

const ORG_COUNTRY_QUERY = `
  query DashboardOrgCountries($first: Int!, $after: String) {
    appGainforestOrganizationInfo(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { did country } }
    }
  }
`;

export async function fetchOrgCountryMap(
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let after: string | null = null;
  try {
    for (let page = 0; page < 10; page++) {
      const res: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: ORG_COUNTRY_QUERY,
          variables: { first: 100, after },
        }),
        signal,
      });
      const json = (await res.json()) as {
        data?: {
          appGainforestOrganizationInfo?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: { did?: string; country?: string } | null }>;
          } | null;
        };
      };
      const conn = json.data?.appGainforestOrganizationInfo;
      if (!conn) break;
      for (const e of conn.edges ?? []) {
        const did = e?.node?.did;
        const country = e?.node?.country;
        if (did && country) map.set(did, country);
      }
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
  } catch {
    /* best effort; geographic reach degrades to 0 */
  }
  return map;
}
