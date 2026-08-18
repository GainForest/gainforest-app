import { describe, expect, it, vi } from "vitest";
import type { FundingReceipt } from "@/app/_lib/dashboard";

vi.mock("server-only", () => ({}));

const fetchFundingReceiptsByDonorDid = vi.fn();
const fetchRecentOwnedFundingReceipts = vi.fn();
const fetchOwnAnonymousReceipts = vi.fn();
const fetchRecordByUri = vi.fn();
const fetchAccountCards = vi.fn();
const fetchDidsByEvmAddresses = vi.fn();
const getTipWalletAddress = vi.fn();

vi.mock("@/app/_lib/dashboard", () => ({
  fetchFundingReceiptsByDonorDid: (...args: unknown[]) => fetchFundingReceiptsByDonorDid(...args),
}));
vi.mock("@/app/_lib/anonymous-donations", () => ({
  fetchOwnAnonymousReceipts: (...args: unknown[]) => fetchOwnAnonymousReceipts(...args),
}));
vi.mock("@/app/_lib/recent-funding-receipts", () => ({
  fetchRecentOwnedFundingReceipts: (...args: unknown[]) => fetchRecentOwnedFundingReceipts(...args),
  MAX_RECENT_RECEIPTS: 20,
}));
vi.mock("@/app/_lib/indexer", () => ({
  fetchRecordByUri: (...args: unknown[]) => fetchRecordByUri(...args),
  fetchAccountCards: (...args: unknown[]) => fetchAccountCards(...args),
  fetchDidsByEvmAddresses: (...args: unknown[]) => fetchDidsByEvmAddresses(...args),
}));
vi.mock("@/lib/facilitator/tip", () => ({
  getTipWalletAddress: (...args: unknown[]) => getTipWalletAddress(...args),
  TIP_ENS_NAME: "gainforest.eth",
}));
vi.mock("@/app/_lib/pds", () => ({
  resolveBlobUrl: vi.fn(async () => null),
}));

const { fetchEarnedCards } = await import("./receipt-cards");

const OWNER = "did:plc:alice";
const FALLBACK = {
  projectTitle: "Unnamed project",
  organizationName: "Unnamed organization",
  recipientName: "A community member",
  personContext: "Direct support",
  accountName: "An account you supported",
};

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
  fetchOwnAnonymousReceipts.mockReset();
  fetchRecordByUri.mockReset();
  fetchAccountCards.mockReset();
  fetchDidsByEvmAddresses.mockReset();
  getTipWalletAddress.mockReset();
  fetchFundingReceiptsByDonorDid.mockResolvedValue(receipts);
  fetchRecentOwnedFundingReceipts.mockResolvedValue({ receipts: [], partial: false });
  fetchOwnAnonymousReceipts.mockResolvedValue([]);
  fetchAccountCards.mockResolvedValue(new Map());
  fetchDidsByEvmAddresses.mockResolvedValue(new Map());
  getTipWalletAddress.mockResolvedValue(null);
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

  it("builds a person card for a direct gift to another account", async () => {
    const payout = receipt(1, {
      bumicertUri: null,
      orgDid: null,
      to: { type: "did", id: "did:plc:winner" },
      message: "Bioblitz Winner",
      amount: 49,
    });
    stubReceipts([payout]);
    fetchRecordByUri.mockResolvedValue(null);
    fetchAccountCards.mockResolvedValue(
      new Map([[
        "did:plc:winner",
        { did: "did:plc:winner", displayName: "Amara Okafor", avatarRef: null, handle: "amara.example", isOrganization: false },
      ]]),
    );

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.partial).toBe(false);
    expect(result.cards).toHaveLength(1);
    const card = result.cards[0]!;
    expect(card.variant).toBe("person");
    expect(card.personHref).toBe("/account/did%3Aplc%3Awinner");
    expect(card.projectHref).toBeNull();
    expect(card.lines[0]?.title).toBe("Amara Okafor");
    expect(card.lines[0]?.orgName).toBe("Bioblitz Winner");
    expect(fetchRecordByUri).not.toHaveBeenCalled();
  });

  it("falls back to neutral person labels when the profile lookup fails", async () => {
    const payout = receipt(1, {
      bumicertUri: null,
      orgDid: null,
      to: { type: "did", id: "did:plc:winner" },
      message: null,
    });
    stubReceipts([payout]);
    fetchAccountCards.mockRejectedValue(new Error("indexer down"));

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.partial).toBe(true);
    expect(result.cards[0]?.variant).toBe("person");
    expect(result.cards[0]?.lines[0]?.title).toBe("A community member");
    expect(result.cards[0]?.lines[0]?.orgName).toBe("Direct support");
  });

  it("never turns a self-payment into a card", async () => {
    stubReceipts([
      receipt(2, { bumicertUri: null, orgDid: null, to: { type: "did", id: OWNER } }),
    ]);

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.cards).toHaveLength(0);
  });

  it("surfaces the owner's own anonymous donations as cards", async () => {
    const anon = receipt(3, {
      uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/anon",
      from: { type: "wallet", id: "0xdonorwallet" },
      isAnonymous: true,
    });
    stubReceipts([]);
    fetchOwnAnonymousReceipts.mockResolvedValue([anon]);
    fetchRecordByUri.mockResolvedValue(null);

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.receiptUri).toBe(anon.uri);
    expect(result.cards[0]?.variant).toBe("project");
  });

  it("builds an account-support card when donating to an org, resolving its identity", async () => {
    const support = receipt(1, {
      bumicertUri: null,
      orgDid: null,
      to: { type: "wallet", id: "0xOrgWallet" },
      amount: 30,
    });
    stubReceipts([support]);
    fetchDidsByEvmAddresses.mockResolvedValue(new Map([["0xorgwallet", "did:plc:forestorg"]]));
    fetchAccountCards.mockResolvedValue(
      new Map([[
        "did:plc:forestorg",
        { did: "did:plc:forestorg", displayName: "Forest Org", avatarRef: null, handle: "forest.example", isOrganization: true },
      ]]),
    );

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.cards).toHaveLength(1);
    const card = result.cards[0]!;
    expect(card.variant).toBe("person");
    expect(card.personHref).toBe("/account/did%3Aplc%3Aforestorg");
    expect(card.lines[0]?.title).toBe("Forest Org");
  });

  it("still shows an account-support card when the org wallet can't be resolved", async () => {
    const support = receipt(1, {
      bumicertUri: null,
      orgDid: null,
      to: { type: "wallet", id: "0xunknown" },
    });
    stubReceipts([support]);

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.variant).toBe("person");
    expect(result.cards[0]?.personHref).toBeNull();
    expect(result.cards[0]?.lines[0]?.title).toBe("An account you supported");
  });

  it("excludes tips (payments to the GainForest tip wallet) from the collection", async () => {
    stubReceipts([
      receipt(1, { bumicertUri: null, orgDid: null, to: { type: "wallet", id: "0xTipWallet" } }),
    ]);
    getTipWalletAddress.mockResolvedValue("0xtipwallet");

    const result = await fetchEarnedCards(OWNER, [], FALLBACK);

    expect(result.cards).toHaveLength(0);
  });
});
