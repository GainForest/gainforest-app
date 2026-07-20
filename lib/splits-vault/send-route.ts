/**
 * Shared request handling for the wallet send API — used by both the
 * personal (/api/wallet/send) and organization (/api/org-wallet/send)
 * routes. The caller resolves the wallet record + session first; this module
 * enforces the signer policy and drives the steps:
 *
 *   prepare       → build the unsigned transfer + hashes to sign
 *   submit        → all approvals collected in one sitting
 *   start         → threshold > 1: store the transfer + the initiator's
 *                   light-hash approval as ONE pending record in the wallet repo
 *   approve       → add another light-hash approval to the pending record
 *                   (remote: any owner/member device, any enrolled passkey)
 *   finalize      → the last approver signs the FULL userOp hash; the transfer
 *                   is submitted on-chain and the pending record deleted
 *   cancel        → drop the pending record (initiator or a wallet manager)
 *   prepareManage → build an on-chain signer-set change (add/remove passkey,
 *                   approval threshold) for deployed or funded wallets
 *   submitManage  → execute the approved signer-set change on-chain
 *
 * All signer resolution runs against the LIVE signer set: for a deployed
 * vault the chain is the authority (its set may have diverged from the
 * founding record), joined with the record's passkey-metadata directory.
 *
 * Every approval is verified off-chain before it is stored, and the whole
 * bundle is re-verified + simulated before any gas is sponsored.
 *
 * Responses carry a stable `code` so the client can show translated,
 * plain-language errors; `error` is an English fallback for API consumers.
 */

import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  PENDING_SEND_COLLECTION,
  PENDING_SEND_RKEY,
  PRIMARY_WALLET_COLLECTION,
  PRIMARY_WALLET_RKEY,
  LEGACY_WALLET_COLLECTION,
  type PendingSendApproval,
  type PendingSendRecord,
  type SplitsVaultRecord,
  type VaultPasskeySigner,
  type VaultSignerSet,
  type WalletCollection,
} from "./shared";
import { fetchPendingSendRecord, getVaultSignerSet, isVaultDeployed, vaultHoldsFunds } from "./server";
import {
  decodeSendCallData,
  prepareManage,
  prepareSend,
  submitManage,
  submitSend,
  validatePreparedSend,
  verifyApprovalSignature,
  SendError,
  type ApprovalSignature,
  type ManageAction,
  type PreparedUserOp,
  type WebAuthnSignaturePayload,
} from "./send-server";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const bigintString = z.string().regex(/^\d{1,78}$/);

const prepareSchema = z.object({
  step: z.literal("prepare"),
  token: z.enum(["ETH", "USDC", "USDT"]),
  to: address,
  amountUnits: bigintString,
});

const userOpSchema = z.object({
  sender: address,
  nonce: bigintString,
  factory: address.optional(),
  factoryData: hex.optional(),
  callData: hex,
  callGasLimit: bigintString,
  verificationGasLimit: bigintString,
  preVerificationGas: bigintString,
  maxFeePerGas: bigintString,
  maxPriorityFeePerGas: bigintString,
});

const signatureSchema = z.object({
  credentialId: z.string().min(1).max(400),
  authenticatorData: hex.min(76),
  clientDataJSON: z.string().min(1).max(4000),
  challengeIndex: z.number().int().nonnegative(),
  typeIndex: z.number().int().nonnegative(),
  r: bigintString,
  s: bigintString,
});

const submitSchema = z.object({
  step: z.literal("submit"),
  userOp: userOpSchema,
  /** Ordered approvals: light-hash signatures first, full-hash signature last. */
  signatures: z.array(signatureSchema).min(1).max(16),
});

const startSchema = z.object({
  step: z.literal("start"),
  userOp: userOpSchema,
  /** The initiator's approval — a signature over the LIGHT userOp hash. */
  signature: signatureSchema,
});

const approveSchema = z.object({
  step: z.literal("approve"),
  /** Another approval over the LIGHT userOp hash. */
  signature: signatureSchema,
});

const finalizeSchema = z.object({
  step: z.literal("finalize"),
  /** The final approval — a signature over the FULL userOp hash. */
  signature: signatureSchema,
});

const cancelSchema = z.object({ step: z.literal("cancel") });

const manageActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("addSigner"),
    passkey: z.object({
      credentialId: z.string().min(1).max(400),
      publicKeyX: hex32,
      publicKeyY: hex32,
      label: z.string().trim().min(1).max(80).optional(),
    }),
  }),
  z.object({ type: z.literal("removeSigner"), signerIndex: z.number().int().min(0).max(255) }),
  z.object({ type: z.literal("setThreshold"), threshold: z.number().int().min(1).max(255) }),
]);

const prepareManageSchema = z.object({
  step: z.literal("prepareManage"),
  action: manageActionSchema,
});

const submitManageSchema = z.object({
  step: z.literal("submitManage"),
  userOp: userOpSchema,
  signatures: z.array(signatureSchema).min(1).max(16),
  action: manageActionSchema,
});

export const sendRequestSchema = z.discriminatedUnion("step", [
  prepareSchema,
  submitSchema,
  startSchema,
  approveSchema,
  finalizeSchema,
  cancelSchema,
  prepareManageSchema,
  submitManageSchema,
]);

const ERROR_FALLBACKS: Record<string, string> = {
  not_configured: "Sending is not enabled on this server",
  invalid_request: "Invalid send request",
  insufficient_balance: "The wallet does not hold enough of this token",
  network_busy: "The network is too busy right now — please try again later",
  signature_rejected: "The passkey approval could not be verified",
  submit_failed: "The transfer could not be confirmed on the blockchain",
  no_signer: "Only an enrolled passkey holder can send from this wallet",
  expired: "This transfer is no longer valid — please start it again",
  pending_exists: "There is already a transfer waiting for approvals",
  approval_invalid: "This approval could not be verified",
  cancel_forbidden: "Only the person who started this transfer or a wallet manager can cancel it",
  manage_forbidden: "Only a wallet manager can make this change",
};

function errorResponse(code: string, status: number): NextResponse {
  return NextResponse.json({ error: ERROR_FALLBACKS[code] || "Send failed", code }, { status });
}

export type SendRequestContext = {
  body: unknown;
  /** DID whose repo holds the wallet record (CREATE2 salt input). */
  walletDid: string;
  /** The signed-in user. */
  sessionDid: string;
  record: SplitsVaultRecord;
  /** Which collection the wallet record currently lives in (legacy records migrate on write). */
  walletCollection: WalletCollection;
  /** Organization wallet? Determines which mutation proxy stores records. */
  org: boolean;
  /** May the session user manage the wallet (org owner/admin; always for personal)? */
  canManageWallet: boolean;
  /** May the session user cancel any pending transfer? */
  canManagePending: boolean;
};

