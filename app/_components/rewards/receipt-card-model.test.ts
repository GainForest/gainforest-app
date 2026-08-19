import { describe, expect, it } from "vitest";
import type { FundingReceipt } from "@/app/_lib/dashboard";
import {
  dedupeCardReceipts,
  fundingReceiptCardIdentity,
  isCardEligibleReceipt,
  receiptCardVariant,
} from "./receipt-card-model";

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
    txHash: `0x${"1".repeat(64)}`,
    paymentNetwork: "eip155:1",
    message: null,
    ...overrides,
  };
}

describe("receipt-backed card identity", () => {
  it("requires a positive project receipt attributed to a profile", () => {
    expect(isCardEligibleReceipt(receipt())).toBe(true);
    expect(isCardEligibleReceipt(receipt({ bumicertUri: null }))).toBe(false);
    expect(isCardEligibleReceipt(receipt({ from: { type: "wallet", id: "0x123" } }))).toBe(false);
    expect(isCardEligibleReceipt(receipt({ amount: 0 }))).toBe(false);
    expect(isCardEligibleReceipt(receipt({ currency: "EUR" }))).toBe(false);
    expect(isCardEligibleReceipt(receipt({ currency: "usdc" }))).toBe(true);
  });

  it("uses payment, network, and project as the stable card identity", () => {
    expect(fundingReceiptCardIdentity(receipt())).toContain("eip155:1");
    expect(fundingReceiptCardIdentity(receipt())).toContain("org.hypercerts.claim.activity/project");
  });

  it("earns a person card for a direct gift to another account", () => {
    const payout = receipt({ bumicertUri: null, to: { type: "did", id: "did:plc:winner" } });
    expect(receiptCardVariant(payout)).toBe("person");
    expect(isCardEligibleReceipt(payout)).toBe(true);
    expect(fundingReceiptCardIdentity(payout)).toContain("person:did:plc:winner");
  });

  it("prefers the project variant when a receipt names both a project and a recipient", () => {
    expect(receiptCardVariant(receipt({ to: { type: "did", id: "did:plc:winner" } }))).toBe("project");
  });

  it("earns an account-support (org) card for a wallet recipient with no project link", () => {
    const support = receipt({ bumicertUri: null, to: { type: "wallet", id: "0x9F6d" } });
    expect(receiptCardVariant(support)).toBe("org");
    // Identity is keyed by the lowercased recipient wallet so casing never
    // splits one payment into two cards.
    expect(fundingReceiptCardIdentity(support)).toContain("org:0x9f6d");
  });

  it("earns a card for the owner's own anonymous donation (wallet donor + hash match)", () => {
    const anon = receipt({ from: { type: "wallet", id: "0xdonor" }, isAnonymous: true });
    expect(receiptCardVariant(anon)).toBe("project");
    expect(isCardEligibleReceipt(anon)).toBe(true);
  });

  it("refuses cards for self-payments, unattributed donors, and bad amounts", () => {
    const base = { bumicertUri: null } as const;
    expect(receiptCardVariant(receipt({ ...base, to: null }))).toBeNull();
    // A gift to yourself is not a collectible.
    expect(receiptCardVariant(receipt({ ...base, to: { type: "did", id: "did:plc:alice" } }))).toBeNull();
    // A wallet donor with no anonymity match is not the owner, so no card.
    expect(
      receiptCardVariant(receipt({ ...base, to: { type: "wallet", id: "0x1" }, from: { type: "wallet", id: "0x2" } })),
    ).toBeNull();
    expect(receiptCardVariant(receipt({ ...base, to: { type: "did", id: "did:plc:winner" }, amount: 0 }))).toBeNull();
    expect(receiptCardVariant(receipt({ ...base, to: { type: "did", id: "did:plc:winner" }, currency: "EUR" }))).toBeNull();
  });

  it("keeps two gifts to different people on the same payment apart", () => {
    const toA = receipt({ uri: "at://f/r/a", bumicertUri: null, to: { type: "did", id: "did:plc:a" } });
    const toB = receipt({ uri: "at://f/r/b", bumicertUri: null, to: { type: "did", id: "did:plc:b" } });
    expect(dedupeCardReceipts([toA, toB])).toHaveLength(2);
  });

  it("collapses duplicate receipt records for the same project payment", () => {
    const laterDuplicate = receipt({
      uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/z",
      occurredAt: "2025-01-02T00:00:00.000Z",
    });
    const distinctPayment = receipt({
      uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/b",
      txHash: `0x${"2".repeat(64)}`,
      occurredAt: "2025-01-03T00:00:00.000Z",
    });

    const deduped = dedupeCardReceipts([laterDuplicate, receipt(), distinctPayment]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.uri).toBe(distinctPayment.uri);
    expect(deduped[1]?.uri).toBe(receipt().uri);
  });
});
