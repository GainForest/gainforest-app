import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FACILITATOR_DID } from "./urls";
import { fetchRecentOwnedFundingReceipts } from "./recent-funding-receipts";

const RECEIPT_URI = `at://${FACILITATOR_DID}/org.hypercerts.funding.receipt/${"b".repeat(64)}`;

describe("recent funding receipt verification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts only a positive project receipt owned by the signed-in DID", async () => {
    vi.stubEnv("FACILITATOR_SERVICE_HOST", "https://pds.example.test");
    const fetchMock = vi.fn(async () => Response.json({
      uri: RECEIPT_URI,
      value: {
        from: { $type: "app.certified.defs#did", did: "did:plc:alice" },
        amount: "42.5",
        currency: "USDC",
        transactionId: `0x${"b".repeat(64)}`,
        paymentNetwork: "eip155:1",
        occurredAt: "2025-01-01T00:00:00.000Z",
        for: { uri: "at://did:plc:forest/org.hypercerts.claim.activity/project" },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRecentOwnedFundingReceipts("did:plc:alice", [RECEIPT_URI]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.partial).toBe(false);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]).toMatchObject({
      uri: RECEIPT_URI,
      amount: 42.5,
      from: { type: "did", id: "did:plc:alice" },
      bumicertUri: "at://did:plc:forest/org.hypercerts.claim.activity/project",
    });
  });

  it("keeps valid recent receipts when another receipt lookup fails", async () => {
    vi.stubEnv("FACILITATOR_SERVICE_HOST", "https://pds.example.test");
    const secondUri = `at://${FACILITATOR_DID}/org.hypercerts.funding.receipt/${"c".repeat(64)}`;
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls === 2) return Response.json({ message: "not ready" }, { status: 503 });
      return Response.json({
        uri: RECEIPT_URI,
        value: {
          from: { $type: "app.certified.defs#did", did: "did:plc:alice" },
          amount: "42.5",
          currency: "USDC",
          transactionId: `0x${"b".repeat(64)}`,
          for: { uri: "at://did:plc:forest/org.hypercerts.claim.activity/project" },
        },
      });
    }));

    const result = await fetchRecentOwnedFundingReceipts("did:plc:alice", [RECEIPT_URI, secondUri]);
    expect(result.receipts).toHaveLength(1);
    expect(result.partial).toBe(true);
  });

  it("rejects receipts owned by another donor and ignores untrusted URIs", async () => {
    vi.stubEnv("FACILITATOR_SERVICE_HOST", "https://pds.example.test");
    const fetchMock = vi.fn(async () => Response.json({
      uri: RECEIPT_URI,
      value: {
        from: { $type: "app.certified.defs#did", did: "did:plc:mallory" },
        amount: "42.5",
        currency: "USDC",
        for: { uri: "at://did:plc:forest/org.hypercerts.claim.activity/project" },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchRecentOwnedFundingReceipts("did:plc:alice", [RECEIPT_URI])).toEqual({
      receipts: [],
      partial: false,
    });
    expect(await fetchRecentOwnedFundingReceipts("did:plc:alice", [
      "at://did:plc:attacker/org.hypercerts.funding.receipt/fake",
    ])).toEqual({ receipts: [], partial: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
