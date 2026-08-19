import "server-only";

import { indexerQuery } from "@/app/_lib/indexer";
import { resolvePdsHost } from "@/app/_lib/pds";
import { FACILITATOR_DID } from "@/app/_lib/urls";
import { parseBioblitzPrizeReceipt, type BioblitzPrize } from "@/lib/bioblitz-prizes";
import {
  LEGACY_WALLET_COLLECTION,
  PRIMARY_WALLET_COLLECTION,
  PRIMARY_WALLET_RKEY,
  parseSplitsVaultRecord,
} from "@/lib/splits-vault/shared";
import type { BioblitzWinnerWallet, BioblitzPrizePaymentStatus } from "./bioblitz-dashboard-types";

const RECORD_READ_TIMEOUT_MS = 8000;

// ── Wallet fetching ──────────────────────────────────────────────────────────

/**
 * Fetch the wallet address for an account (vault or linked EVM).
 * Returns the first available wallet, preferring vault over linked.
 */
export async function fetchWinnerWallet(did: string): Promise<BioblitzWinnerWallet | null> {
  // Try vault first
  const vault = await fetchVaultWallet(did);
  if (vault) return vault;

  // Fall back to linked EVM
  const linked = await fetchLinkedEvmWallet(did);
  return linked;
}

async function fetchVaultWallet(did: string): Promise<BioblitzWinnerWallet | null> {
  const pdsHost = await resolvePdsHost(did).catch(() => null);
  if (!pdsHost) return null;

  for (const collection of [PRIMARY_WALLET_COLLECTION, LEGACY_WALLET_COLLECTION]) {
    const url = new URL(`https://${pdsHost}/xrpc/com.atproto.repo.getRecord`);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", collection);
    url.searchParams.set("rkey", PRIMARY_WALLET_RKEY);

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(RECORD_READ_TIMEOUT_MS),
    }).catch(() => null);

    if (!response?.ok) continue;
    const json = (await response.json().catch(() => null)) as { value?: unknown } | null;
    const record = parseSplitsVaultRecord(json?.value);
    if (!record) continue;

    return { address: record.address, source: "vault" };
  }

  return null;
}

const LINKED_EVM_BY_DID_QUERY = `
  query WinnerLinkedEvm($did: String!, $first: Int!) {
    appGainforestLinkEvm(
      first: $first
      where: { did: { eq: $did } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges {
        node {
          address
          userProof { __typename }
          platformAttestation { __typename }
        }
      }
    }
  }
`;

type RawLinkedEvmNode = {
  address?: string | null;
  userProof?: { __typename?: string | null } | null;
  platformAttestation?: { __typename?: string | null } | null;
};

async function fetchLinkedEvmWallet(did: string): Promise<BioblitzWinnerWallet | null> {
  const data = await indexerQuery<{
    appGainforestLinkEvm?: { edges?: Array<{ node?: RawLinkedEvmNode | null } | null> | null } | null;
  }>(LINKED_EVM_BY_DID_QUERY, { did, first: 10 }).catch(() => null);

  const edges = data?.appGainforestLinkEvm?.edges ?? [];
  for (const edge of edges) {
    const node = edge?.node;
    if (!node?.address) continue;

    // Only consider verified linked wallets
    const valid =
      node.platformAttestation?.__typename === "AppGainforestLinkEvmEip712PlatformAttestation" &&
      node.userProof?.__typename === "AppGainforestLinkEvmEip712Proof";
    if (!valid) continue;

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(node.address)) continue;

    return { address: node.address as `0x${string}`, source: "linked" };
  }

  return null;
}

// ── Payment status checking ──────────────────────────────────────────────────

// The indexer has no where-filter for a receipt's recipient wallet (`to` is a
// union type), so we fetch the facilitator's receipts and match the recipient
// in code. The facilitator repo holds every donation/prize receipt, a small
// set, so one query covers all winners on a dashboard load.
const PRIZE_RECEIPTS_QUERY = `
  query BioblitzPrizeReceipts($repoDid: String!, $first: Int!) {
    orgHypercertsFundingReceipt(
      first: $first
      where: { did: { eq: $repoDid } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges {
        node {
          uri
          notes
          transactionId
          createdAt
          to {
            __typename
            ... on OrgHypercertsFundingReceiptText { value }
          }
        }
      }
    }
  }
`;

type RawReceiptNode = {
  uri?: string | null;
  notes?: string | null;
  transactionId?: string | null;
  createdAt?: string | null;
  to?: { __typename?: string | null; value?: string | null } | null;
};

