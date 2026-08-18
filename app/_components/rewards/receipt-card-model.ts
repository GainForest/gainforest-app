import type { FundingReceipt } from "@/app/_lib/dashboard";

const SUPPORTED_CURRENCIES = new Set(["USD", "USDC"]);

/** Which collectible a receipt can earn, or null when it earns none.
 *
 * "project" — a public project donation, strongly linked via `for`.
 * "person"  — a direct gift to another *account* named by DID (prize payout,
 *             peer support), so the card can honour a real identity.
 * "org"     — direct support sent to an account's wallet with no `for` link
 *             (an org or personal account). The recipient identity is resolved
 *             best-effort at render time from the wallet address.
 *
 * A receipt earns a card when its donor is the owner — either recorded as a
 * DID, or matched to the owner via their donor hash on an anonymous receipt
 * (see app/_lib/anonymous-donations.ts). Tips (wallet recipient = the
 * GainForest tip wallet) are filtered out by the caller, which knows that
 * address.
 */
export function receiptCardVariant(receipt: FundingReceipt): "project" | "person" | "org" | null {
  const ownerAttributed = receipt.from?.type === "did" || receipt.isAnonymous === true;
  const eligibleBase =
    Number.isFinite(receipt.amount) &&
    receipt.amount > 0 &&
    SUPPORTED_CURRENCIES.has(receipt.currency.toUpperCase()) &&
    ownerAttributed;
  if (!eligibleBase) return null;
  if (typeof receipt.bumicertUri === "string" && receipt.bumicertUri.length > 0) return "project";
  if (receipt.to?.type === "did" && receipt.to.id !== receipt.from?.id) return "person";
  if (receipt.to?.type === "wallet") return "org";
  return null;
}

export function isCardEligibleReceipt(receipt: FundingReceipt): boolean {
  return receiptCardVariant(receipt) !== null;
}

/** One payment to one subject earns one card, even if an old retry produced duplicate receipt records. */
export function fundingReceiptCardIdentity(receipt: FundingReceipt): string {
  if (!receipt.txHash) return `receipt:${receipt.uri}`;
  const subject =
    receipt.bumicertUri ??
    (receipt.to?.type === "did"
      ? `person:${receipt.to.id}`
      : receipt.to?.type === "wallet"
        ? `org:${receipt.to.id.toLowerCase()}`
        : "unknown-subject");
  return [
    receipt.paymentNetwork?.toLowerCase() ?? "unknown-network",
    receipt.txHash.toLowerCase(),
    subject,
  ].join(":");
}

export function dedupeCardReceipts(receipts: FundingReceipt[]): FundingReceipt[] {
  const byPayment = new Map<string, FundingReceipt>();
  for (const receipt of receipts) {
    if (!isCardEligibleReceipt(receipt)) continue;
    const key = fundingReceiptCardIdentity(receipt);
    const current = byPayment.get(key);
    if (!current || receipt.uri.localeCompare(current.uri) < 0) byPayment.set(key, receipt);
  }

  return Array.from(byPayment.values()).sort((a, b) => {
    const aTime = Date.parse(a.occurredAt ?? a.createdAt ?? "") || 0;
    const bTime = Date.parse(b.occurredAt ?? b.createdAt ?? "") || 0;
    return bTime - aTime || a.uri.localeCompare(b.uri);
  });
}
