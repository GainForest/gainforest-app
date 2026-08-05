import type { FundingReceipt } from "@/app/_lib/dashboard";

const SUPPORTED_CURRENCIES = new Set(["USD", "USDC"]);

export function isCardEligibleReceipt(receipt: FundingReceipt): boolean {
  return (
    Number.isFinite(receipt.amount) &&
    receipt.amount > 0 &&
    SUPPORTED_CURRENCIES.has(receipt.currency.toUpperCase()) &&
    typeof receipt.bumicertUri === "string" &&
    receipt.bumicertUri.length > 0 &&
    receipt.from?.type === "did"
  );
}

/** One payment to one project earns one card, even if an old retry produced duplicate receipt records. */
export function fundingReceiptCardIdentity(receipt: FundingReceipt): string {
  if (!receipt.txHash) return `receipt:${receipt.uri}`;
  return [
    receipt.paymentNetwork?.toLowerCase() ?? "unknown-network",
    receipt.txHash.toLowerCase(),
    receipt.bumicertUri ?? "unknown-project",
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
