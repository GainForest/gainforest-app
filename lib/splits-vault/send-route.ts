/**
 * Shared request handling for the wallet send API — used by both the
 * personal (/api/wallet/send) and organization (/api/org-wallet/send)
 * routes. The caller resolves the wallet record + session first; this module
 * enforces the signer policy and drives the steps:
 *
 *   prepare  → build the unsigned operation + hashes to sign
 *   submit   → all approvals collected in one sitting (threshold usually 1)
 *   start    → threshold > 1: store the operation + the initiator's
 *              light-hash approval as ONE pending record in the wallet repo
 *   approve  → add another light-hash approval to the pending record
 *              (remote: any owner/member device, any enrolled passkey)
 *   finalize → the last approver signs the FULL userOp hash; the operation
 *              is submitted on-chain and the pending record deleted
 *   cancel   → drop the pending record (initiator or a wallet manager)
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
  type PendingSendApproval,
  type PendingSendRecord,
  type SplitsVaultRecord,
} from "./shared";
import { fetchPendingSendRecord } from "./server";
import {
  decodeSendCallData,
  prepareSend,
  submitSend,
  validatePreparedSend,
  verifyApprovalSignature,
  SendError,
  type ApprovalSignature,
  type PreparedUserOp,
  type WebAuthnSignaturePayload,
} from "./send-server";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
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

export const sendRequestSchema = z.discriminatedUnion("step", [
  prepareSchema,
  submitSchema,
  startSchema,
  approveSchema,
  finalizeSchema,
  cancelSchema,
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
  /** Organization wallet? Determines which mutation proxy stores the pending record. */
  org: boolean;
  /** May the session user cancel any pending transfer (owner/admin)? */
  canManagePending: boolean;
};

