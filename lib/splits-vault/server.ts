/**
 * Splits smart-vault organization wallets — server-side helpers.
 *
 * Everything here runs on Ethereum mainnet (the chain the donation flow
 * settles on, see lib/facilitator/usdc.ts) and against the org's own PDS —
 * the vault record intentionally is NOT read through the indexer so the
 * verification path has no third dependency: PDS record + one RPC read.
 */

import "server-only";

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { erc20Abi } from "viem";
import { RPC_URL, USDC_CONTRACT } from "@/lib/facilitator/usdc";
import { WALLET_TOKENS, type WalletBalances } from "./tokens";
import { resolveDidIdentity } from "@/app/_lib/did-identity";
import {
  SMART_VAULT_FACTORY,
  SMART_VAULT_FACTORY_ABI,
  MULTI_SIGNER_AUTH_ABI,
  PRIMARY_WALLET_COLLECTION,
  PRIMARY_WALLET_RKEY,
  LEGACY_WALLET_COLLECTION,
  PENDING_SEND_COLLECTION,
  PENDING_SEND_RKEY,
  VAULT_OWNER,
  VAULT_THRESHOLD,
  orgVaultSalt,
  parsePendingSendRecord,
  parseSplitsVaultRecord,
  signerDirectory,
  toSignerStruct,
  type PendingSendRecord,
  type SplitsVaultRecord,
  type VaultLiveSigner,
  type VaultPasskeySigner,
  type VaultSignerSet,
  type WalletCollection,
} from "./shared";

export function getMainnetClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETHEREUM_RPC_URL || process.env.MAINNET_RPC_URL || RPC_URL),
  });
}

const getClient = getMainnetClient;

/** Ask the factory for the deterministic vault address of a signer set. */
export async function predictVaultAddress(
  orgDid: string,
  signers: VaultPasskeySigner[],
  threshold: number = VAULT_THRESHOLD,
): Promise<`0x${string}`> {
  if (signers.length === 0) throw new Error("At least one signer is required");
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > signers.length) {
    throw new Error("Invalid signer threshold");
  }
  return getClient().readContract({
    address: SMART_VAULT_FACTORY,
    abi: SMART_VAULT_FACTORY_ABI,
    functionName: "getAddress",
    args: [VAULT_OWNER, signers.map(toSignerStruct), threshold, BigInt(orgVaultSalt(orgDid))],
  });
}

export async function isVaultDeployed(address: `0x${string}`): Promise<boolean> {
  const code = await getClient().getCode({ address });
  return typeof code === "string" && code !== "0x";
}

/** ETH + USDC balances — used to block deleting a funded (even undeployed) vault. */
export async function vaultHoldsFunds(address: `0x${string}`): Promise<boolean> {
  const client = getClient();
  const [eth, usdc] = await Promise.all([
    client.getBalance({ address }),
    client
      .readContract({
        address: USDC_CONTRACT,
        abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
        functionName: "balanceOf",
        args: [address],
      })
      .catch(() => 0n),
  ]);
  return eth > 0n || usdc > 0n;
}

