/**
 * External GainForest surfaces the explorer links out to, plus the shared
 * data endpoints. Kept in one place so a host change is a single edit.
 */

/** Production Hyperindex GraphQL endpoint. Serves `access-control-allow-origin: *`
 *  so the browser can query it directly (no API proxy needed). */
export const INDEXER_URL = "https://hi.gainforest.app/graphql";

/** Bumicerts marketplace (certs.gainforest.app). */
export const BUMICERTS_URL = "https://certs.gainforest.app";

/** Green Globe live map (data.gainforest.app). */
export const GLOBE_URL = "https://data.gainforest.app";

/** GainForest non-profit site. */
export const GAINFOREST_URL = "https://gainforest.earth";

/** Instatus status page (public mirror + JSON endpoints). */
export const STATUS_URL = "https://gainforest-status.instatus.com";

/** The facilitator repo that records every Bumicerts funding receipt. All
 *  donations across every org land in this DID's PDS, so the donations
 *  dashboard reads `orgHypercertsFundingReceipt(where: { did: { eq } })`
 *  against it. Mirrors the bumicerts monorepo's NEXT_PUBLIC_FACILITATOR_DID
 *  (apps/bumicerts/app/(marketplace)/dashboard/_components/DashboardClient.tsx). */
export const FACILITATOR_DID = "did:plc:edod7rboajioq3jbyxsgeicc";

/** Build a Bumicerts project page URL from a DID + rkey. */
export function bumicertHref(did: string, rkey: string): string {
  return `${BUMICERTS_URL}/bumicert/${encodeURIComponent(did)}-${encodeURIComponent(rkey)}`;
}

/** Build a certs.gainforest.app account page URL from a DID or handle. */
export function accountHref(didOrHandle: string): string {
  return `${BUMICERTS_URL}/account/${didOrHandle}`;
}

/** Block-explorer transaction URLs by payment network. Mirrors the
 *  bumicerts dashboard's BLOCK_EXPLORERS map. */
const BLOCK_EXPLORERS: Record<string, (tx: string) => string> = {
  base: (tx) => `https://basescan.org/tx/${tx}`,
  celo: (tx) => `https://celoscan.io/tx/${tx}`,
};

export function blockExplorerUrl(
  txHash: string | null | undefined,
  network: string | null | undefined,
): string | null {
  if (!txHash || !network) return null;
  const builder = BLOCK_EXPLORERS[network.toLowerCase()];
  return builder ? builder(txHash) : null;
}
