/**
 * External GainForest surfaces the explorer links out to, plus the shared
 * data endpoints. Kept in one place so a host change is a single edit.
 */

/** Hyperindex GraphQL endpoint. Serves `access-control-allow-origin: *`
 *  so the browser can query it directly (no API proxy needed).
 *  The dev API includes certified profile data on records, which lets cards
 *  show organization names without an extra profile lookup. */
export const INDEXER_URL = "https://dev-api-hi.gainforest.app/graphql";

/** Green Globe live map (data.gainforest.app). */
export const GLOBE_URL = "https://data.gainforest.app";

/** Drone/orthophoto/point-cloud viewer. */
export const DRONE_APP_URL = (process.env.NEXT_PUBLIC_DRONE_APP_URL || "https://drone.gainforest.app").replace(/\/$/, "");

export function droneAppHref(options?: {
  projectDid?: string | null;
  siteUri?: string | null;
  view3d?: boolean;
  demo?: boolean;
}): string {
  const query = new URLSearchParams();

  if (options?.projectDid && !options.demo) {
    query.set("atprotoProject", options.projectDid);
    query.set("view3d", String(options.view3d ?? false));
    query.set("basemap", "false");
    if (options.siteUri) query.set("project-site-id", options.siteUri);
  } else {
    query.set("p", "drone-demo");
    query.set("view3d", String(options?.view3d ?? true));
  }

  return `${DRONE_APP_URL}/project/Showcase?${query.toString()}`;
}

const LOCAL_GREEN_GLOBE_PREVIEW_BASE_URL = "http://localhost:8910";

/** Green Globe embedded preview base URL. Override for hosted Green Globe testing. */
export const GREEN_GLOBE_PREVIEW_URL =
  process.env.NEXT_PUBLIC_GREEN_GLOBE_URL?.trim().replace(/\/$/, "") ||
  (process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? GLOBE_URL : LOCAL_GREEN_GLOBE_PREVIEW_BASE_URL);

export function greenGlobeTreePreviewHref(
  did: string,
  options?: {
    treeUri?: string | null;
    datasetRef?: string | null;
    datasetRefs?: string[] | null;
    siteRef?: string | null;
  },
): string {
  const query = new URLSearchParams();

  if (options?.treeUri) query.set("tree-uri", options.treeUri);
  if (options?.siteRef) query.set("project-site-id", options.siteRef);

  const datasetRefs = Array.from(new Set([...(options?.datasetRef ? [options.datasetRef] : []), ...(options?.datasetRefs ?? [])]));
  for (const datasetRef of datasetRefs) {
    if (datasetRef.length > 0) query.append("dataset-ref", datasetRef);
  }

  const queryString = query.toString();
  const basePath = `${GREEN_GLOBE_PREVIEW_URL}/embed/${encodeURIComponent(did)}`;
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/** Hyperscan ATProto explorer (hyperscan.dev). */
export const HYPERSCAN_URL = "https://www.hyperscan.dev";

/**
 * Hyperscan record-view URL for an AT-URI. Hyperscan's Data Explorer renders
 * the raw record JSON (plus its lexicon schema + backlinks) at
 * `/data?did=…&collection=…&rkey=…` — see hyperscan.dev/agents. We parse the
 * `at://{did}/{collection}/{rkey}` triple out of the URI; a bare DID (no
 * collection) falls back to the repo overview. Returns null for unparseable
 * input so callers can hide the link.
 */
export function hyperscanRecordHref(atUri: string): string | null {
  const m = atUri.match(/^at:\/\/([^/]+)(?:\/([^/]+)(?:\/(.+))?)?$/);
  if (!m) return null;
  const [, did, collection, rkey] = m;
  if (!did) return null;
  const params = new URLSearchParams({ did });
  if (collection) params.set("collection", collection);
  if (rkey) params.set("rkey", rkey);
  return `${HYPERSCAN_URL}/data?${params.toString()}`;
}

/** GainForest non-profit site. */
export const GAINFOREST_URL = "https://gainforest.earth";

/** Instatus status page (public mirror + JSON endpoints). */
export const STATUS_URL = "https://gainforest-status.instatus.com";

/** The facilitator repo that records every Bumicerts funding receipt. All
 *  donations across every org land in this DID's PDS, so the donations
 *  dashboard reads `orgHypercertsFundingReceipt(where: { did: { eq } })`
 *  against it. Mirrors the bumicerts monorepo's NEXT_PUBLIC_FACILITATOR_DID
 *  (apps/certs/app/(marketplace)/dashboard/_components/DashboardClient.tsx). */
export const FACILITATOR_DID = process.env.NEXT_PUBLIC_FACILITATOR_DID || "did:plc:edod7rboajioq3jbyxsgeicc";

/** The platform (facilitator) wallet address that signs the EVM-link platform
 *  attestation. When set, a linked wallet only counts as "trusted" for
 *  receiving donations if its `platformAttestation.platformAddress` matches
 *  this. Mirrors the monorepo's NEXT_PUBLIC_FACILITATOR_WALLET_ADDRESS. */
export const FACILITATOR_WALLET_ADDRESS = process.env.NEXT_PUBLIC_FACILITATOR_WALLET_ADDRESS;

/** WalletConnect Cloud project id, required by RainbowKit's getDefaultConfig
 *  for mobile wallet (deep-link) support. Mirrors the monorepo's
 *  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. RainbowKit refuses to initialise with
 *  an empty id (it throws during SSR/prerender), so we fall back to a
 *  placeholder when unset: injected/browser wallets (MetaMask, Rainbow,
 *  Coinbase) still work; only mobile WalletConnect deep-links need the real id. */
export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

/** Prefer a handle for public URLs when one is known, while keeping DID fallback support. */
export function preferredDidIdentifier(did: string, handle?: string | null): string {
  const cleanHandle = handle?.trim().replace(/^@/, "");
  return cleanHandle && !cleanHandle.startsWith("did:") ? cleanHandle : did;
}

/** Build a Cert detail page URL in this app from a DID/handle + rkey. */
export function localBumicertHref(didOrHandle: string, rkey: string): string {
  return `/cert/${encodeURIComponent(didOrHandle)}/${encodeURIComponent(rkey)}`;
}

/** Build a local GainForest account page URL from a DID or handle. */
export function accountHref(didOrHandle: string): string {
  return `/account/${encodeURIComponent(didOrHandle)}`;
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