/** Write the pending-send record through the session's own mutation proxy. */
async function writePendingRecord(
  ctx: SendRequestContext,
  operation: "putRecord" | "deleteRecord",
  record?: PendingSendRecord,
): Promise<{ ok: boolean; status: number }> {
  const headerList = await headers();
  const cookie = headerList.get("cookie");
  const endpoint = ctx.org ? "/api/cgs/mutation" : "/api/atproto/mutation";
  const upstream = await fetch(`${getAuthBaseUrl()}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
      operation,
      collection: PENDING_SEND_COLLECTION,
      rkey: PENDING_SEND_RKEY,
      ...(ctx.org ? { repo: ctx.walletDid } : {}),
      ...(record ? { record } : {}),
    }),
  });
  return { ok: upstream.ok, status: upstream.status };
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

/**
 * Load the pending record and re-verify it against the CURRENT wallet record
 * and chain state. Throws `expired` when it can no longer succeed (wallet
 * changed, nonce consumed, fees moved). Returns the pending record together
 * with the derived signer index of every stored approval.
 */
async function loadValidPending(
  ctx: SendRequestContext,
): Promise<{ pending: PendingSendRecord; approvalIndexes: number[] }> {
  const pending = await fetchPendingSendRecord(ctx.walletDid);
  if (!pending) throw new SendError("expired", 404);
  if (pending.threshold !== ctx.record.threshold) throw new SendError("expired", 409);
  const { hash, lightHash } = await validatePreparedSend(ctx.walletDid, ctx.record, pending.userOp);
  if (hash !== pending.hash || lightHash !== pending.lightHash) throw new SendError("expired", 409);
  // Stored approvals are re-verified — an approval written to the repo
  // outside this API must never be able to brick or forge the submission.
  const approvalIndexes: number[] = [];
  for (const approval of pending.approvals) {
    const signerIndex = verifyApprovalSignature(ctx.record, approval, pending.lightHash);
    if (approvalIndexes.includes(signerIndex)) throw new SendError("approval_invalid", 409);
    approvalIndexes.push(signerIndex);
  }
  return { pending, approvalIndexes };
}

export async function handleSendRequest(ctx: SendRequestContext): Promise<NextResponse> {
  const parsed = sendRequestSchema.safeParse(ctx.body);
  if (!parsed.success) return errorResponse("invalid_request", 400);
  const { record, walletDid, sessionDid } = ctx;

  const myCredentialIds = record.signers
    .filter((signer) => signer.memberDid === sessionDid)
    .map((signer) => signer.credentialId);
  const allCredentialIds = record.signers.map((signer) => signer.credentialId);

  try {
    switch (parsed.data.step) {
      // ── prepare ─────────────────────────────────────────────────────────
      case "prepare": {
        // Only someone with their own enrolled passkey can start a send.
        if (myCredentialIds.length === 0) return errorResponse("no_signer", 403);
        if (record.threshold > 1 && (await fetchPendingSendRecord(walletDid))) {
          return errorResponse("pending_exists", 409);
        }
        const prepared = await prepareSend(walletDid, record, {
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
          const signerIndex = record.signers.findIndex((signer) => signer.credentialId === signature.credentialId);
          if (signerIndex < 0) return errorResponse("no_signer", 403);
          if (record.signers[signerIndex].memberDid === sessionDid) includesSessionSigner = true;
          payloads.push({ signerIndex, ...toApprovalSignature(signature) });
        }
        if (!includesSessionSigner) return errorResponse("no_signer", 403);
        const result = await submitSend(walletDid, record, userOp as PreparedUserOp, payloads);
        return NextResponse.json(result);
      }

      // ── start — store the operation + the initiator's approval ──────────
      case "start": {
        if (record.threshold < 2) return errorResponse("invalid_request", 400);
        if (await fetchPendingSendRecord(walletDid)) return errorResponse("pending_exists", 409);

        const raw = parsed.data.userOp as PreparedUserOp;
        const { hash, lightHash } = await validatePreparedSend(walletDid, record, raw);
        const signature = toApprovalSignature(parsed.data.signature);
        const signerIndex = verifyApprovalSignature(record, signature, lightHash);
        // The initiator must approve with their OWN passkey.
        if (record.signers[signerIndex].memberDid !== sessionDid) return errorResponse("no_signer", 403);

        const params = decodeSendCallData(raw.callData);
        const pending: PendingSendRecord = {
          $type: PENDING_SEND_COLLECTION,
          token: params.token,
          to: params.to,
          amountUnits: params.amountUnits,
          userOp: raw,
          hash,
          lightHash,
          threshold: record.threshold,
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
        const { pending, approvalIndexes } = await loadValidPending(ctx);
        if (pending.approvals.length >= record.threshold - 1) return errorResponse("invalid_request", 409);

        const signature = toApprovalSignature(parsed.data.signature);
        const signerIndex = verifyApprovalSignature(record, signature, pending.lightHash);
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
          pendingState = await loadValidPending(ctx);
        } catch (error) {
          // A pending transfer that can never succeed is cleaned up so a new
          // one can be started right away.
          if (error instanceof SendError && error.code === "expired" && error.status === 409) {
            await writePendingRecord(ctx, "deleteRecord").catch(() => undefined);
          }
          throw error;
        }
        const { pending, approvalIndexes } = pendingState;
        if (pending.approvals.length !== record.threshold - 1) return errorResponse("invalid_request", 409);

        const finalSignature = toApprovalSignature(parsed.data.signature);
        const finalIndex = verifyApprovalSignature(record, finalSignature, pending.hash);
        if (approvalIndexes.includes(finalIndex)) return errorResponse("approval_invalid", 409);

        const payloads: WebAuthnSignaturePayload[] = [
          ...pending.approvals.map((approval, position) => ({
            signerIndex: approvalIndexes[position],
            ...toApprovalSignature(approval),
          })),
          { signerIndex: finalIndex, ...finalSignature },
        ];
        const result = await submitSend(walletDid, record, pending.userOp, payloads);
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
    }
    return errorResponse("invalid_request", 400);
  } catch (error) {
    if (error instanceof SendError) return errorResponse(error.code, error.status);
    return errorResponse("submit_failed", 502);
  }
}
