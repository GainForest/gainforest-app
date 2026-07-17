import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  SMART_VAULT_FACTORY,
  PRIMARY_WALLET_COLLECTION,
  PRIMARY_WALLET_RKEY,
  LEGACY_WALLET_COLLECTION,
  VAULT_OWNER,
  VAULT_THRESHOLD,
  VAULT_SALT_SCHEME,
  clampVaultThreshold,
  primaryWalletUri,
  type SplitsVaultRecord,
  type VaultPasskeySigner,
  type WalletCollection,
} from "@/lib/splits-vault/shared";
import {
  fetchPendingSendRecord,
  fetchWalletRecordWithSource,
  getWalletBalances,
  isVaultDeployed,
  predictVaultAddress,
  vaultHoldsFunds,
} from "@/lib/splits-vault/server";
import { CHAIN_ID } from "@/lib/facilitator/usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Personal donation wallet — the individual-profile counterpart of
 * /api/org-wallet. Same Splits smart-vault derivation (the CREATE2 salt is
 * keyed by the account DID, see lib/splits-vault/shared.ts), but the record
 * lives in the signed-in user's own repo and every write goes through their
 * own session — the repo is NEVER taken from the request body.
 *
 * The owner creates the wallet with one passkey and may enroll additional
 * passkeys (another device, a family member's key…) while the wallet has not
 * been activated on-chain. Once deployed, the signer set is managed on-chain
 * and this route becomes read-only, exactly like the organization flow.
 */

const passkeySchema = z.object({
  credentialId: z.string().min(1).max(400),
  publicKeyX: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  publicKeyY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  label: z.string().trim().min(1).max(80).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  passkey: passkeySchema,
});

const addSignerSchema = z.object({ passkey: passkeySchema });

const removeSignerSchema = z.object({
  remove: z.object({ credentialId: z.string().min(1) }),
});

const setThresholdSchema = z.object({ threshold: z.number().int().min(1).max(255) });

async function requireSessionDid(): Promise<string | null> {
  const session = await fetchAuthSession();
  return session.isLoggedIn && session.did ? session.did : null;
}

/** Write the vault record to the signed-in user's own repo via their session. */
async function writeVaultRecord(
  operation: "putRecord" | "deleteRecord",
  record?: SplitsVaultRecord,
  collection: WalletCollection = PRIMARY_WALLET_COLLECTION,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headerList = await headers();
  const cookie = headerList.get("cookie");
  const upstream = await fetch(`${getAuthBaseUrl()}/api/atproto/mutation`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
      operation,
      collection,
      rkey: PRIMARY_WALLET_RKEY,
      ...(record ? { record } : {}),
    }),
  });
  const body = await upstream.json().catch(() => ({ error: "Invalid response from auth server" }));
  return { ok: upstream.ok, status: upstream.status, body };
}

/** Best-effort cleanup of a legacy-collection record after a migrating write. */
async function deleteLegacyRecord(): Promise<void> {
  await writeVaultRecord("deleteRecord", undefined, LEGACY_WALLET_COLLECTION).catch(() => undefined);
}

function toSigner(passkey: z.infer<typeof passkeySchema>, memberDid: string): VaultPasskeySigner {
  return {
    kind: "passkey",
    publicKeyX: passkey.publicKeyX as `0x${string}`,
    publicKeyY: passkey.publicKeyY as `0x${string}`,
    credentialId: passkey.credentialId,
    memberDid,
    ...(passkey.label ? { label: passkey.label } : {}),
    addedAt: new Date().toISOString(),
  };
}

async function buildRecord(
  did: string,
  signers: VaultPasskeySigner[],
  base?: { name?: string; createdAt?: string },
  threshold: number = VAULT_THRESHOLD,
): Promise<SplitsVaultRecord> {
  const address = await predictVaultAddress(did, signers, threshold);
  return {
    $type: PRIMARY_WALLET_COLLECTION,
    ...(base?.name ? { name: base.name } : {}),
    address,
    factory: SMART_VAULT_FACTORY,
    chainId: CHAIN_ID,
    owner: VAULT_OWNER,
    threshold,
    saltScheme: VAULT_SALT_SCHEME,
    signers,
    createdAt: base?.createdAt || new Date().toISOString(),
  };
}

// ── GET — the owner's wallet status ──────────────────────────────────────────

export async function GET() {
  const did = await requireSessionDid();
  if (!did) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const found = await fetchWalletRecordWithSource(did);
  if (!found) return NextResponse.json({ exists: false });
  const [deployed, holdsFunds, balances, pendingSend] = await Promise.all([
    isVaultDeployed(found.record.address).catch(() => false),
    vaultHoldsFunds(found.record.address).catch(() => false),
    getWalletBalances(found.record.address).catch(() => null),
    fetchPendingSendRecord(did).catch(() => null),
  ]);
  return NextResponse.json({
    exists: true,
    record: found.record,
    uri: primaryWalletUri(did, found.collection),
    deployed,
    holdsFunds,
    balances,
    pendingSend,
  });
}