export type PrizeReceipt = {
  toWallet: string | null;
  notes: string | null;
  txHash: string | null;
  createdAt: string | null;
};

/**
 * Every funding receipt written by the facilitator, newest first. Bioblitz
 * prize payments live here alongside ordinary donations; callers filter by
 * recipient wallet and the deterministic prize-note format.
 */
export async function fetchFacilitatorPrizeReceipts(): Promise<PrizeReceipt[]> {
  const data = await indexerQuery<{
    orgHypercertsFundingReceipt?: { edges?: Array<{ node?: RawReceiptNode | null } | null> | null } | null;
  }>(PRIZE_RECEIPTS_QUERY, { repoDid: FACILITATOR_DID, first: 1000 }).catch(() => null);

  const edges = data?.orgHypercertsFundingReceipt?.edges ?? [];
  const receipts: PrizeReceipt[] = [];
  for (const edge of edges) {
    const node = edge?.node;
    if (!node) continue;
    receipts.push({
      toWallet: node.to?.value ?? null,
      notes: node.notes ?? null,
      txHash: node.transactionId ?? null,
      createdAt: node.createdAt ?? null,
    });
  }
  return receipts;
}

/**
 * Which of a winner's prizes have already been paid to their wallet, matched
 * from a pre-fetched receipt set. Wallet comparison is case-insensitive — a
 * receipt's recipient is stored checksummed, while a vault/link record may use
 * different casing, and an exact match silently misses real payments.
 */
export function computeBioblitzPrizePaymentStatus(
  roundId: number,
  prizes: BioblitzPrize[],
  walletAddress: string,
  receipts: PrizeReceipt[],
): BioblitzPrizePaymentStatus[] {
  if (prizes.length === 0) return [];

  const wallet = walletAddress.toLowerCase();
  const paidPrizes = new Map<BioblitzPrize, { txHash?: string; paidAt?: string }>();

  for (const receipt of receipts) {
    if (!receipt.notes) continue;
    if ((receipt.toWallet ?? "").toLowerCase() !== wallet) continue;

    const parsed = parseBioblitzPrizeReceipt(receipt.notes);
    if (!parsed || parsed.roundId !== roundId) continue;

    // Only mark as paid if we're tracking this prize
    if (prizes.includes(parsed.prize) && !paidPrizes.has(parsed.prize)) {
      paidPrizes.set(parsed.prize, {
        txHash: receipt.txHash || undefined,
        paidAt: receipt.createdAt || undefined,
      });
    }
  }

  return prizes.map((prize) => {
    const status = paidPrizes.get(prize);
    return {
      prize,
      paid: Boolean(status),
      txHash: status?.txHash,
      paidAt: status?.paidAt,
    };
  });
}

/**
 * Check if bioblitz prizes have been paid to a winner's wallet. Fetches the
 * facilitator receipt set, then matches by recipient wallet and prize note.
 */
export async function fetchBioblitzPrizePaymentStatus(
  roundId: number,
  prizes: BioblitzPrize[],
  walletAddress: string,
): Promise<BioblitzPrizePaymentStatus[]> {
  if (prizes.length === 0) return [];
  const receipts = await fetchFacilitatorPrizeReceipts();
  return computeBioblitzPrizePaymentStatus(roundId, prizes, walletAddress, receipts);
}

/**
 * Batch fetch wallet and payment status for multiple winners.
 * This is more efficient than fetching one at a time.
 */
export async function fetchWinnersWalletAndPaymentStatus(
  winners: Array<{ did: string; roundId: number; prizes: BioblitzPrize[] }>,
): Promise<Map<string, { wallet: BioblitzWinnerWallet | null; payments: BioblitzPrizePaymentStatus[] }>> {
  const results = new Map<string, { wallet: BioblitzWinnerWallet | null; payments: BioblitzPrizePaymentStatus[] }>();

  // One receipt fetch covers every winner; wallet lookups run in parallel.
  const receipts = await fetchFacilitatorPrizeReceipts();
  await Promise.all(
    winners.map(async ({ did, roundId, prizes }) => {
      const wallet = await fetchWinnerWallet(did);
      const payments = wallet
        ? computeBioblitzPrizePaymentStatus(roundId, prizes, wallet.address, receipts)
        : prizes.map((prize) => ({ prize, paid: false }));

      results.set(did, { wallet, payments });
    }),
  );

  return results;
}
