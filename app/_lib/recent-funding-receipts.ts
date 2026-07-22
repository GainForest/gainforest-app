import "server-only";

import type { FundingReceipt } from "./dashboard";
import { FACILITATOR_DID } from "./urls";

const RECEIPT_COLLECTION = "org.hypercerts.funding.receipt";
const MAX_RECENT_RECEIPTS = 20;

type RawReceiptValue = {
  from?: { $type?: string; did?: string; value?: string };
  amount?: string;
  currency?: string;
  occurredAt?: string;
  createdAt?: string;
  transactionId?: string;
  paymentNetwork?: string;
  for?: { uri?: string };
};

type RawReceiptResponse = {
  uri?: string;
  value?: RawReceiptValue;
  message?: string;
};

function facilitatorHost(): string {
  const configured = process.env.FACILITATOR_SERVICE_HOST?.trim().replace(/\/+$/, "");
  if (!configured) throw new Error("Donation receipt service is not configured");
  return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
}

function receiptRkey(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/);
  if (!match || match[1] !== FACILITATOR_DID || match[2] !== RECEIPT_COLLECTION) return null;
  try {
    return decodeURIComponent(match[3]);
  } catch {
    return null;
  }
}

function orgDidFromSubject(uri: string | undefined): string | null {
  const match = uri?.match(/^at:\/\/(did:[a-z0-9]+:[a-z0-9]+)\/org\.hypercerts\.claim\.activity\/.+$/i);
  return match?.[1] ?? null;
}

function ownedProjectReceipt(
  response: RawReceiptResponse,
  expectedUri: string,
  ownerDid: string,
): FundingReceipt | null {
  const value = response.value;
  if (!value || response.uri !== expectedUri) return null;
  if (value.from?.$type !== "app.certified.defs#did" || value.from.did !== ownerDid) return null;

  const amount = Number.parseFloat(value.amount ?? "");
  const currency = (value.currency ?? "").toUpperCase();
  const subjectUri = value.for?.uri;
  const orgDid = orgDidFromSubject(subjectUri);
  if (!Number.isFinite(amount) || amount <= 0 || !["USD", "USDC"].includes(currency) || !subjectUri || !orgDid) {
    return null;
  }

  return {
    uri: expectedUri,
    amount,
    currency,
    occurredAt: value.occurredAt ?? value.createdAt ?? null,
    createdAt: value.createdAt ?? null,
    from: { type: "did", id: ownerDid },
    orgDid,
    bumicertUri: subjectUri,
    txHash: value.transactionId ?? null,
    paymentNetwork: value.paymentNetwork ?? null,
  };
}

/**
 * Resolve receipts returned by the checkout directly from the facilitator PDS.
 * This closes the short Hyperindex lag without trusting URL input: every URI,
 * owner, amount, currency, and project subject is verified server-side.
 */
export type RecentOwnedFundingReceiptsResult = {
  receipts: FundingReceipt[];
  partial: boolean;
};

export async function fetchRecentOwnedFundingReceipts(
  ownerDid: string,
  receiptUris: string[],
): Promise<RecentOwnedFundingReceiptsResult> {
  const requested = Array.from(new Set(receiptUris)).slice(0, MAX_RECENT_RECEIPTS);
  const valid = requested.flatMap((uri) => {
    const rkey = receiptRkey(uri);
    return rkey ? [{ uri, rkey }] : [];
  });
  if (valid.length === 0) return { receipts: [], partial: false };

  const host = facilitatorHost();
  const records = await Promise.allSettled(
    valid.map(async ({ uri, rkey }) => {
      const url = new URL(`${host}/xrpc/com.atproto.repo.getRecord`);
      url.searchParams.set("repo", FACILITATOR_DID);
      url.searchParams.set("collection", RECEIPT_COLLECTION);
      url.searchParams.set("rkey", rkey);
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const json = (await response.json().catch(() => null)) as RawReceiptResponse | null;
      if (!response.ok || !json) throw new Error(json?.message || "Unable to verify a recent donation receipt");
      return ownedProjectReceipt(json, uri, ownerDid);
    }),
  );

  return {
    receipts: records.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    ),
    partial: records.some((result) => result.status === "rejected"),
  };
}
