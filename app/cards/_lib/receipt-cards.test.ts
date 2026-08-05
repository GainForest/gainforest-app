import { describe, expect, it, vi } from "vitest";
import type { FundingReceipt } from "@/app/_lib/dashboard";

vi.mock("server-only", () => ({}));

const fetchFundingReceiptsByDonorDid = vi.fn();
const fetchRecentOwnedFundingReceipts = vi.fn();
const fetchRecordByUri = vi.fn();

vi.mock("@/app/_lib/dashboard", () => ({
  fetchFundingReceiptsByDonorDid: (...args: unknown[]) => fetchFundingReceiptsByDonorDid(...args),
}));
vi.mock("@/app/_lib/recent-funding-receipts", () => ({
  fetchRecentOwnedFundingReceipts: (...args: unknown[]) => fetchRecentOwnedFundingReceipts(...args),
  MAX_RECENT_RECEIPTS: 20,
}));
vi.mock("@/app/_lib/indexer", () => ({
  fetchRecordByUri: (...args: unknown[]) => fetchRecordByUri(...args),
}));

const { fetchEarnedCards } = await import("./receipt-cards");

const OWNER = "did:plc:alice";
const FALLBACK = { projectTitle: "Unnamed project", organizationName: "Unnamed organization" };

function receipt(index: number, overrides: Partial<FundingReceipt> = {}): FundingReceipt {
  return {
    uri: `at://did:plc:facilitator/org.hypercerts.funding.receipt/${String(index).padStart(2, "0")}`,
    amount: 20,
    currency: "USDC",
    occurredAt: "2025-01-01T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    from: { type: "did", id: OWNER },
    orgDid: "did:plc:forest",
    bumicertUri: `at://did:plc:forest/org.hypercerts.claim.activity/project-${index}`,
    txHash: `0x${"0123456789abcdef"[index % 16]!.repeat(64)}`,
    paymentNetwork: "eip155:1",
    message: null,
    ...overrides,
  };
}

function stubReceipts(receipts: FundingReceipt[]) {
  fetchFundingReceiptsByDonorDid.mockReset();
  fetchRecentOwnedFundingReceipts.mockReset();
  fetchRecordByUri.mockReset();
  fetchFundingReceiptsByDonorDid.mockResolvedValue(receipts);
  fetchRecentOwnedFundingReceipts.mockResolvedValue({ receipts: [], partial: false });
}

describe("fetchEarnedCards", () => {
  it("bounds metadata lookups and keeps cards when one lookup fails", async () => {
    const receipts = Array.from({ length: 10 }, (_, index) => receipt(index + 1));
    stubReceipts(receipts);
    const attempted: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    fetchRecordByUri.mockImplementation(async (uri: string) => {
      attempted.push(uri);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (uri.endsWith("project-9")) throw new Error("not indexed yet");
      return null;
    });

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(attempted).toHaveLength(10);
    expect(result.cards).toHaveLength(10);
    expect(result.partial).toBe(true);
  });

  it("filters to the owner before deduplicating same-payment receipts", async () => {
    const ownerReceipt = receipt(2, {
      uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/z-owner",
      txHash: `0x${"a".repeat(64)}`,
    });
    const foreignReceipt = receipt(1, {
      uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/a-foreign",
      from: { type: "did", id: "did:plc:mallory" },
      txHash: `0x${"a".repeat(64)}`,
      bumicertUri: ownerReceipt.bumicertUri,
    });
    stubReceipts([foreignReceipt, ownerReceipt]);
    fetchRecordByUri.mockResolvedValue(null);

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.receiptUri).toBe(ownerReceipt.uri);
  });
});
