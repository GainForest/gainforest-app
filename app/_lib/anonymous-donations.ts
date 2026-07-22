import "server-only";
import { createHmac } from "node:crypto";
import { cachedAsync } from "./async-cache";
import type { FundingReceipt } from "./dashboard";
import { FACILITATOR_DID } from "./urls";

/**
 * Owner-only view of anonymous donations.
 *
 * Anonymous funding receipts are public records that carry no donor profile —
 * only an opaque `donorHash` (HMAC of the donor DID keyed by a server-only
 * secret and salted with the transaction hash; see lib/facilitator/receipts).
 * This module re-derives those hashes from the signed-in owner's DID and
 * matches them against the facilitator repo, so a donor can see their own
 * anonymous donations on their profile page while the public link stays
 * unrecoverable. Everything here must stay server-side: the secret and the
 * DID→receipt matching never reach the client.
 */

/** Short TTL: a donor who just checked out expects the receipt to show up. */
const RAW_RECEIPTS_CACHE_MS = 60 * 1000;
const MAX_PAGES = 25;

type RawReceiptRecord = {
  uri: string;
  value: {
    amount?: string;
    currency?: string;
    occurredAt?: string;
    createdAt?: string;
    transactionId?: string;
    paymentNetwork?: string;
    donorHash?: string;
    from?: { $type?: string; value?: string };
    for?: { uri?: string };
  };
};

function getFacilitatorPdsHost(): string | null {
  const configured = process.env.FACILITATOR_SERVICE_HOST?.trim().replace(/\/+$/, "");
  if (!configured) return null;
  return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
}

/** All raw funding receipts from the facilitator repo (public data, cached). */
async function fetchRawReceipts(): Promise<RawReceiptRecord[]> {
  return cachedAsync("facilitator-raw-receipts", RAW_RECEIPTS_CACHE_MS, async () => {
    const host = getFacilitatorPdsHost();
    if (!host) return [];
    const repo = FACILITATOR_DID;
    const all: RawReceiptRecord[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${host}/xrpc/com.atproto.repo.listRecords`);
      url.searchParams.set("repo", repo);
      url.searchParams.set("collection", "org.hypercerts.funding.receipt");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) break;
      const json = (await response.json().catch(() => null)) as {
        records?: RawReceiptRecord[];
        cursor?: string;
      } | null;
      if (!json?.records) break;
      all.push(...json.records);
      cursor = json.cursor ?? null;
      if (!cursor || json.records.length === 0) break;
    }
    return all;
  });
}

/** Must mirror computeDonorHash in lib/facilitator/receipts.ts. */
function expectedDonorHash(did: string, transactionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${did}\n${transactionId}`).digest("hex");
}

function orgDidFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  const match = uri.match(/^at:\/\/(did:[a-z0-9]+:[a-z0-9]+)\//i);
  return match ? match[1] : null;
}

function mapRawReceipt(record: RawReceiptRecord): FundingReceipt {
  const value = record.value;
  const amount = Number.parseFloat(value.amount ?? "0");
  const bumicertUri = value.for?.uri ?? null;
  return {
    uri: record.uri,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: (value.currency ?? "USD").toUpperCase(),
    occurredAt: value.occurredAt ?? value.createdAt ?? null,
    createdAt: value.createdAt ?? null,
    from: value.from?.value ? { type: "wallet", id: value.from.value } : null,
    orgDid: orgDidFromUri(bumicertUri ?? undefined),
    bumicertUri,
    txHash: value.transactionId ?? null,
    paymentNetwork: value.paymentNetwork ?? null,
    isAnonymous: true,
  };
}

/**
 * The signed-in owner's anonymous donations. Server-only; returns [] when the
 * hashing secret is unset (feature off) or the facilitator PDS is unreachable.
 */
export async function fetchOwnAnonymousReceipts(ownerDid: string): Promise<FundingReceipt[]> {
  const secret = process.env.RECEIPT_DONOR_HASH_SECRET?.trim();
  if (!secret) return [];
  const raw = await fetchRawReceipts().catch(() => []);
  return raw
    .filter((record) => {
      const hash = record.value.donorHash;
      const txId = record.value.transactionId;
      if (!hash || !txId) return false;
      return hash === expectedDonorHash(ownerDid, txId, secret);
    })
    .map(mapRawReceipt);
}
