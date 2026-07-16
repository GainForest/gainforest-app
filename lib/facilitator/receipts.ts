/**
 * Public funding receipts, written to the facilitator's own repo
 * (org.hypercerts.funding.receipt). Shared by /api/fund, /api/tip, and the
 * batched /api/checkout settlement.
 */

import { FACILITATOR_DID } from "@/app/_lib/urls";
import { PAYMENT_NETWORK, PAYMENT_RAIL } from "./usdc";

export type DidIdentifier = `did:${string}:${string}`;

export type ReceiptSender =
  | { $type: "org.hypercerts.funding.receipt#text"; value: string }
  | { $type: "app.certified.defs#did"; did: DidIdentifier };

export type ReceiptText = { $type: "org.hypercerts.funding.receipt#text"; value: string };

export function isDidIdentifier(value: string): value is DidIdentifier {
  return /^did:[a-z0-9]+:.+$/i.test(value);
}

function getFacilitatorServiceHost(): string {
  const configuredHost = process.env.FACILITATOR_SERVICE_HOST?.trim().replace(/\/+$/, "");
  if (!configuredHost) throw new Error("FACILITATOR_SERVICE_HOST env var is not set");
  return /^https?:\/\//i.test(configuredHost) ? configuredHost : `https://${configuredHost}`;
}

async function createFacilitatorSession(): Promise<string> {
  const serviceHost = getFacilitatorServiceHost();
  const identifier = process.env.NEXT_PUBLIC_FACILITATOR_DID || FACILITATOR_DID;
  const password = process.env.FACILITATOR_PASSWORD;
  if (!password) throw new Error("FACILITATOR_PASSWORD env var is not set");

  const response = await fetch(`${serviceHost}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const json = (await response.json().catch(() => null)) as { accessJwt?: string; message?: string } | null;
  if (!response.ok || !json?.accessJwt) throw new Error(json?.message || "Unable to prepare donation service");
  return json.accessJwt;
}

async function createReceiptRecord(record: Record<string, unknown>): Promise<string | null> {
  const serviceHost = getFacilitatorServiceHost();
  const token = await createFacilitatorSession();
  const response = await fetch(`${serviceHost}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      repo: process.env.NEXT_PUBLIC_FACILITATOR_DID || FACILITATOR_DID,
      collection: "org.hypercerts.funding.receipt",
      record,
    }),
  });
  const json = (await response.json().catch(() => null)) as { uri?: string; message?: string } | null;
  if (!response.ok) throw new Error(json?.message || "Unable to prepare public donation note");
  return json?.uri ?? null;
}

export async function writeFundingReceipt(params: {
  from: ReceiptSender;
  to: ReceiptText;
  amount: string;
  currency: "USDC";
  transactionHash: string;
  receiptSubject?: { uri: string; cid: string };
}): Promise<string | null> {
  return createReceiptRecord({
    $type: "org.hypercerts.funding.receipt",
    from: params.from,
    to: params.to,
    amount: params.amount,
    currency: params.currency,
    paymentRail: PAYMENT_RAIL,
    paymentNetwork: PAYMENT_NETWORK,
    transactionId: params.transactionHash,
    for: params.receiptSubject,
    notes: `${params.from.$type === "app.certified.defs#did" ? params.from.did : params.from.value} paid ${params.amount}${params.currency} using wallet`,
    occurredAt: new Date().toISOString(),
  });
}

export async function writeTipReceipt(params: {
  from: ReceiptSender;
  toWallet: string;
  amount: string;
  transactionHash: string;
  ensName: string;
}): Promise<string | null> {
  const fromLabel = params.from.$type === "app.certified.defs#did" ? params.from.did : params.from.value;
  return createReceiptRecord({
    $type: "org.hypercerts.funding.receipt",
    from: params.from,
    to: { $type: "org.hypercerts.funding.receipt#text", value: params.toWallet },
    amount: params.amount,
    currency: "USDC",
    paymentRail: PAYMENT_RAIL,
    paymentNetwork: PAYMENT_NETWORK,
    transactionId: params.transactionHash,
    notes: `${fromLabel} tipped ${params.amount}USDC to GainForest (${params.ensName})`,
    occurredAt: new Date().toISOString(),
  });
}
