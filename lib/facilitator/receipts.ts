/**
 * Public funding receipts, written to the facilitator's own repo
 * (org.hypercerts.funding.receipt). Shared by /api/fund, /api/tip, and the
 * batched /api/checkout settlement.
 */

import { createHash, createHmac } from "node:crypto";
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

/**
 * Opaque owner tag for anonymous donations. Receipts are PUBLIC records, so
 * an anonymous donation must never carry the donor's profile. Instead we
 * store an HMAC of the donor DID keyed by a server-only secret and salted
 * with the transaction hash:
 *
 *  - the public cannot reverse it to a profile (secret is server-only), and
 *  - the SAME donor gets a DIFFERENT hash on every receipt (tx salt), so
 *    their anonymous donations cannot even be correlated with each other.
 *
 * The donor's own donations page recomputes the HMAC server-side from their
 * session DID and matches — only they ever see the link. Returns null when
 * the secret is unset (feature off).
 */
export function computeDonorHash(donorDid: string, transactionId: string): string | null {
  const secret = process.env.RECEIPT_DONOR_HASH_SECRET?.trim();
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${donorDid}\n${transactionId}`).digest("hex");
}

function getFacilitatorServiceHost(): string {
  const configuredHost = process.env.FACILITATOR_SERVICE_HOST?.trim().replace(/\/+$/, "");
  if (!configuredHost) throw new Error("FACILITATOR_SERVICE_HOST env var is not set");
  return /^https?:\/\//i.test(configuredHost) ? configuredHost : `https://${configuredHost}`;
}

async function createFacilitatorSession(): Promise<string> {
  const serviceHost = getFacilitatorServiceHost();
  const identifier = FACILITATOR_DID;
  const password = process.env.FACILITATOR_PASSWORD;
  if (!password) throw new Error("FACILITATOR_PASSWORD env var is not set");

  const response = await fetch(`${serviceHost}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => null)) as { accessJwt?: string; message?: string } | null;
  if (!response.ok || !json?.accessJwt) throw new Error(json?.message || "Unable to prepare donation service");
  return json.accessJwt;
}

const RECEIPT_COLLECTION = "org.hypercerts.funding.receipt";
const RECEIPT_RETRY_DELAYS_MS = [0, 200, 600] as const;

const TID_FIRST_ALPHABET = "234567abcdefghij";
const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";

/** A deterministic, lexicon-valid TID-shaped key derived from the payment. */
export function receiptRkeyForTransaction(transactionHash: string): string {
  const digest = createHash("sha256").update(transactionHash.toLowerCase()).digest();
  let rkey = TID_FIRST_ALPHABET[digest[0] & 0x0f];
  for (let index = 1; index < 13; index += 1) {
    rkey += TID_ALPHABET[digest[index] & 0x1f];
  }
  return rkey;
}

async function putReceiptRecordOnce(
  record: Record<string, unknown>,
  transactionHash: string,
): Promise<string> {
  const serviceHost = getFacilitatorServiceHost();
  const repo = FACILITATOR_DID;
  const rkey = receiptRkeyForTransaction(transactionHash);
  const token = await createFacilitatorSession();
  const response = await fetch(`${serviceHost}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ repo, collection: RECEIPT_COLLECTION, rkey, record }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => null)) as { uri?: string; message?: string } | null;
  const expectedUri = `at://${repo}/${RECEIPT_COLLECTION}/${rkey}`;
  if (!response.ok || json?.uri !== expectedUri) {
    throw new Error(json?.message || "Unable to prepare public donation note");
  }
  return expectedUri;
}

/** Idempotent across retries: a transaction always writes the same AT record. */
async function putReceiptRecord(
  record: Record<string, unknown>,
  transactionHash: string,
): Promise<string> {
  let lastError: unknown;
  for (const delay of RECEIPT_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await putReceiptRecordOnce(record, transactionHash);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to prepare public donation note");
}

export async function writeFundingReceipt(params: {
  from: ReceiptSender;
  to: ReceiptText;
  amount: string;
  currency: "USDC";
  transactionHash: string;
  receiptSubject?: { uri: string; cid: string };
  /** Owner-only tag for anonymous donations — see computeDonorHash. */
  donorHash?: string | null;
}): Promise<string | null> {
  const now = new Date().toISOString();
  return putReceiptRecord({
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
    occurredAt: now,
    // Required by the org.hypercerts.funding.receipt lexicon. Receipts
    // without it sort last on every createdAt-ordered feed (indexer
    // dashboards, admin stats), making new donations look missing.
    createdAt: now,
    ...(params.donorHash ? { donorHash: params.donorHash } : {}),
  }, params.transactionHash);
}

export async function writeTipReceipt(params: {
  from: ReceiptSender;
  toWallet: string;
  amount: string;
  transactionHash: string;
  ensName: string;
  /** Owner-only tag for anonymous donations — see computeDonorHash. */
  donorHash?: string | null;
}): Promise<string | null> {
  const fromLabel = params.from.$type === "app.certified.defs#did" ? params.from.did : params.from.value;
  const now = new Date().toISOString();
  return putReceiptRecord({
    $type: "org.hypercerts.funding.receipt",
    from: params.from,
    to: { $type: "org.hypercerts.funding.receipt#text", value: params.toWallet },
    amount: params.amount,
    currency: "USDC",
    paymentRail: PAYMENT_RAIL,
    paymentNetwork: PAYMENT_NETWORK,
    transactionId: params.transactionHash,
    notes: `${fromLabel} tipped ${params.amount}USDC to GainForest (${params.ensName})`,
    occurredAt: now,
    // Required by the org.hypercerts.funding.receipt lexicon (see above).
    createdAt: now,
    ...(params.donorHash ? { donorHash: params.donorHash } : {}),
  }, params.transactionHash);
}
