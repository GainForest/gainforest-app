/**
 * Splits smart-vault organization wallets — shared (client + server) pieces.
 *
 * An organization's donation wallet is a Splits `SmartVault` (ERC-4337
 * passkey multisig, https://github.com/0xSplits/splits-contracts-monorepo,
 * packages/smart-vaults) whose address is derived deterministically with
 * CREATE2 from:
 *
 *   • owner      — always address(0): no superuser, only the signer set
 *                  controls the vault (owner could bypass the threshold and
 *                  authorize upgrades, so nobody gets that role)
 *   • signers[]  — the founding signer set: WebAuthn passkeys of org members
 *   • threshold  — 1 in v1 (any signer can act)
 *   • salt       — keccak256("gainforest:org-vault:v1:" + org DID)
 *
 * Because all four inputs live in the org's public record, ANYONE can
 * recompute `SmartVaultFactory.getAddress(...)` and check that the address
 * really belongs to the organization — the CREATE2 derivation is the proof.
 * The vault needs no deployment to receive funds; it is deployed lazily the
 * first time the org spends from it.
 *
 * IMPORTANT: the record must forever keep the FOUNDING signer set — it is a
 * CREATE2 input. While the vault is undeployed the set may still be edited
 * (the address is re-derived); once on-chain code exists at the address the
 * record is frozen and signer changes happen on-chain instead.
 */

import { keccak256, stringToBytes } from "viem";

/** Splits SmartVaultFactory — deployed at the same address across chains. */
export const SMART_VAULT_FACTORY = "0x8E6Af8Ed94E87B4402D0272C5D6b0D47F0483e7C" as const;

/** The vault's superuser slot is always empty (see module docs). */
export const VAULT_OWNER = "0x0000000000000000000000000000000000000000" as const;

/**
 * Default threshold at creation: any single signer can act. The owner can
 * raise it (up to the number of signers) while the vault is undeployed — the
 * threshold is a CREATE2 input, so changing it re-derives the address.
 */
export const VAULT_THRESHOLD = 1 as const;

/** Clamp a stored threshold into the valid 1..signerCount (≤255) range. */
export function clampVaultThreshold(threshold: number, signerCount: number): number {
  const max = Math.min(signerCount, 255);
  if (!Number.isInteger(threshold) || threshold < 1) return 1;
  return Math.min(threshold, max);
}

export const VAULT_SALT_SCHEME = "gainforest:org-vault:v1" as const;

/** Record collection + fixed rkey: one canonical wallet per account. */
export const PRIMARY_WALLET_COLLECTION = "app.gainforest.wallet.primary" as const;
export const PRIMARY_WALLET_RKEY = "self" as const;

/**
 * The original collection name the wallet records shipped under. Existing
 * records are still read from here and migrated to the primary collection on
 * their next write (see the wallet API routes).
 */
export const LEGACY_WALLET_COLLECTION = "app.gainforest.wallet.splitsVault" as const;

export type WalletCollection = typeof PRIMARY_WALLET_COLLECTION | typeof LEGACY_WALLET_COLLECTION;

export function primaryWalletUri(did: string, collection: WalletCollection = PRIMARY_WALLET_COLLECTION): string {
  return `at://${did}/${collection}/${PRIMARY_WALLET_RKEY}`;
}

/** Whether a URI points at an account's primary-wallet record (either collection). */
export function isPrimaryWalletUri(uri: string | null | undefined): boolean {
  return (
    typeof uri === "string" &&
    (uri.includes(`/${PRIMARY_WALLET_COLLECTION}/`) || uri.includes(`/${LEGACY_WALLET_COLLECTION}/`))
  );
}

/**
 * Deterministic per-account CREATE2 salt (uint256, hex encoded). Keyed by the
 * account DID — personal wallets (an individual's own repo) reuse the exact
 * same derivation as organization wallets, so one verification path covers
 * both (see fetchVerifiedVault in ./server.ts).
 */
export function orgVaultSalt(orgDid: string): `0x${string}` {
  return keccak256(stringToBytes(`${VAULT_SALT_SCHEME}:${orgDid}`));
}

