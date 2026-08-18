import "server-only";

import { searchAccountsByName, fetchAccountCards, indexerQuery, type AccountCard } from "@/app/_lib/indexer";
import { resolvePdsHost } from "@/app/_lib/pds";
import { resolveDidIdentity } from "@/app/_lib/did-identity";
import { resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import { defaultWalletPdsDomain, MIN_WALLET_SEARCH_LENGTH } from "@/app/_lib/wallet-domain";
import {
  LEGACY_WALLET_COLLECTION,
  PRIMARY_WALLET_COLLECTION,
  PRIMARY_WALLET_RKEY,
  parseSplitsVaultRecord,
} from "@/lib/splits-vault/shared";

/**
 * Admin "Wallet connections": for a searched account, show which wallets it
 * has connected — a donation vault (`app.gainforest.wallet.primary`, plus the
 * legacy collection) stored in the account's own repo, and/or one or more
 * linked EVM wallets (`app.gainforest.linkEvm`, indexed by Hyperindex).
 *
 * This is intentionally SEARCH-FIRST, not a scan: listing every account would
 * mean reading every one of the ~14k repos on certified.one, which is far too
 * expensive for an admin view. Instead the admin types a name, handle or DID,
 * we resolve it to a small set of accounts, and only those are checked.
 */

const MAX_RESULTS = 12;
const RECORD_READ_TIMEOUT_MS = 8000;

export type WalletVaultInfo = {
  address: `0x${string}`;
  name: string | null;
  createdAt: string;
  threshold: number;
  signerCount: number;
  /** True when the record still lives under the legacy collection name. */
  legacy: boolean;
};

export type LinkedEvmInfo = {
  address: string;
  name: string | null;
  createdAt: string | null;
  valid: boolean;
};

export type WalletConnectionRow = {
  did: string;
  kind: "person" | "org";
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  vault: WalletVaultInfo | null;
  linkedEvm: LinkedEvmInfo[];
};

export type WalletConnectionsSearchResult = {
  rows: WalletConnectionRow[];
};

// ── Resolve a search term to candidate accounts ──────────────────────────────

/** A handle that belongs to our own PDS resolves directly there. */
async function resolveHandleViaOwnPds(handle: string): Promise<string | null> {
  const domain = defaultWalletPdsDomain();
  const params = new URLSearchParams({ handle });
  const url = `https://${domain}/xrpc/com.atproto.identity.resolveHandle?${params.toString()}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as { did?: unknown } | null;
  return typeof payload?.did === "string" && payload.did.startsWith("did:") ? payload.did : null;
}

async function resolveCandidateDids(query: string): Promise<string[]> {
  const cleaned = query.trim().toLowerCase();
  const dids = new Set<string>();

  // Exact handle or DID → its account (our own handles resolve via the PDS
  // when the canonical DNS/well-known lookup can't).
  const exact = await resolveIdentifierToDid(cleaned).catch(() => null);
  if (exact) dids.add(exact);
  if (!exact && /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(cleaned)) {
    const own = await resolveHandleViaOwnPds(cleaned).catch(() => null);
    if (own) dids.add(own);
  }

  // Display-name matches from the indexer.
  const byName = await searchAccountsByName(cleaned, 8).catch(() => []);
  for (const account of byName) dids.add(account.did);

  return [...dids].slice(0, MAX_RESULTS);
}

// ── Per-account wallet reads ─────────────────────────────────────────────────

async function fetchWalletRecordFromPds(did: string, pdsHost: string): Promise<WalletVaultInfo | null> {
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
    return {
      address: record.address,
      name: record.name ?? null,
      createdAt: record.createdAt,
      threshold: record.threshold,
      signerCount: record.signers.length,
      legacy: collection === LEGACY_WALLET_COLLECTION,
    };
  }
  return null;
}

async function fetchVaultForDid(did: string): Promise<WalletVaultInfo | null> {
  const pdsHost = await resolvePdsHost(did).catch(() => null);
  if (!pdsHost) return null;
  return fetchWalletRecordFromPds(did, pdsHost);
}

const LINKED_EVM_BY_DID_QUERY = `
  query AdminLinkedEvmByDid($did: String!, $first: Int!) {
    appGainforestLinkEvm(
      first: $first
      where: { did: { eq: $did } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges {
        node {
          address
          createdAt
          name
          userProof { __typename }
          platformAttestation { __typename }
        }
      }
    }
  }
`;

type RawLinkedEvmNode = {
  address?: string | null;
  createdAt?: string | null;
  name?: string | null;
  userProof?: { __typename?: string | null } | null;
  platformAttestation?: { __typename?: string | null } | null;
};

async function fetchLinkedEvmForDid(did: string): Promise<LinkedEvmInfo[]> {
  const data = await indexerQuery<{
    appGainforestLinkEvm?: { edges?: Array<{ node?: RawLinkedEvmNode | null } | null> | null } | null;
  }>(LINKED_EVM_BY_DID_QUERY, { did, first: 50 }).catch(() => null);
  const edges = data?.appGainforestLinkEvm?.edges ?? [];
  const out: LinkedEvmInfo[] = [];
  for (const edge of edges) {
    const node = edge?.node;
    if (!node?.address) continue;
    const valid =
      node.platformAttestation?.__typename === "AppGainforestLinkEvmEip712PlatformAttestation" &&
      node.userProof?.__typename === "AppGainforestLinkEvmEip712Proof";
    out.push({
      address: node.address,
      name: node.name?.trim() || null,
      createdAt: node.createdAt ?? null,
      valid,
    });
  }
  return out;
}

// ── Compose results ──────────────────────────────────────────────────────────

/** Look up the accounts matching `query` and report their wallet connections. */
export async function searchWalletConnections(query: string): Promise<WalletConnectionRow[]> {
  const cleaned = query.trim().toLowerCase();
  if (cleaned.length < MIN_WALLET_SEARCH_LENGTH) return [];

  const dids = await resolveCandidateDids(cleaned);
  if (dids.length === 0) return [];

  // One round trip per DID for identity + each wallet source, all bounded.
  const rows: WalletConnectionRow[] = [];
  for (const did of dids) {
    const [vault, linkedEvm, card, identity] = await Promise.all([
      fetchVaultForDid(did),
      fetchLinkedEvmForDid(did),
      fetchAccountCards([did]).catch(() => new Map<string, AccountCard>()),
      resolveDidIdentity(did).catch(() => null),
    ]);
    const accountCard = card.get(did);
    rows.push({
      did,
      kind: accountCard?.isOrganization ? "org" : "person",
      handle: accountCard?.handle ?? identity?.handle ?? null,
      displayName: accountCard?.displayName ?? null,
      avatarUrl: null,
      vault,
      linkedEvm,
    });
  }

  return rows.sort((a, b) =>
    (a.displayName ?? a.handle ?? "").localeCompare(b.displayName ?? b.handle ?? ""),
  );
}