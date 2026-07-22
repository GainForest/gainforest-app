import { describe, expect, it } from "vitest";
import type { FundingReceipt } from "@/app/_lib/dashboard";
import { dedupeCardReceipts, fundingReceiptCardIdentity, isCardEligibleReceipt } from "./receipt-card-model";

function receipt(overrides: Partial<FundingReceipt> = {}): FundingReceipt {
  return {
    uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/a",
    amount: 50,
    currency: "USDC",
    occurredAt: "2025-01-01T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    from: { type: "did", id: "did:plc:alice" },
    orgDid: "did:plc:forest",
    bumicertUri: "at://did:plc:forest/org.hypercerts.claim.activity/project",
    txHash: `0x${"1".padStart(64, "0")}`,
    paymentNetwork: "eip155:1",
    ...overrides,
  };
}

describe("receipt-backed card identity", () => {
  it("requires a positive project receipt attributed to a profile", () => {
    expect(isCardEligibleReceipt(receipt())).toBe(true);
    expect(isCardEligibleReceipt(receipt({ bumicertUri: null }))).toBe(false);
    expect(isCardEligibleReceipt(receipt({ from: { type: "wallet", id: "0x123" } }))).toBe(false);
    expect(isCardEligibleReceipt(receipt({ amount: 0 }))).toBe(false);
  });

  it("uses payment, network, and project as the stable card identity", () => {
    expect(fundingReceiptCardIdentity(receipt())).toContain("eip155:1");
    expect(fundingReceiptCardIdentity(receipt())).toContain("org.hypercerts.claim.activity/project");
  });

  it("collapses duplicate receipt records for the same project payment", () => {
    const laterDuplicate = receipt({
      uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/z",
      occurredAt: "2025-01-02T00:00:00.000Z",
    });
    const distinctPayment = receipt({
      uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/b",
      txHash: `0x${"2".padStart(64, "0")}`,
      occurredAt: "2025-01-03T00:00:00.000Z",
    });

    const deduped = dedupeCardReceipts([laterDuplicate, receipt(), distinctPayment]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.uri).toBe(distinctPayment.uri);
    expect(deduped[1]?.uri).toBe(receipt().uri);
  });
});
