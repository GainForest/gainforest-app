import { verifyMessage, verifyTypedData } from "viem";
import { INDEXER_URL } from "@/app/_lib/urls";

const LINK_EVM_QUERY = `
  query LinkEvmByDid($did: String!, $first: Int) {
    appGainforestLinkEvm(
      where: { did: { eq: $did } }
      first: $first
      sortDirection: DESC
      sortBy: createdAt
    ) {
      edges {
        node {
          did
          address
          userProof {
            __typename
            ... on AppGainforestLinkEvmEip712Proof {
              signature
              message { did evmAddress chainId timestamp nonce }
            }
          }
          platformAttestation {
            __typename
            ... on AppGainforestLinkEvmEip712PlatformAttestation {
              platformAddress
              signature
              signedData
            }
          }
        }
      }
    }
  }
`;

const ACTIVITY_CID_QUERY = `
  query ActivityCid($uri: String!) {
    orgHypercertsClaimActivityByUri(uri: $uri) { cid }
  }
`;

const EIP712_DOMAIN = {
  name: "ATProto EVM Attestation",
  version: "1",
} as const;

const EIP712_TYPES = {
  AttestLink: [
    { name: "did", type: "string" },
    { name: "evmAddress", type: "string" },
    { name: "chainId", type: "string" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "string" },
  ],
} as const;

type LinkMessage = {
  did?: string | null;
  evmAddress?: string | null;
  chainId?: string | null;
  timestamp?: string | null;
  nonce?: string | null;
};

type LinkNode = {
  did?: string | null;
  address?: string | null;
  userProof?: {
    __typename?: string | null;
    signature?: string | null;
    message?: LinkMessage | null;
  } | null;
  platformAttestation?: {
    __typename?: string | null;
    platformAddress?: string | null;
    signature?: string | null;
    signedData?: string | null;
  } | null;
};

function isHexAddress(value: string | null | undefined): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeHex(value: string): string {
  return value.toLowerCase();
}

async function indexerQuery<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json().catch(() => null)) as { data?: T | null } | null;
  return json?.data ?? null;
}

async function verifyUserProof(address: `0x${string}`, userProof: NonNullable<LinkNode["userProof"]>): Promise<boolean> {
  const message = userProof.message;
  if (!userProof.signature || !message) return false;
  return verifyTypedData({
    address,
    domain: EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: "AttestLink",
    message: {
      did: message.did ?? "",
      evmAddress: message.evmAddress ?? "",
      chainId: message.chainId ?? "",
      timestamp: message.timestamp ?? "",
      nonce: message.nonce ?? "",
    },
    signature: userProof.signature as `0x${string}`,
  }).catch(() => false);
}

async function verifyPlatformAttestation(attestation: NonNullable<LinkNode["platformAttestation"]>, signedData: string): Promise<boolean> {
  if (!attestation.platformAddress || !attestation.signature || !attestation.signedData) return false;
  if (!isHexAddress(attestation.platformAddress)) return false;
  if (normalizeHex(attestation.signedData) !== normalizeHex(signedData)) return false;

  return verifyMessage({
    address: attestation.platformAddress,
    message: { raw: signedData as `0x${string}` },
    signature: attestation.signature as `0x${string}`,
  }).catch(() => false);
}

async function isValidLink(node: LinkNode): Promise<boolean> {
  if (!isHexAddress(node.address)) return false;
  const userProof = node.userProof;
  if (!userProof || userProof.__typename !== "AppGainforestLinkEvmEip712Proof") return false;
  const message = userProof.message;
  if (!message || !userProof.signature) return false;
  if (message.did !== node.did) return false;
  if (!message.evmAddress || normalizeHex(message.evmAddress) !== normalizeHex(node.address)) return false;
  if (!(await verifyUserProof(node.address, userProof))) return false;

  const platformAttestation = node.platformAttestation;
  if (!platformAttestation || platformAttestation.__typename !== "AppGainforestLinkEvmEip712PlatformAttestation") return false;
  return verifyPlatformAttestation(platformAttestation, userProof.signature);
}

export async function fetchVerifiedRecipientAddress(did: string): Promise<string | null> {
  const data = await indexerQuery<{
    appGainforestLinkEvm?: { edges?: Array<{ node?: LinkNode | null } | null> | null } | null;
  }>(LINK_EVM_QUERY, { did, first: 20 });

  const nodes = data?.appGainforestLinkEvm?.edges?.map((edge) => edge?.node).filter((node): node is LinkNode => !!node) ?? [];
  for (const node of nodes) {
    if (await isValidLink(node)) return node.address ?? null;
  }
  return null;
}

export async function fetchActivityCid(activityUri: string): Promise<string | null> {
  const data = await indexerQuery<{ orgHypercertsClaimActivityByUri?: { cid?: string | null } | null }>(ACTIVITY_CID_QUERY, { uri: activityUri });
  return data?.orgHypercertsClaimActivityByUri?.cid ?? null;
}