async function fetchRecordFromCollection(
  pdsHost: string,
  did: string,
  collection: WalletCollection,
): Promise<SplitsVaultRecord | null> {
  const url = new URL(`https://${pdsHost}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", collection);
  url.searchParams.set("rkey", PRIMARY_WALLET_RKEY);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as { value?: unknown } | null;
  return parseSplitsVaultRecord(json?.value);
}

/**
 * Fetch the account's canonical wallet record straight from its PDS,
 * remembering which collection it was found in. The primary collection wins;
 * records still living under the legacy collection are read as a fallback and
 * migrated to the primary collection on their next write.
 */
export async function fetchWalletRecordWithSource(
  did: string,
): Promise<{ record: SplitsVaultRecord; collection: WalletCollection } | null> {
  const { pdsHost } = await resolveDidIdentity(did);
  if (!pdsHost) return null;
  const primary = await fetchRecordFromCollection(pdsHost, did, PRIMARY_WALLET_COLLECTION);
  if (primary) return { record: primary, collection: PRIMARY_WALLET_COLLECTION };
  const legacy = await fetchRecordFromCollection(pdsHost, did, LEGACY_WALLET_COLLECTION);
  if (legacy) return { record: legacy, collection: LEGACY_WALLET_COLLECTION };
  return null;
}

// ── Balances ──────────────────────────────────────────────────────────────────────

let cachedEthUsd: { price: number; fetchedAt: number } | null = null;
const ETH_PRICE_TTL_MS = 5 * 60_000;

/** ETH spot price in USD (Coinbase), cached for a few minutes. Null on failure. */
async function fetchEthUsdPrice(): Promise<number | null> {
  if (cachedEthUsd && Date.now() - cachedEthUsd.fetchedAt < ETH_PRICE_TTL_MS) return cachedEthUsd.price;
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { cache: "no-store" });
    if (!response.ok) return cachedEthUsd?.price ?? null;
    const json = (await response.json()) as { data?: { amount?: string } };
    const price = Number(json?.data?.amount);
    if (!Number.isFinite(price) || price <= 0) return cachedEthUsd?.price ?? null;
    cachedEthUsd = { price, fetchedAt: Date.now() };
    return price;
  } catch {
    return cachedEthUsd?.price ?? null;
  }
}

/** ETH + USDC + USDT balances of the vault, with best-effort USD estimates. */
export async function getWalletBalances(address: `0x${string}`): Promise<WalletBalances> {
  const client = getClient();
  const [ethUsd, units] = await Promise.all([
    fetchEthUsdPrice(),
    Promise.all(
      WALLET_TOKENS.map((token) =>
        token.address
          ? client
              .readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address] })
              .catch(() => 0n)
          : client.getBalance({ address }).catch(() => 0n),
      ),
    ),
  ]);
  return {
    ethUsd,
    tokens: WALLET_TOKENS.map((token, index) => {
      const raw = units[index] ?? 0n;
      const amount = Number(raw) / 10 ** token.decimals;
      const usd = token.stable ? amount : ethUsd !== null ? amount * ethUsd : null;
      return { symbol: token.symbol, units: raw.toString(), usd };
    }),
  };
}

/** Fetch the account's canonical wallet record straight from its PDS. */
export async function fetchSplitsVaultRecord(did: string): Promise<SplitsVaultRecord | null> {
  const found = await fetchWalletRecordWithSource(did);
  return found?.record ?? null;
}

// ── Live signer set ──────────────────────────────────────────────────────────

/** How many on-chain signer slots we scan (indexes may have holes after removals). */
const SIGNER_SCAN_LIMIT = 64;

/**
 * The wallet's CURRENT signer set + threshold. For an undeployed vault this
 * is the founding set from the record; for a deployed vault the chain is the
 * authority (signers/threshold may have been changed on-chain), joined with
 * the record's passkey-metadata directory so the UI can label signers and
 * the browser can find the matching WebAuthn credentials.
 */
export async function getVaultSignerSet(record: SplitsVaultRecord, deployed: boolean): Promise<VaultSignerSet> {
  if (!deployed) {
    return {
      deployed: false,
      threshold: record.threshold,
      signers: record.signers.map((signer, index) => ({
        index,
        publicKeyX: signer.publicKeyX,
        publicKeyY: signer.publicKeyY,
        credentialId: signer.credentialId,
        label: signer.label,
        memberDid: signer.memberDid,
      })),
    };
  }

  const client = getClient();
  const [threshold, signerCount] = await Promise.all([
    client.readContract({ address: record.address, abi: MULTI_SIGNER_AUTH_ABI, functionName: "getThreshold" }),
    client.readContract({ address: record.address, abi: MULTI_SIGNER_AUTH_ABI, functionName: "getSignerCount" }),
  ]);

  const directory = signerDirectory(record);
  const scanLimit = Math.min(Math.max(directory.length + 8, 16), SIGNER_SCAN_LIMIT);
  const slots = await client.multicall({
    contracts: Array.from({ length: scanLimit }, (_, index) => ({
      address: record.address,
      abi: MULTI_SIGNER_AUTH_ABI,
      functionName: "getSigner" as const,
      args: [index],
    })),
    allowFailure: true,
  });

  const signers: VaultLiveSigner[] = [];
  for (let index = 0; index < slots.length && signers.length < signerCount; index += 1) {
    const slot = slots[index];
    if (slot.status !== "success") continue;
    const value = slot.result as { slot1: `0x${string}`; slot2: `0x${string}` };
    // Empty slot (removed or never used) — both words zero.
    if (BigInt(value.slot1) === 0n && BigInt(value.slot2) === 0n) continue;
    const meta = directory.find(
      (entry) =>
        entry.publicKeyX.toLowerCase() === value.slot1.toLowerCase() &&
        entry.publicKeyY.toLowerCase() === value.slot2.toLowerCase(),
    );
    signers.push({
      index,
      publicKeyX: value.slot1,
      publicKeyY: value.slot2,
      credentialId: meta?.credentialId,
      label: meta?.label,
      memberDid: meta?.memberDid,
    });
  }

  return { deployed: true, threshold: Number(threshold), signers };
}

/** Fetch the wallet's pending multi-approval transfer, if any. */
export async function fetchPendingSendRecord(did: string): Promise<PendingSendRecord | null> {
  const { pdsHost } = await resolveDidIdentity(did);
  if (!pdsHost) return null;
  const url = new URL(`https://${pdsHost}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", PENDING_SEND_COLLECTION);
  url.searchParams.set("rkey", PENDING_SEND_RKEY);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as { value?: unknown } | null;
  return parsePendingSendRecord(json?.value);
}

export type VerifiedVault = {
  record: SplitsVaultRecord;
  address: `0x${string}`;
  deployed: boolean;
};

/**
 * Verify the binding org DID → vault address by recomputing the CREATE2
 * prediction from the record's founding signer set. Returns null when there
 * is no record or the recorded address does not match the derivation.
 */
export async function fetchVerifiedVault(orgDid: string): Promise<VerifiedVault | null> {
  const record = await fetchSplitsVaultRecord(orgDid);
  if (!record) return null;
  if (record.factory.toLowerCase() !== SMART_VAULT_FACTORY.toLowerCase()) return null;
  if (record.owner !== VAULT_OWNER) return null;
  const predicted = await predictVaultAddress(orgDid, record.signers, record.threshold).catch(() => null);
  if (!predicted || predicted.toLowerCase() !== record.address.toLowerCase()) return null;
  const deployed = await isVaultDeployed(record.address).catch(() => false);
  return { record, address: record.address, deployed };
}
