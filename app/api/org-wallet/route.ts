import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { fetchCgsMembersForRequest, type CgsServerRole } from "@/app/_lib/cgs-server";
import {
  SMART_VAULT_FACTORY,
  SPLITS_VAULT_COLLECTION,
  SPLITS_VAULT_RKEY,
  VAULT_OWNER,
  VAULT_THRESHOLD,
  VAULT_SALT_SCHEME,
  splitsVaultUri,
  type SplitsVaultRecord,
  type VaultPasskeySigner,
} from "@/lib/splits-vault/shared";
import {
  fetchSplitsVaultRecord,
  isVaultDeployed,
  predictVaultAddress,
  vaultHoldsFunds,
} from "@/lib/splits-vault/server";
import { CHAIN_ID } from "@/lib/facilitator/usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const passkeySchema = z.object({
  credentialId: z.string().min(1).max(400),
  publicKeyX: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  publicKeyY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  label: z.string().trim().min(1).max(80).optional(),
});

const createSchema = z.object({
  repo: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  passkey: passkeySchema,
});

const addSignerSchema = z.object({
  repo: z.string().min(1),
  passkey: passkeySchema,
});

const removeSignerSchema = z.object({
  repo: z.string().min(1),
  remove: z.object({ credentialId: z.string().min(1) }),
});

const deleteSchema = z.object({ repo: z.string().min(1) });

async function viewerRole(repo: string, did: string): Promise<CgsServerRole | null> {
  try {
    const { members } = await fetchCgsMembersForRequest(repo);
    return members.find((member) => member.did === did)?.role ?? null;
  } catch {
    return null;
  }
}

async function writeVaultRecord(
  operation: "putRecord" | "deleteRecord",
  repo: string,
  record?: SplitsVaultRecord,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headerList = await headers();
  const cookie = headerList.get("cookie");
  const upstream = await fetch(`${getAuthBaseUrl()}/api/cgs/mutation`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
      operation,
      collection: SPLITS_VAULT_COLLECTION,
      rkey: SPLITS_VAULT_RKEY,
      repo,
      ...(record ? { record } : {}),
    }),
  });
  const body = await upstream.json().catch(() => ({ error: "Invalid response from auth server" }));
  return { ok: upstream.ok, status: upstream.status, body };
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
  repo: string,
  signers: VaultPasskeySigner[],
  base?: { name?: string; createdAt?: string },
): Promise<SplitsVaultRecord> {
  const address = await predictVaultAddress(repo, signers);
  return {
    $type: SPLITS_VAULT_COLLECTION,
    ...(base?.name ? { name: base.name } : {}),
    address,
    factory: SMART_VAULT_FACTORY,
    chainId: CHAIN_ID,
    owner: VAULT_OWNER,
    threshold: VAULT_THRESHOLD,
    saltScheme: VAULT_SALT_SCHEME,
    signers,
    createdAt: base?.createdAt || new Date().toISOString(),
  };
}

// ── GET — vault status for org managers/members ──────────────────────────────

export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get("repo")?.trim();
  if (!repo) return NextResponse.json({ error: "Missing repo" }, { status: 400 });

  const session = await fetchAuthSession();
  if (!session.isLoggedIn || !session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const role = await viewerRole(repo, session.did);
  if (!role) return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });

  const record = await fetchSplitsVaultRecord(repo);
  if (!record) {
    return NextResponse.json({ exists: false, viewerRole: role });
  }
  const deployed = await isVaultDeployed(record.address).catch(() => false);
  return NextResponse.json({
    exists: true,
    viewerRole: role,
    record,
    uri: splitsVaultUri(repo),
    deployed,
  });
}

// ── POST — the owner creates the vault with their passkey ────────────────────

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { repo, name, passkey } = parsed.data;

  const session = await fetchAuthSession();
  if (!session.isLoggedIn || !session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const role = await viewerRole(repo, session.did);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only the organization owner or an admin can create the wallet" }, { status: 403 });
  }
  if (await fetchSplitsVaultRecord(repo)) {
    return NextResponse.json({ error: "This organization already has a wallet" }, { status: 409 });
  }

  const record = await buildRecord(repo, [toSigner(passkey, session.did)], { name }).catch(() => null);
  if (!record) return NextResponse.json({ error: "Could not derive the wallet address" }, { status: 502 });

  const result = await writeVaultRecord("putRecord", repo, record);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ record, uri: splitsVaultUri(repo), deployed: false });
}

// ── PATCH — add my passkey (any member) / remove a signer (owner) ────────────

export async function PATCH(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const session = await fetchAuthSession();
  if (!session.isLoggedIn || !session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const add = addSignerSchema.safeParse(json);
  const remove = removeSignerSchema.safeParse(json);
  if (!add.success && !remove.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const repo = add.success ? add.data.repo : remove.success ? remove.data.repo : "";

  const role = await viewerRole(repo, session.did);
  if (!role) return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });

  const existing = await fetchSplitsVaultRecord(repo);
  if (!existing) return NextResponse.json({ error: "This organization has no wallet yet" }, { status: 404 });

  if (await isVaultDeployed(existing.address).catch(() => false)) {
    return NextResponse.json(
      { error: "The wallet is already active on the blockchain, so its signers can no longer be changed here" },
      { status: 409 },
    );
  }

  let signers: VaultPasskeySigner[];
  if (add.success) {
    // Members may only enroll a passkey for themselves.
    if (existing.signers.some((signer) => signer.credentialId === add.data.passkey.credentialId)) {
      return NextResponse.json({ error: "This passkey is already a signer" }, { status: 409 });
    }
    signers = [...existing.signers, toSigner(add.data.passkey, session.did)];
  } else if (remove.success) {
    const target = existing.signers.find((signer) => signer.credentialId === remove.data.remove.credentialId);
    if (!target) return NextResponse.json({ error: "Signer not found" }, { status: 404 });
    const canRemove = role === "owner" || role === "admin" || target.memberDid === session.did;
    if (!canRemove) {
      return NextResponse.json({ error: "You can only remove your own passkey" }, { status: 403 });
    }
    signers = existing.signers.filter((signer) => signer.credentialId !== remove.data.remove.credentialId);
    if (signers.length === 0) {
      return NextResponse.json({ error: "The wallet needs at least one signer" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const record = await buildRecord(repo, signers, { name: existing.name, createdAt: existing.createdAt }).catch(() => null);
  if (!record) return NextResponse.json({ error: "Could not derive the wallet address" }, { status: 502 });

  const result = await writeVaultRecord("putRecord", repo, record);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ record, uri: splitsVaultUri(repo), deployed: false });
}

// ── DELETE — owner removes an unused wallet ───────────────────────────────────

export async function DELETE(request: NextRequest) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { repo } = parsed.data;

  const session = await fetchAuthSession();
  if (!session.isLoggedIn || !session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const role = await viewerRole(repo, session.did);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only the organization owner or an admin can remove the wallet" }, { status: 403 });
  }

  const existing = await fetchSplitsVaultRecord(repo);
  if (!existing) return NextResponse.json({ error: "This organization has no wallet" }, { status: 404 });
  if (await isVaultDeployed(existing.address).catch(() => false)) {
    return NextResponse.json({ error: "The wallet is already active on the blockchain and cannot be removed" }, { status: 409 });
  }
  if (await vaultHoldsFunds(existing.address).catch(() => true)) {
    return NextResponse.json({ error: "The wallet address already holds funds and cannot be removed" }, { status: 409 });
  }

  const result = await writeVaultRecord("deleteRecord", repo);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ deleted: true });
}
