import { cachedAsync } from "./async-cache";
import { fetchCertifiedLocationCountryCode } from "./country-location";
import { countryFlag } from "./format";
import { resolvePdsHost } from "./pds";
import { INDEXER_URL, FACILITATOR_DID, blockExplorerUrl } from "./urls";

// ── Raw receipt fetch ──────────────────────────────────────────────────────

const TOTAL_STATS_CACHE_MS = 15 * 60 * 1000;

export type DonorRef =
  | { type: "did"; id: string }
  | { type: "wallet"; id: string }
  | null;

export type FundingReceipt = {
  uri: string;
  amount: number;
  currency: string;
  occurredAt: string | null;
  createdAt: string | null;
  from: DonorRef;
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
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          uri createdAt occurredAt amount currency transactionId paymentNetwork
          certifiedProfileData { displayName }
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
  certifiedProfileData?: { displayName?: string | null } | null;
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

function extractUriFromStrongRef(uri: string | null | undefined): string | null {
  return uri ?? null;
}

/** at://did:plc:org/org.hypercerts.claim.activity/rkey → did:plc:org */
function orgDidFromUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const match = uri.match(/^at:\/\/(did:[a-z0-9]+:[a-z0-9]+)\//i);
  return match ? match[1] : null;
}

function safeAmount(raw: string | null | undefined): number {
  const parsed = Number.parseFloat(raw ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapReceipt(node: RawReceipt): FundingReceipt {
  const bumicertUri = extractUriFromStrongRef(node.for?.uri);
  return {
    uri: node.uri,
    amount: safeAmount(node.amount),
    currency: (node.currency ?? "USD").toUpperCase(),
    occurredAt: node.occurredAt ?? node.createdAt ?? null,
    createdAt: node.createdAt ?? null,
    from: extractDonor(node.from ?? null),
    orgDid: orgDidFromUri(bumicertUri),
    bumicertUri,
    txHash: node.transactionId ?? null,
    paymentNetwork: node.paymentNetwork ?? null,
  };
}

async function fetchReceiptsUncached(): Promise<FundingReceipt[]> {
  const all: FundingReceipt[] = [];
  let after: string | null = null;

  for (let page = 0; page < 25; page += 1) {
    const response: Response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: RECEIPTS_QUERY,
        variables: { did: FACILITATOR_DID, first: 200, after },
      }),
    });

    const json = (await response.json()) as {
      data?: {
        orgHypercertsFundingReceipt?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          edges?: Array<{ node?: RawReceipt | null }>;
        } | null;
      };
    };

    const connection = json.data?.orgHypercertsFundingReceipt;
    if (!connection) break;

    for (const edge of connection.edges ?? []) {
      if (edge.node?.uri) all.push(mapReceipt(edge.node));
    }

    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return all;
}

export async function fetchReceipts(signal?: AbortSignal): Promise<FundingReceipt[]> {
  return cachedAsync("funding-receipts-total-source", TOTAL_STATS_CACHE_MS, fetchReceiptsUncached, signal);
}

// ── Aggregations ported from the GainForest donations view ────────────────

export type Period = "all" | "month" | "week";
export type TimeGranularity = "day" | "week" | "month";

const USD_CURRENCIES = new Set(["USD", "USDC"]);
const isUsdCurrency = (receipt: FundingReceipt) => USD_CURRENCIES.has(receipt.currency);