// ── POST — create the wallet with the owner's passkey ────────────────────────

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.flatten() }, { status: 400 });
  }
  const did = await requireSessionDid();
  if (!did) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (await fetchWalletRecordWithSource(did)) {
    return NextResponse.json({ error: "You already have a wallet" }, { status: 409 });
  }

  const { name, passkey } = parsed.data;
  const record = await buildRecord(did, [toSigner(passkey, did)], { name }).catch(() => null);
  if (!record) return NextResponse.json({ error: "Could not derive the wallet address" }, { status: 502 });

  const result = await writeVaultRecord("putRecord", record);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ record, uri: primaryWalletUri(did), deployed: false });
}

// ── PATCH — add another passkey / remove a signer ─────────────────────────────

export async function PATCH(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const did = await requireSessionDid();
  if (!did) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const add = addSignerSchema.safeParse(json);
  const remove = removeSignerSchema.safeParse(json);
  const setThreshold = setThresholdSchema.safeParse(json);
  if (!add.success && !remove.success && !setThreshold.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const found = await fetchWalletRecordWithSource(did);
  if (!found) return NextResponse.json({ error: "You have no wallet yet" }, { status: 404 });
  const existing = found.record;

  if (await isVaultDeployed(existing.address).catch(() => false)) {
    return NextResponse.json(
      { error: "The wallet is already active on the blockchain, so its signers can no longer be changed here" },
      { status: 409 },
    );
  }

  let signers: VaultPasskeySigner[];
  let threshold = existing.threshold;
  if (add.success) {
    if (existing.signers.some((signer) => signer.credentialId === add.data.passkey.credentialId)) {
      return NextResponse.json({ error: "This passkey is already a signer" }, { status: 409 });
    }
    signers = [...existing.signers, toSigner(add.data.passkey, did)];
  } else if (remove.success) {
    const target = existing.signers.find((signer) => signer.credentialId === remove.data.remove.credentialId);
    if (!target) return NextResponse.json({ error: "Signer not found" }, { status: 404 });
    signers = existing.signers.filter((signer) => signer.credentialId !== remove.data.remove.credentialId);
    if (signers.length === 0) {
      return NextResponse.json({ error: "The wallet needs at least one signer" }, { status: 400 });
    }
    // Never leave the threshold above the number of remaining passkeys.
    threshold = clampVaultThreshold(threshold, signers.length);
  } else if (setThreshold.success) {
    signers = existing.signers;
    if (setThreshold.data.threshold > signers.length) {
      return NextResponse.json({ error: "The wallet does not have that many passkeys" }, { status: 400 });
    }
    // The threshold is a CREATE2 input — changing it changes the address, so
    // refuse once the current address already holds funds.
    if (await vaultHoldsFunds(existing.address).catch(() => true)) {
      return NextResponse.json(
        { error: "The wallet address already holds funds, so the approval requirement can no longer be changed here" },
        { status: 409 },
      );
    }
    threshold = setThreshold.data.threshold;
  } else {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const record = await buildRecord(did, signers, { name: existing.name, createdAt: existing.createdAt }, threshold).catch(
    () => null,
  );
  if (!record) return NextResponse.json({ error: "Could not derive the wallet address" }, { status: 502 });

  const result = await writeVaultRecord("putRecord", record);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  // Migrate-on-write: the updated record now lives in the primary collection.
  if (found.collection === LEGACY_WALLET_COLLECTION) await deleteLegacyRecord();
  return NextResponse.json({ record, uri: primaryWalletUri(did), deployed: false });
}

// ── DELETE — the owner removes an unused wallet ───────────────────────────────

export async function DELETE() {
  const did = await requireSessionDid();
  if (!did) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const found = await fetchWalletRecordWithSource(did);
  if (!found) return NextResponse.json({ error: "You have no wallet" }, { status: 404 });
  const existing = found.record;
  if (await isVaultDeployed(existing.address).catch(() => false)) {
    return NextResponse.json({ error: "The wallet is already active on the blockchain and cannot be removed" }, { status: 409 });
  }
  if (await vaultHoldsFunds(existing.address).catch(() => true)) {
    return NextResponse.json({ error: "The wallet address already holds funds and cannot be removed" }, { status: 409 });
  }

  const result = await writeVaultRecord("deleteRecord", undefined, found.collection);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ deleted: true });
}
