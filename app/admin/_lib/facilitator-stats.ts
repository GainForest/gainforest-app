import "server-only";

/**
 * Facilitator wallet stats for the /admin dashboard.
 *
 * The facilitator is the platform wallet that submits every donation's
 * `transferWithAuthorization` to USDC on Ethereum mainnet (paying the gas)
 * and then records a funding receipt in the facilitator repo. Admins want to
 * see, at a glance: which wallet that is, how much money has moved through
 * it, and how many transactions it has sent.
 *
 * Two independent sources, each degrading to nulls on failure:
 *   - Ethereum JSON-RPC  → on-chain tx count (the wallet's nonce) + ETH left
 *     for gas. Uses the same RPC the settlement path uses.
 *   - Indexer receipts   → number of donation receipts and their USD sum
 *     (same sweep as the homepage KPIs, but scoped to this panel).
 *
 * Cached in-process for 5 minutes so admin page loads don't hammer the RPC.
 */

import { cachedAsync } from "@/app/_lib/async-cache";
import { FACILITATOR_DID, FACILITATOR_WALLET_ADDRESS, INDEXER_URL } from "@/app/_lib/urls";
import { RPC_URL } from "@/lib/facilitator/usdc";

const CACHE_MS = 5 * 60 * 1000;

export type FacilitatorStats = {
  /** The facilitator's Ethereum wallet address, or null when unconfigured. */
  address: string | null;
  /** Total transactions ever sent from the wallet (its on-chain nonce). */
  txCount: number | null;
  /** Remaining ETH for gas, formatted with 4 decimals (e.g. "0.4213"). */
  ethBalance: string | null;
  /** Number of donation receipts recorded through the facilitator repo. */
  receiptCount: number | null;
  /** USD value of those receipts (USD/USDC only). */
  usdVolume: number | null;
};

function getRpcUrl(): string {
  return process.env.ETHEREUM_RPC_URL || process.env.MAINNET_RPC_URL || RPC_URL;
}

/**
 * Resolve the facilitator wallet address: the public env var when set,
 * otherwise derived from the settlement private key so the panel still works
 * on deployments that only configured the signer.
 */
async function resolveAddress(): Promise<string | null> {
  if (FACILITATOR_WALLET_ADDRESS && /^0x[a-fA-F0-9]{40}$/.test(FACILITATOR_WALLET_ADDRESS)) {
    return FACILITATOR_WALLET_ADDRESS;
  }
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) return null;
  try {
    const { privateKeyToAccount } = await import("viem/accounts");
    return privateKeyToAccount(privateKey as `0x${string}`).address;
  } catch {
    return null;
  }
}

/** eth_getTransactionCount + eth_getBalance in one JSON-RPC batch. */
async function fetchOnchain(address: string): Promise<{ txCount: number | null; ethBalance: string | null }> {
  try {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [address, "latest"] },
        { jsonrpc: "2.0", id: 2, method: "eth_getBalance", params: [address, "latest"] },
      ]),
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as Array<{ id?: number; result?: string }> | null;
    if (!Array.isArray(json)) return { txCount: null, ethBalance: null };

    const hexOf = (id: number) => {
      const result = json.find((entry) => entry?.id === id)?.result;
      return typeof result === "string" && result.startsWith("0x") ? result : null;
    };

    const nonceHex = hexOf(1);
    const balanceHex = hexOf(2);
    const txCount = nonceHex ? Number.parseInt(nonceHex, 16) : null;
    let ethBalance: string | null = null;
    if (balanceHex) {
      // wei → ETH with 4 decimals, using bigint math to stay precise.
      const wei = BigInt(balanceHex);
      const whole = wei / 10n ** 18n;
      const frac = ((wei % 10n ** 18n) / 10n ** 14n).toString().padStart(4, "0");
      ethBalance = `${whole}.${frac}`;
    }
    return { txCount: Number.isFinite(txCount as number) ? txCount : null, ethBalance };
  } catch {
    return { txCount: null, ethBalance: null };
  }
}

const RECEIPTS_QUERY = `
  query FacilitatorReceipts($did: String!, $after: String) {
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

const USD = new Set(["USD", "USDC"]);

/** Sweep the facilitator repo's funding receipts: count + USD sum. */
async function fetchReceipts(): Promise<{ receiptCount: number | null; usdVolume: number | null }> {
  try {
    let after: string | null = null;
    let receiptCount: number | null = null;
    let usdVolume = 0;
    // 25 pages × 200 = 5,000 receipts — far beyond current volume.
    for (let page = 0; page < 25; page++) {
      const response: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: RECEIPTS_QUERY, variables: { did: FACILITATOR_DID, after } }),
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as {
        data?: {
          orgHypercertsFundingReceipt?: {
            totalCount?: number | null;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: { amount?: string | null; currency?: string | null } | null }>;
          } | null;
        };
      } | null;
      const conn = json?.data?.orgHypercertsFundingReceipt;
      if (!conn) break;
      if (receiptCount === null && typeof conn.totalCount === "number") receiptCount = conn.totalCount;
      for (const edge of conn.edges ?? []) {
        const node = edge?.node;
        if (!node || !USD.has((node.currency ?? "").toUpperCase())) continue;
        const amount = parseFloat(node.amount ?? "0");
        if (Number.isFinite(amount)) usdVolume += amount;
      }
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return { receiptCount, usdVolume: receiptCount === null ? null : usdVolume };
  } catch {
    return { receiptCount: null, usdVolume: null };
  }
}

async function fetchFacilitatorStatsUncached(): Promise<FacilitatorStats> {
  const address = await resolveAddress();
  const [onchain, receipts] = await Promise.all([
    address ? fetchOnchain(address) : Promise.resolve({ txCount: null, ethBalance: null }),
    fetchReceipts(),
  ]);
  return { address, ...onchain, ...receipts };
}

export async function fetchFacilitatorStats(): Promise<FacilitatorStats> {
  return cachedAsync("admin-facilitator-stats", CACHE_MS, fetchFacilitatorStatsUncached);
}
