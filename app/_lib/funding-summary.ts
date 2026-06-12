/**
 * Per-bumicert funding summaries for catalog surfaces.
 *
 * Joins two cheap, cached reads:
 *   1. `appGainforestFundingConfig` — which bumicerts currently accept
 *      donations (open status + receiving wallet) and their optional goal.
 *   2. `fetchReceipts()` — completed donation receipts, aggregated per
 *      bumicert at-uri (USD/USDC only, matching the dashboard).
 *
 * The result lets explorer cards show real commerce state ("Accepting
 * donations", "$280 raised") without a per-card request, and lets the
 * "Accepts donations" filter actually check funding state client-side.
 */

import { cachedAsync } from "./async-cache";
import { fetchReceipts } from "./dashboard";
import { INDEXER_URL } from "./urls";

export type BumicertFundingSummary = {
  /** True when an open funding config with a receiving wallet exists. */
  accepting: boolean;
  /** Completed USD/USDC donations, summed. */
  raisedUsd: number;
  /** Number of completed USD/USDC donations. */
  donations: number;
  /** Funding goal in USD when the steward set one. */
  goalUsd: number | null;
};

export type FundingSummaryIndex = Map<string, BumicertFundingSummary>;

const FUNDING_SUMMARY_CACHE_MS = 5 * 60 * 1000;
const USD_CURRENCIES = new Set(["USD", "USDC"]);

const FUNDING_CONFIGS_QUERY = `
  query CatalogFundingConfigs($first: Int!, $after: String) {
    appGainforestFundingConfig(
      first: $first
      after: $after
      where: { receivingWallet: { isNull: false } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did rkey status goalInUSD } }
    }
  }
`;

type RawFundingConfigNode = {
  did?: string | null;
  rkey?: string | null;
  status?: string | null;
  goalInUSD?: string | null;
};

function bumicertUri(did: string, rkey: string): string {
  return `at://${did}/org.hypercerts.claim.activity/${rkey}`;
}

function parseUsd(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchOpenFundingConfigs(): Promise<Map<string, { goalUsd: number | null }>> {
  const open = new Map<string, { goalUsd: number | null }>();
  let after: string | null = null;

  for (let page = 0; page < 5; page += 1) {
    const response: Response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: FUNDING_CONFIGS_QUERY, variables: { first: 1000, after } }),
    });
    const json = (await response.json()) as {
      data?: {
        appGainforestFundingConfig?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          edges?: Array<{ node?: RawFundingConfigNode | null }>;
        } | null;
      };
    };
    const connection = json.data?.appGainforestFundingConfig;
    if (!connection) break;

    for (const edge of connection.edges ?? []) {
      const node = edge.node;
      if (!node?.did || !node.rkey) continue;
      if ((node.status ?? "open") !== "open") continue;
      open.set(bumicertUri(node.did, node.rkey), { goalUsd: parseUsd(node.goalInUSD) });
    }

    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return open;
}

async function fetchFundingSummariesUncached(): Promise<FundingSummaryIndex> {
  const [configs, receipts] = await Promise.all([
    fetchOpenFundingConfigs().catch(() => new Map<string, { goalUsd: number | null }>()),
    fetchReceipts().catch(() => []),
  ]);

  const index: FundingSummaryIndex = new Map();
  for (const [uri, config] of configs) {
    index.set(uri, { accepting: true, raisedUsd: 0, donations: 0, goalUsd: config.goalUsd });
  }

  for (const receipt of receipts) {
    if (!receipt.bumicertUri) continue;
    if (!USD_CURRENCIES.has(receipt.currency)) continue;
    const existing = index.get(receipt.bumicertUri);
    if (existing) {
      existing.raisedUsd += receipt.amount;
      existing.donations += 1;
    } else {
      // Raised money historically but not currently accepting donations.
      index.set(receipt.bumicertUri, {
        accepting: false,
        raisedUsd: receipt.amount,
        donations: 1,
        goalUsd: null,
      });
    }
  }

  return index;
}

/** Cached funding summary index keyed by bumicert at-uri. */
export function fetchFundingSummaries(signal?: AbortSignal): Promise<FundingSummaryIndex> {
  return cachedAsync("bumicert-funding-summaries", FUNDING_SUMMARY_CACHE_MS, fetchFundingSummariesUncached, signal);
}