/** Write a record in the wallet's repo through the session's own mutation proxy. */
async function writeRepoRecord(
  ctx: SendRequestContext,
  operation: "putRecord" | "deleteRecord",
  collection: string,
  rkey: string,
  record?: unknown,
): Promise<{ ok: boolean; status: number }> {
  const headerList = await headers();
  const cookie = headerList.get("cookie");
  const endpoint = ctx.org ? "/api/cgs/mutation" : "/api/atproto/mutation";
  const upstream = await fetch(`${getAuthBaseUrl()}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
      operation,
      collection,
      rkey,
      ...(ctx.org ? { repo: ctx.walletDid } : {}),
      ...(record ? { record } : {}),
    }),
  });
  return { ok: upstream.ok, status: upstream.status };
}

async function writePendingRecord(
  ctx: SendRequestContext,
  operation: "putRecord" | "deleteRecord",
  record?: PendingSendRecord,
): Promise<{ ok: boolean; status: number }> {
  return writeRepoRecord(ctx, operation, PENDING_SEND_COLLECTION, PENDING_SEND_RKEY, record);
}

/**
 * After an on-chain passkey enrolment, remember the passkey's metadata in the
 * wallet record's `addedSigners` directory (best-effort — the chain already
 * holds the authority; without metadata the signer just shows unlabeled).
 */
async function appendAddedSigner(
  ctx: SendRequestContext,
  passkey: { credentialId: string; publicKeyX: string; publicKeyY: string; label?: string },
): Promise<boolean> {
  const entry: VaultPasskeySigner = {
    kind: "passkey",
    publicKeyX: passkey.publicKeyX as `0x${string}`,
    publicKeyY: passkey.publicKeyY as `0x${string}`,
    credentialId: passkey.credentialId,
    memberDid: ctx.sessionDid,
    ...(passkey.label ? { label: passkey.label } : {}),
    addedAt: new Date().toISOString(),
  };
  const updated: SplitsVaultRecord = {
    ...ctx.record,
    $type: PRIMARY_WALLET_COLLECTION,
    addedSigners: [
      ...(ctx.record.addedSigners ?? []).filter((existing) => existing.credentialId !== entry.credentialId),
      entry,
    ],
  };
  const write = await writeRepoRecord(ctx, "putRecord", PRIMARY_WALLET_COLLECTION, PRIMARY_WALLET_RKEY, updated).catch(
    () => ({ ok: false, status: 0 }),
  );
  if (write.ok && ctx.walletCollection === LEGACY_WALLET_COLLECTION) {
    // Migrate-on-write: the updated record now lives in the primary collection.
    await writeRepoRecord(ctx, "deleteRecord", LEGACY_WALLET_COLLECTION, PRIMARY_WALLET_RKEY).catch(() => undefined);
  }
  return write.ok;
}

function toApprovalSignature(signature: z.infer<typeof signatureSchema>): ApprovalSignature {
  return {
    credentialId: signature.credentialId,
    authenticatorData: signature.authenticatorData as `0x${string}`,
    clientDataJSON: signature.clientDataJSON,
    challengeIndex: signature.challengeIndex,
    typeIndex: signature.typeIndex,
    r: signature.r,
    s: signature.s,
  };
}

function toStoredApproval(signature: ApprovalSignature, sessionDid: string): PendingSendApproval {
  return { ...signature, addedBy: sessionDid, addedAt: new Date().toISOString() };
}

function toManageAction(action: z.infer<typeof manageActionSchema>): ManageAction {
  if (action.type === "addSigner") {
    return {
      type: "addSigner",
      publicKeyX: action.passkey.publicKeyX as `0x${string}`,
      publicKeyY: action.passkey.publicKeyY as `0x${string}`,
    };
  }
  if (action.type === "removeSigner") return { type: "removeSigner", signerIndex: action.signerIndex };
  return { type: "setThreshold", threshold: action.threshold };
}

/**
 * Role policy for on-chain signer-set changes, mirroring the record-edit
 * rules: anyone (owner/member, route-gated) may enroll their own passkey;
 * removing someone else's passkey or changing the threshold needs a wallet
 * manager; removing your own passkey is always allowed.
 */
function canPerformManage(
  ctx: SendRequestContext,
  signerSet: VaultSignerSet,
  action: z.infer<typeof manageActionSchema>,
): boolean {
  if (action.type === "addSigner") return true;
  if (action.type === "removeSigner") {
    if (ctx.canManageWallet) return true;
    const target = signerSet.signers.find((signer) => signer.index === action.signerIndex);
    return target?.memberDid === ctx.sessionDid;
  }
  return ctx.canManageWallet;
}

/**
 * Load the pending record and re-verify it against the CURRENT wallet state.
 * Throws `expired` when it can no longer succeed (wallet changed, nonce
 * consumed, fees moved). Returns the pending record together with the
 * derived signer index of every stored approval.
 */
async function loadValidPending(
  ctx: SendRequestContext,
  signerSet: VaultSignerSet,
): Promise<{ pending: PendingSendRecord; approvalIndexes: number[] }> {
  const pending = await fetchPendingSendRecord(ctx.walletDid);
  if (!pending) throw new SendError("expired", 404);
  if (pending.threshold !== signerSet.threshold) throw new SendError("expired", 409);
  const { hash, lightHash } = await validatePreparedSend(ctx.walletDid, ctx.record, signerSet, pending.userOp);
  if (hash !== pending.hash || lightHash !== pending.lightHash) throw new SendError("expired", 409);
  // Stored approvals are re-verified — an approval written to the repo
  // outside this API must never be able to brick or forge the submission.
  const approvalIndexes: number[] = [];
  for (const approval of pending.approvals) {
    const signerIndex = verifyApprovalSignature(signerSet, approval, pending.lightHash);
    if (approvalIndexes.includes(signerIndex)) throw new SendError("approval_invalid", 409);
    approvalIndexes.push(signerIndex);
  }
  return { pending, approvalIndexes };
}

export async function handleSendRequest(ctx: SendRequestContext): Promise<NextResponse> {
  const parsed = sendRequestSchema.safeParse(ctx.body);
  if (!parsed.success) return errorResponse("invalid_request", 400);
  const { record, walletDid, sessionDid } = ctx;

  try {
    // The LIVE signer set is the authority for every step below.
    const deployed = await isVaultDeployed(record.address).catch(() => false);
    const signerSet = await getVaultSignerSet(record, deployed);

    const myCredentialIds = signerSet.signers
      .filter((signer) => signer.memberDid === sessionDid && signer.credentialId)
      .map((signer) => signer.credentialId as string);
    const allCredentialIds = signerSet.signers
      .filter((signer) => signer.credentialId)
      .map((signer) => signer.credentialId as string);

    switch (parsed.data.step) {
      // ── prepare ─────────────────────────────────────────────────────────
      case "prepare": {
        // Only someone with their own enrolled passkey can start a send.
        if (myCredentialIds.length === 0) return errorResponse("no_signer", 403);
        if (signerSet.threshold > 1 && (await fetchPendingSendRecord(walletDid))) {
          return errorResponse("pending_exists", 409);
        }
        const prepared = await prepareSend(walletDid, record, signerSet, {
          token: parsed.data.token,
          to: parsed.data.to as `0x${string}`,
          amountUnits: parsed.data.amountUnits,
        });
        return NextResponse.json({ ...prepared, credentialIds: myCredentialIds, allCredentialIds });
      }

      // ── submit — all approvals collected in one sitting ─────────────────
      case "submit": {
        const { userOp, signatures } = parsed.data;
        const payloads: WebAuthnSignaturePayload[] = [];
        let includesSessionSigner = false;
        for (const signature of signatures) {
          const signer = signerSet.signers.find((entry) => entry.credentialId === signature.credentialId);
          if (!signer) return errorResponse("no_signer", 403);
          if (signer.memberDid === sessionDid) includesSessionSigner = true;
          payloads.push({ signerIndex: signer.index, ...toApprovalSignature(signature) });
        }
        if (!includesSessionSigner) return errorResponse("no_signer", 403);
        const result = await submitSend(walletDid, record, signerSet, userOp as PreparedUserOp, payloads);
        return NextResponse.json(result);
      }

      // ── start — store the operation + the initiator's approval ──────────
      case "start": {
        if (signerSet.threshold < 2) return errorResponse("invalid_request", 400);
        if (await fetchPendingSendRecord(walletDid)) return errorResponse("pending_exists", 409);

        const raw = parsed.data.userOp as PreparedUserOp;
        const { hash, lightHash } = await validatePreparedSend(walletDid, record, signerSet, raw);
        const signature = toApprovalSignature(parsed.data.signature);
        const signerIndex = verifyApprovalSignature(signerSet, signature, lightHash);
        // The initiator must approve with their OWN passkey.
        const initiator = signerSet.signers.find((signer) => signer.index === signerIndex);
        if (initiator?.memberDid !== sessionDid) return errorResponse("no_signer", 403);

        const params = decodeSendCallData(raw.callData);
        const pending: PendingSendRecord = {
          $type: PENDING_SEND_COLLECTION,
          token: params.token,
          to: params.to,
          amountUnits: params.amountUnits,
          userOp: raw,
          hash,
          lightHash,
          threshold: signerSet.threshold,
          approvals: [toStoredApproval(signature, sessionDid)],
          createdBy: sessionDid,
          createdAt: new Date().toISOString(),
        };
        const write = await writePendingRecord(ctx, "putRecord", pending);
        if (!write.ok) return errorResponse("submit_failed", 502);
        return NextResponse.json({ pendingSend: pending });
      }

      // ── approve — add another light-hash approval ───────────────────────
      case "approve": {
        const { pending, approvalIndexes } = await loadValidPending(ctx, signerSet);
        if (pending.approvals.length >= signerSet.threshold - 1) return errorResponse("invalid_request", 409);

        const signature = toApprovalSignature(parsed.data.signature);
        const signerIndex = verifyApprovalSignature(signerSet, signature, pending.lightHash);
        if (approvalIndexes.includes(signerIndex)) return errorResponse("approval_invalid", 409);

        const updated: PendingSendRecord = {
          ...pending,
          approvals: [...pending.approvals, toStoredApproval(signature, sessionDid)],
        };
        const write = await writePendingRecord(ctx, "putRecord", updated);
        if (!write.ok) return errorResponse("submit_failed", 502);
        return NextResponse.json({ pendingSend: updated });
      }

      // ── finalize — last approval signs the full hash, submit on-chain ───
      case "finalize": {
        let pendingState: { pending: PendingSendRecord; approvalIndexes: number[] };
        try {
          pendingState = await loadValidPending(ctx, signerSet);
        } catch (error) {
          // A pending transfer that can never succeed is cleaned up so a new
          // one can be started right away.
          if (error instanceof SendError && error.code === "expired" && error.status === 409) {
            await writePendingRecord(ctx, "deleteRecord").catch(() => undefined);
          }
          throw error;
        }
        const { pending, approvalIndexes } = pendingState;
        if (pending.approvals.length !== signerSet.threshold - 1) return errorResponse("invalid_request", 409);

        const finalSignature = toApprovalSignature(parsed.data.signature);
        const finalIndex = verifyApprovalSignature(signerSet, finalSignature, pending.hash);
        if (approvalIndexes.includes(finalIndex)) return errorResponse("approval_invalid", 409);

        const payloads: WebAuthnSignaturePayload[] = [
          ...pending.approvals.map((approval, position) => ({
            signerIndex: approvalIndexes[position],
            ...toApprovalSignature(approval),
          })),
          { signerIndex: finalIndex, ...finalSignature },
        ];
        const result = await submitSend(walletDid, record, signerSet, pending.userOp, payloads);
        await writePendingRecord(ctx, "deleteRecord").catch(() => undefined);
        return NextResponse.json(result);
      }

      // ── cancel ──────────────────────────────────────────────────────────
      case "cancel": {
        const pending = await fetchPendingSendRecord(walletDid);
        if (!pending) return NextResponse.json({ cancelled: true });
        if (!ctx.canManagePending && pending.createdBy !== sessionDid) {
          return errorResponse("cancel_forbidden", 403);
        }
        const write = await writePendingRecord(ctx, "deleteRecord");
        if (!write.ok) return errorResponse("submit_failed", 502);
        return NextResponse.json({ cancelled: true });
      }

      // ── prepareManage — build an on-chain signer-set change ─────────────
      case "prepareManage": {
        // On-chain management is for wallets whose record can no longer be
        // edited (deployed, or undeployed-but-funded). Pristine wallets edit
        // the record for free instead.
        if (!deployed && !(await vaultHoldsFunds(record.address).catch(() => false))) {
          return errorResponse("invalid_request", 400);
        }
        if (!canPerformManage(ctx, signerSet, parsed.data.action)) return errorResponse("manage_forbidden", 403);
        const prepared = await prepareManage(walletDid, record, signerSet, toManageAction(parsed.data.action));
        return NextResponse.json({ ...prepared, credentialIds: myCredentialIds, allCredentialIds });
      }

      // ── submitManage — execute the approved change ──────────────────────
      case "submitManage": {
        if (!canPerformManage(ctx, signerSet, parsed.data.action)) return errorResponse("manage_forbidden", 403);
        const payloads: WebAuthnSignaturePayload[] = [];
        for (const signature of parsed.data.signatures) {
          const signer = signerSet.signers.find((entry) => entry.credentialId === signature.credentialId);
          if (!signer) return errorResponse("approval_invalid", 403);
          payloads.push({ signerIndex: signer.index, ...toApprovalSignature(signature) });
        }
        const result = await submitManage(
          walletDid,
          record,
          signerSet,
          parsed.data.userOp as PreparedUserOp,
          payloads,
          toManageAction(parsed.data.action),
        );
        // Remember the new passkey's metadata so it shows labeled in the UI.
        let recordUpdated = true;
        if (parsed.data.action.type === "addSigner") {
          recordUpdated = await appendAddedSigner(ctx, parsed.data.action.passkey);
        }
        return NextResponse.json({ ...result, recordUpdated });
      }
    }
    return errorResponse("invalid_request", 400);
  } catch (error) {
    if (error instanceof SendError) return errorResponse(error.code, error.status);
    return errorResponse("submit_failed", 502);
  }
}
