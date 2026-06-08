"use client";

/**
 * Client-side funding / donations helpers.
 *
 * The bumicerts monorepo drives these through tRPC (indexer reads +
 * atproto-mutations writes). This app has no tRPC, so we adapt:
 *   - reads   → direct GraphQL fetch against the indexer
 *   - writes  → putRecord() through /api/manage/proxy (the user's PDS)
 *
 * The UI, record shape, and modal flow are otherwise identical to the
 * monorepo's `bumicert/[bumicertId]` owner view.
 */

import { useCallback, useEffect, useState } from "react";
import { putRecord } from "@/app/(manage)/manage/_lib/mutations";
import { INDEXER_URL, FACILITATOR_WALLET_ADDRESS } from "@/app/_lib/urls";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Serialisation-safe shape of an app.gainforest.funding.config record.
 * Mirrors the indexer's GainforestFundingConfigRecord and can be passed
 * server → client without JSON issues.
 */
export type FundingConfigData = {
  receivingWallet: { uri: string } | null;
  status: "open" | "coming-soon" | "paused" | "closed" | null;
  goalInUSD: string | null;
  minDonationInUSD: string | null;
  maxDonationInUSD: string | null;
  allowOversell: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Mirrors the monorepo's EvmLink view-model shape. */
export type EvmLink = {
  metadata: {
    uri: string | null;
    rkey: string | null;
    did: string | null;
    cid: string | null;
    createdAt: string | null;
  } | null;
  specialMetadata: {
    valid: boolean | null;
  } | null;
  record: {
    name: string | null;
    address: string | null;
    platformAttestation: {
      platformAddress: string | null;
    } | null;
  } | null;
};

const FUNDING_CONFIG_COLLECTION = "app.gainforest.funding.config";

// ── EVM link reads ────────────────────────────────────────────────────────────

const LINK_EVM_BY_DID_QUERY = `
  query LinkEvmByDid($did: String!, $first: Int) {
    appGainforestLinkEvm(where: { did: { eq: $did } }, first: $first, sortDirection: DESC, sortBy: createdAt) {
      edges {
        node {
          uri
          rkey
          did
          cid
          createdAt
          name
          address
          platformAttestation {
            __typename
            ... on AppGainforestLinkEvmEip712PlatformAttestation {
              platformAddress
            }
          }
          userProof {
            __typename
          }
        }
      }
    }
  }
`;

type LinkEvmNode = {
  uri?: string | null;
  rkey?: string | null;
  did?: string | null;
  cid?: string | null;
  createdAt?: string | null;
  name?: string | null;
  address?: string | null;
  platformAttestation?: { __typename?: string; platformAddress?: string | null } | null;
  userProof?: { __typename?: string } | null;
};

/** Fetch the linked EVM wallets for a DID, shaped as EvmLink[]. */
export async function fetchEvmLinks(did: string): Promise<EvmLink[]> {
  if (!did) return [];
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: LINK_EVM_BY_DID_QUERY, variables: { did, first: 50 } }),
  });
  const json = (await response.json().catch(() => null)) as {
    data?: { appGainforestLinkEvm?: { edges?: Array<{ node?: LinkEvmNode }> } };
  } | null;

  return (
    json?.data?.appGainforestLinkEvm?.edges?.map(({ node }): EvmLink => {
      const valid =
        node?.platformAttestation?.__typename === "AppGainforestLinkEvmEip712PlatformAttestation" &&
        node?.userProof?.__typename === "AppGainforestLinkEvmEip712Proof";
      return {
        metadata: {
          uri: node?.uri ?? null,
          rkey: node?.rkey ?? null,
          did: node?.did ?? null,
          cid: node?.cid ?? null,
          createdAt: node?.createdAt ?? null,
        },
        specialMetadata: { valid },
        record: {
          name: node?.name ?? null,
          address: node?.address ?? null,
          platformAttestation: { platformAddress: node?.platformAttestation?.platformAddress ?? null },
        },
      };
    }) ?? []
  );
}

/**
 * Client hook — fetches the linked wallets for a DID.
 * Used by the funding config modal to populate the receiving-wallet dropdown.
 */
export function useEvmLinks(did: string | undefined) {
  const [data, setData] = useState<EvmLink[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!!did);

  const refetch = useCallback(() => {
    if (!did) {
      setData([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchEvmLinks(did)
      .then((links) => setData(links))
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, [did]);

  useEffect(() => {
    let cancelled = false;
    if (!did) {
      setData([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchEvmLinks(did)
      .then((links) => {
        if (!cancelled) setData(links);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [did]);

  return { data, isLoading, refetch };
}

// ── Wallet validity ─────────────────────────────────────────────────────────

/**
 * Whether a linked wallet is trusted by the platform for receiving donations:
 * its platform attestation must be signed by the facilitator wallet. When no
 * facilitator address is configured we trust any validly-attested wallet.
 */
export function isWalletTrusted(
  link: EvmLink,
  facilitatorAddress: string | undefined = FACILITATOR_WALLET_ADDRESS,
): boolean {
  if (!facilitatorAddress) return true;
  const pa = link.record?.platformAttestation?.platformAddress;
  if (!pa) return false;
  return pa.toLowerCase() === facilitatorAddress.toLowerCase();
}

/** Compute the receiving-wallet validity flags for a saved config. */
export function computeWalletFlags(
  config: FundingConfigData | null,
  evmLinks: EvmLink[],
): { valid: boolean; trusted: boolean } {
  if (!config?.receivingWallet?.uri) return { valid: false, trusted: false };
  const uri = config.receivingWallet.uri;
  const match = evmLinks.find((l) => l.metadata?.uri === uri);
  if (!match) return { valid: false, trusted: false };
  return {
    valid: match.specialMetadata?.valid === true,
    trusted: isWalletTrusted(match),
  };
}

// ── Funding config write (upsert) ─────────────────────────────────────────────

export type UpsertFundingConfigInput = {
  /** Shares the bumicert's rkey. */
  rkey: string;
  receivingWalletUri: string;
  status: "open" | "coming-soon" | "paused" | "closed";
  goalInUSD?: string;
  minDonationInUSD?: string;
  maxDonationInUSD?: string;
  allowOversell: boolean;
  /** Preserve the original createdAt on update; defaults to now for create. */
  createdAt?: string | null;
};

/**
 * Upsert an app.gainforest.funding.config record at the bumicert's rkey.
 * A full replace via putRecord, preserving createdAt when known.
 */
export async function upsertFundingConfig(input: UpsertFundingConfigInput): Promise<void> {
  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    $type: FUNDING_CONFIG_COLLECTION,
    receivingWallet: {
      $type: `${FUNDING_CONFIG_COLLECTION}#evmLinkRef`,
      uri: input.receivingWalletUri,
    },
    status: input.status,
    allowOversell: input.allowOversell,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    ...(input.goalInUSD?.trim() ? { goalInUSD: input.goalInUSD.trim() } : {}),
    ...(input.minDonationInUSD?.trim() ? { minDonationInUSD: input.minDonationInUSD.trim() } : {}),
    ...(input.maxDonationInUSD?.trim() ? { maxDonationInUSD: input.maxDonationInUSD.trim() } : {}),
  };

  await putRecord(FUNDING_CONFIG_COLLECTION, input.rkey, record);
}
