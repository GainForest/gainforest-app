import type { FundingReceipt } from "@/app/_lib/dashboard";

const SUPPORTED_CURRENCIES = new Set(["USD", "USDC"]);

/** Which collectible a receipt can earn, or null when it earns none.
 *
 * "project" — a public project donation, strongly linked via `for`.
 * "person"  — a direct gift to another *account* (prize payout, peer
 *             support). Requires a DID recipient so the card can honour a real
 *             identity; wallet-only recipients (e.g. tips) earn nothing.
 */
export function receiptCardVariant(receipt: FundingReceipt): "project" | "person" | null {
  const eligibleBase =
    Number.isFinite(receipt.amount) &&
    receipt.amount > 0 &&
    SUPPORTED_CURRENCIES.has(receipt.currency.toUpperCase()) &&
    receipt.from?.type === "did";
  if (!eligibleBase) return null;
  if (typeof receipt.bumicertUri === "string" && receipt.bumicertUri.length > 0) return "project";
  if (receipt.to?.type === "did" && receipt.to.id !== receipt.from!.id) return "person";
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
    (receipt.to?.type === "did" ? `person:${receipt.to.id}` : "unknown-subject");
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
