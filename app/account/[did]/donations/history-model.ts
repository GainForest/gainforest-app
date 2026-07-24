import type { FundingReceipt } from "@/app/_lib/dashboard";

export type DonationHistoryResult =
  | { status: "unavailable"; receipts: [] }
  | { status: "ready"; receipts: FundingReceipt[] };

export function buildDonationHistoryResult(
  publicReceipts: FundingReceipt[] | null,
  donorDid: string,
  anonymousReceipts: FundingReceipt[] = [],
  anonymousReceiptsAvailable = true,
): DonationHistoryResult {
  if (publicReceipts === null || !anonymousReceiptsAvailable) {
    return { status: "unavailable", receipts: [] };
  }

  const attributed = publicReceipts.filter(
    (receipt) => receipt.from?.type === "did" && receipt.from.id === donorDid,
  );
  const receipts = [...attributed, ...anonymousReceipts].sort((a, b) => {
    const dateA = Date.parse(a.occurredAt ?? a.createdAt ?? "") || 0;
    const dateB = Date.parse(b.occurredAt ?? b.createdAt ?? "") || 0;
    return dateB - dateA;
  });
  return { status: "ready", receipts };
}