function receiptDate(receipt: FundingReceipt): Date | null {
  const raw = receipt.occurredAt ?? receipt.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function filterByPeriod(receipts: FundingReceipt[], period: Period): FundingReceipt[] {
  if (period === "all") return receipts;
  const ms = period === "week" ? 7 * 86_400_000 : 30 * 86_400_000;
  const cutoff = Date.now() - ms;
  return receipts.filter((receipt) => {
    const date = receiptDate(receipt);
    return date !== null && date.getTime() >= cutoff;
  });
}

export type DashboardKpis = {
  totalRaised: number;
  totalDonations: number;
  uniqueDonors: number;
  avgDonation: number;
  activeBumicerts: number;
};

export function computeKpis(receipts: FundingReceipt[]): DashboardKpis {
  const usdOnly = receipts.filter(isUsdCurrency);

  let totalRaised = 0;
  const donorIds = new Set<string>();
  const bumicertUris = new Set<string>();

  for (const receipt of usdOnly) {
    totalRaised += receipt.amount;
    if (receipt.from) donorIds.add(receipt.from.id);
    if (receipt.bumicertUri) bumicertUris.add(receipt.bumicertUri);
  }

  const totalDonations = usdOnly.length;

  return {
    totalRaised,
    totalDonations,
    uniqueDonors: donorIds.size,
    avgDonation: totalDonations > 0 ? totalRaised / totalDonations : 0,
    activeBumicerts: bumicertUris.size,
  };
}

export type TimePoint = { date: string; amount: number; count: number };

export function computeTimeSeries(receipts: FundingReceipt[], granularity: TimeGranularity): TimePoint[] {
  const usdOnly = receipts.filter(isUsdCurrency);

  const bucket = (date: Date): string => {
    if (granularity === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    }
    if (granularity === "week") {
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(date);
      monday.setDate(date.getDate() + diff);
      return monday.toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  };

  const buckets = new Map<string, { amount: number; count: number }>();

  for (const receipt of usdOnly) {
    const date = receiptDate(receipt);
    if (!date) continue;

    const key = bucket(date);
    const existing = buckets.get(key);
    if (existing) {
      existing.amount += receipt.amount;
      existing.count += 1;
    } else {
      buckets.set(key, { amount: receipt.amount, count: 1 });
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, ...value }));
}

export type TopDonor = {
  rank: number;
  donorId: string;
  donorType: "did" | "wallet";
  totalAmount: number;
  donationCount: number;
  lastDonatedAt: string | null;
};

export function computeTopDonors(receipts: FundingReceipt[], limit = 50): TopDonor[] {
  const usdOnly = receipts.filter(isUsdCurrency);
  const donors = new Map<
    string,
    { type: "did" | "wallet"; totalAmount: number; donationCount: number; lastDonatedAt: string | null }
  >();

  for (const receipt of usdOnly) {
    if (!receipt.from) continue;

    const existing = donors.get(receipt.from.id);
    if (existing) {
      existing.totalAmount += receipt.amount;
      existing.donationCount += 1;
      if (receipt.occurredAt && (!existing.lastDonatedAt || receipt.occurredAt > existing.lastDonatedAt)) {
        existing.lastDonatedAt = receipt.occurredAt;
      }
    } else {
      donors.set(receipt.from.id, {
        type: receipt.from.type,
        totalAmount: receipt.amount,
        donationCount: 1,
        lastDonatedAt: receipt.occurredAt,
      });
    }
  }

  return Array.from(donors.entries())
    .sort(([, a], [, b]) => b.totalAmount - a.totalAmount)
    .slice(0, limit)
    .map(([donorId, donor], index) => ({
      rank: index + 1,
      donorId,
      donorType: donor.type,
      totalAmount: donor.totalAmount,
      donationCount: donor.donationCount,
      lastDonatedAt: donor.lastDonatedAt,
    }));
}

export type OrgRow = {
  orgDid: string;
  totalRaised: number;
  bumicertCount: number;
  donorCount: number;
};

export function computePerOrg(receipts: FundingReceipt[]): OrgRow[] {
  const usdOnly = receipts.filter(isUsdCurrency);
  const orgs = new Map<string, { totalRaised: number; bumicerts: Set<string>; donors: Set<string> }>();

  for (const receipt of usdOnly) {
    if (!receipt.orgDid) continue;

    const existing = orgs.get(receipt.orgDid);
    if (existing) {
      existing.totalRaised += receipt.amount;
      if (receipt.bumicertUri) existing.bumicerts.add(receipt.bumicertUri);
      if (receipt.from) existing.donors.add(receipt.from.id);
    } else {
      orgs.set(receipt.orgDid, {
        totalRaised: receipt.amount,
        bumicerts: new Set(receipt.bumicertUri ? [receipt.bumicertUri] : []),
        donors: new Set(receipt.from ? [receipt.from.id] : []),
      });
    }
  }

  return Array.from(orgs.entries())
    .map(([orgDid, org]) => ({
      orgDid,
      totalRaised: org.totalRaised,
      bumicertCount: org.bumicerts.size,
      donorCount: org.donors.size,
    }))
    .sort((a, b) => b.totalRaised - a.totalRaised);
}

export type TxRow = {
  uri: string;
  date: string | null;
  donorId: string | null;
  donorType: "did" | "wallet" | null;
  amount: number;
  currency: string;
  bumicertUri: string | null;
  txHash: string | null;
  paymentNetwork: string | null;
  txUrl: string | null;
};

export function computeRecentTransactions(receipts: FundingReceipt[], limit = 50): TxRow[] {
  return [...receipts]
    .sort((a, b) => (receiptDate(b)?.getTime() ?? 0) - (receiptDate(a)?.getTime() ?? 0))
    .slice(0, limit)
    .map((receipt) => ({
      uri: receipt.uri,
      date: receipt.occurredAt ?? receipt.createdAt,
      donorId: receipt.from?.id ?? null,
      donorType: receipt.from?.type ?? null,
      amount: receipt.amount,
      currency: receipt.currency,
      bumicertUri: receipt.bumicertUri,
      txHash: receipt.txHash,
      paymentNetwork: receipt.paymentNetwork,
      txUrl: blockExplorerUrl(receipt.txHash, receipt.paymentNetwork),
    }));
}

// ── Geographic reach ───────────────────────────────────────────────────────

const ORG_COUNTRY_QUERY = `
  query DashboardOrgCountries($first: Int!, $after: String) {
    appCertifiedActorOrganization(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { did certifiedProfileData { displayName } } }
    }
  }
`;

export type CountryRow = {
  countryCode: string;
  name: string;
  emoji: string;
  orgCount: number;
};

export type GeoStats = {
  countriesRepresented: number;
  topCountries: CountryRow[];
};

async function fetchCertifiedOrgCountry(did: string): Promise<string | null> {
  try {
    const host = await resolvePdsHost(did);
    if (!host) return null;
    const params = new URLSearchParams({ repo: did, collection: "app.certified.actor.organization", rkey: "self" });
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { value?: Record<string, unknown> } | null;
    const location = data?.value?.location;
    const locationUri = typeof location === "object" && location !== null && "uri" in location
      ? typeof location.uri === "string" ? location.uri : null
      : null;
    return fetchCertifiedLocationCountryCode(locationUri);
  } catch {
    return null;
  }
}

async function fetchOrgCountryMapUncached(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let after: string | null = null;

  try {
    for (let page = 0; page < 5; page += 1) {
      const response: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: ORG_COUNTRY_QUERY,
          variables: { first: 200, after },
        }),
      });

      const json = (await response.json()) as {
        data?: {
          appCertifiedActorOrganization?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: { did?: string } | null }>;
          } | null;
        };
      };

      const connection = json.data?.appCertifiedActorOrganization;
      if (!connection) break;

      const dids = (connection.edges ?? [])
        .map((edge) => edge.node?.did)
        .filter((did): did is string => Boolean(did));
      const countries = await Promise.all(dids.map((did) => fetchCertifiedOrgCountry(did)));
      dids.forEach((did, index) => {
        const country = normalizeCountry(countries[index]);
        if (country) map.set(did, country);
      });

      if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  } catch {
    // Best effort; dashboard renders without geographic reach data.
  }

  return map;
}

export async function fetchOrgCountryMap(signal?: AbortSignal): Promise<Map<string, string>> {
  return cachedAsync("organization-country-map", TOTAL_STATS_CACHE_MS, fetchOrgCountryMapUncached, signal);
}

export function computeGeoStats(orgCountryMap: Map<string, string>, limit = 5): GeoStats {
  const countryOrgCounts = new Map<string, number>();

  for (const countryCode of orgCountryMap.values()) {
    countryOrgCounts.set(countryCode, (countryOrgCounts.get(countryCode) ?? 0) + 1);
  }

  const topCountries = Array.from(countryOrgCounts.entries())
    .map(([countryCode, orgCount]) => ({
      countryCode,
      name: countryName(countryCode),
      emoji: countryFlag(countryCode),
      orgCount,
    }))
    .sort((a, b) => b.orgCount - a.orgCount)
    .slice(0, limit);

  return {
    countriesRepresented: countryOrgCounts.size,
    topCountries,
  };
}

function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