// ── Signers ───────────────────────────────────────────────────────────────────

/**
 * A vault signer as stored in the org record. v1 supports passkeys only —
 * `publicKeyX`/`publicKeyY` are the 32-byte secp256r1 coordinates, exactly
 * what the SmartVault `Signer` struct encodes in `slot1`/`slot2`.
 */
export type VaultPasskeySigner = {
  kind: "passkey";
  /** 32-byte hex, P-256 public key X coordinate. */
  publicKeyX: `0x${string}`;
  /** 32-byte hex, P-256 public key Y coordinate. */
  publicKeyY: `0x${string}`;
  /** WebAuthn credential id (base64url) — lets the browser find the passkey again. */
  credentialId: string;
  /** DID of the member this passkey belongs to. */
  memberDid: string;
  /** Plain-language label, e.g. the member's display name. */
  label?: string;
  addedAt: string;
};

export type SplitsVaultRecord = {
  $type: WalletCollection;
  name?: string;
  /** Predicted deterministic vault address for the params below. */
  address: `0x${string}`;
  factory: `0x${string}`;
  chainId: number;
  owner: `0x${string}`;
  threshold: number;
  saltScheme: string;
  signers: VaultPasskeySigner[];
  createdAt: string;
};

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export function isHex32(value: unknown): value is `0x${string}` {
  return typeof value === "string" && HEX32.test(value);
}

/** SmartVault `Signer` struct: passkey ⇒ slot1 = x, slot2 = y (y must be non-zero). */
export function toSignerStruct(signer: VaultPasskeySigner): { slot1: `0x${string}`; slot2: `0x${string}` } {
  return { slot1: signer.publicKeyX, slot2: signer.publicKeyY };
}

/** Parse a `SplitsVaultRecord` defensively from unknown PDS data. */
export function parseSplitsVaultRecord(value: unknown): SplitsVaultRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.$type !== PRIMARY_WALLET_COLLECTION && record.$type !== LEGACY_WALLET_COLLECTION) return null;
  if (typeof record.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(record.address)) return null;
  if (typeof record.factory !== "string" || typeof record.owner !== "string") return null;
  if (typeof record.chainId !== "number" || typeof record.threshold !== "number") return null;
  if (!Number.isInteger(record.threshold) || record.threshold < 1 || record.threshold > 255) return null;
  if (typeof record.saltScheme !== "string" || !Array.isArray(record.signers)) return null;
  const signers: VaultPasskeySigner[] = [];
  for (const raw of record.signers) {
    const s = raw as Record<string, unknown>;
    if (s?.kind !== "passkey") return null;
    if (!isHex32(s.publicKeyX) || !isHex32(s.publicKeyY)) return null;
    if (typeof s.credentialId !== "string" || typeof s.memberDid !== "string") return null;
    signers.push({
      kind: "passkey",
      publicKeyX: s.publicKeyX,
      publicKeyY: s.publicKeyY,
      credentialId: s.credentialId,
      memberDid: s.memberDid,
      label: typeof s.label === "string" ? s.label : undefined,
      addedAt: typeof s.addedAt === "string" ? s.addedAt : "",
    });
  }
  if (signers.length === 0) return null;
  if (record.threshold > signers.length) return null;
  return {
    $type: record.$type,
    name: typeof record.name === "string" ? record.name : undefined,
    address: record.address as `0x${string}`,
    factory: record.factory as `0x${string}`,
    chainId: record.chainId,
    owner: record.owner as `0x${string}`,
    threshold: record.threshold,
    saltScheme: record.saltScheme,
    signers,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
  };
}

// ── Factory ABI (the slice we use) ────────────────────────────────────────────

export const SMART_VAULT_FACTORY_ABI = [
  {
    type: "function",
    name: "getAddress",
    stateMutability: "view",
    inputs: [
      { name: "owner_", type: "address" },
      {
        name: "signers_",
        type: "tuple[]",
        components: [
          { name: "slot1", type: "bytes32" },
          { name: "slot2", type: "bytes32" },
        ],
      },
      { name: "threshold_", type: "uint8" },
      { name: "salt_", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
