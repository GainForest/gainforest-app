/**
 * Shared request handling for the wallet send API — used by both the
 * personal (/api/wallet/send) and organization (/api/org-wallet/send)
 * routes. The caller resolves the wallet record + session first; this module
 * only enforces the signer policy and drives prepare/submit.
 *
 * Responses carry a stable `code` so the client can show translated,
 * plain-language errors; `error` is an English fallback for API consumers.
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import type { SplitsVaultRecord } from "./shared";
import {
  prepareSend,
  submitSend,
  SendError,
  type PreparedUserOp,
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

export const sendRequestSchema = z.discriminatedUnion("step", [prepareSchema, submitSchema]);

const ERROR_FALLBACKS: Record<string, string> = {
  not_configured: "Sending is not enabled on this server",
  invalid_request: "Invalid send request",
  insufficient_balance: "The wallet does not hold enough of this token",
  network_busy: "The network is too busy right now — please try again later",
  signature_rejected: "The passkey approval could not be verified",
  submit_failed: "The transfer could not be confirmed on the blockchain",
  no_signer: "Only an enrolled passkey holder can send from this wallet",
};

function errorResponse(code: string, status: number): NextResponse {
  return NextResponse.json({ error: ERROR_FALLBACKS[code] || "Send failed", code }, { status });
}

export async function handleSendRequest(params: {
  body: unknown;
  /** DID whose repo holds the wallet record (CREATE2 salt input). */
  walletDid: string;
  /** The signed-in user. */
  sessionDid: string;
  record: SplitsVaultRecord;
}): Promise<NextResponse> {
  const parsed = sendRequestSchema.safeParse(params.body);
  if (!parsed.success) return errorResponse("invalid_request", 400);
  const { record, walletDid, sessionDid } = params;

  try {
    if (parsed.data.step === "prepare") {
      // Only someone with their own enrolled passkey can start a send.
      const myCredentialIds = record.signers
        .filter((signer) => signer.memberDid === sessionDid)
        .map((signer) => signer.credentialId);
      if (myCredentialIds.length === 0) return errorResponse("no_signer", 403);

      const prepared = await prepareSend(walletDid, record, {
        token: parsed.data.token,
        to: parsed.data.to as `0x${string}`,
        amountUnits: parsed.data.amountUnits,
      });
      return NextResponse.json({
        ...prepared,
        credentialIds: myCredentialIds,
        // With a multi-approval threshold, co-signers physically present may
        // approve with any enrolled passkey — possession IS the authority.
        allCredentialIds: record.signers.map((signer) => signer.credentialId),
      });
    }

    // Submit: every signing credential must be an enrolled signer, each
    // signer may approve only once, and at least one approval must come from
    // the signed-in user's own passkey. Signer indexes are derived
    // server-side from the credential ids.
    const { userOp, signatures } = parsed.data;
    const payloads = [];
    let includesSessionSigner = false;
    for (const signature of signatures) {
      const signerIndex = record.signers.findIndex((signer) => signer.credentialId === signature.credentialId);
      if (signerIndex < 0) return errorResponse("no_signer", 403);
      if (record.signers[signerIndex].memberDid === sessionDid) includesSessionSigner = true;
      payloads.push({
        signerIndex,
        authenticatorData: signature.authenticatorData as `0x${string}`,
        clientDataJSON: signature.clientDataJSON,
        challengeIndex: signature.challengeIndex,
        typeIndex: signature.typeIndex,
        r: signature.r,
        s: signature.s,
      });
    }
    if (!includesSessionSigner) return errorResponse("no_signer", 403);

    const result = await submitSend(walletDid, record, userOp as PreparedUserOp, payloads);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SendError) return errorResponse(error.code, error.status);
    return errorResponse("submit_failed", 502);
  }
}
