import { describe, expect, it } from "vitest";
import type { FundingReceipt } from "@/app/_lib/dashboard";
import { buildDonationHistoryResult } from "./history-model";

const donorDid = "did:plc:donor";

function receipt(overrides: Partial<FundingReceipt> = {}): FundingReceipt {
  return {
    uri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/a",
    amount: 20,
    currency: "USDC",
    occurredAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    from: { type: "did", id: donorDid },
    orgDid: "did:plc:forest",
    bumicertUri: null,
    txHash: null,
    paymentNetwork: null,
    ...overrides,
  };
}

describe("buildDonationHistoryResult", () => {
  it("keeps a financial load failure distinct from true empty", () => {
    expect(buildDonationHistoryResult(null, donorDid)).toEqual({ status: "unavailable", receipts: [] });
    expect(buildDonationHistoryResult([], donorDid)).toEqual({ status: "ready", receipts: [] });
  });

  it("does not present an incomplete owner history when private receipts fail", () => {
    expect(buildDonationHistoryResult([], donorDid, [], false)).toEqual({ status: "unavailable", receipts: [] });
  });

  it("merges owner-only anonymous receipts and orders newest first", () => {
    const anonymous = receipt({ uri: "anonymous", occurredAt: "2026-02-01T00:00:00.000Z", isAnonymous: true });
    const result = buildDonationHistoryResult([receipt(), receipt({ uri: "other", from: { type: "did", id: "did:plc:other" } })], donorDid, [anonymous]);
    expect(result.status).toBe("ready");
    expect(result.receipts.map((item) => item.uri)).toEqual(["anonymous", receipt().uri]);
  });
});
