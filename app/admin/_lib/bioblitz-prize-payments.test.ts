import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeBioblitzPrizePaymentStatus, type PrizeReceipt } from "./bioblitz-prize-payments";

const WALLET = "0x2e829A7A7407De7E7185A836EB4D75603852fc5e";

function receipt(overrides: Partial<PrizeReceipt>): PrizeReceipt {
  return { toWallet: WALLET, notes: null, txHash: null, createdAt: null, ...overrides };
}

describe("computeBioblitzPrizePaymentStatus", () => {
  it("marks a prize paid when a matching receipt exists", () => {
    const receipts = [
      receipt({
        notes: "BioBlitz Round 7 — Most Observations winner prize",
        txHash: "0xabc",
        createdAt: "2026-08-19T14:51:40.620Z",
      }),
    ];
    const status = computeBioblitzPrizePaymentStatus(7, ["most-observations"], WALLET, receipts);
    expect(status).toEqual([
      { prize: "most-observations", paid: true, txHash: "0xabc", paidAt: "2026-08-19T14:51:40.620Z" },
    ]);
  });

  it("matches the recipient wallet case-insensitively", () => {
    const receipts = [receipt({ toWallet: WALLET.toLowerCase(), notes: "BioBlitz Round 7 — Most Observations winner prize" })];
    // Caller passes a checksummed address; receipt stored lowercase — must still match.
    const status = computeBioblitzPrizePaymentStatus(7, ["most-observations"], WALLET, receipts);
    expect(status[0]!.paid).toBe(true);
  });

  it("does not mark paid when the receipt is for another wallet", () => {
    const receipts = [
      receipt({ toWallet: "0x0000000000000000000000000000000000000001", notes: "BioBlitz Round 7 — Most Observations winner prize" }),
    ];
    const status = computeBioblitzPrizePaymentStatus(7, ["most-observations"], WALLET, receipts);
    expect(status[0]!.paid).toBe(false);
  });

  it("does not mark paid when the round differs", () => {
    const receipts = [receipt({ notes: "BioBlitz Round 6 — Most Observations winner prize" })];
    const status = computeBioblitzPrizePaymentStatus(7, ["most-observations"], WALLET, receipts);
    expect(status[0]!.paid).toBe(false);
  });

  it("tracks best-picture and most-observations independently", () => {
    const receipts = [receipt({ notes: "BioBlitz Round 12 — Best Picture winner prize" })];
    const status = computeBioblitzPrizePaymentStatus(12, ["most-observations", "best-picture"], WALLET, receipts);
    expect(status).toEqual([
      { prize: "most-observations", paid: false, txHash: undefined, paidAt: undefined },
      { prize: "best-picture", paid: true, txHash: undefined, paidAt: undefined },
    ]);
  });

  it("ignores ordinary donation notes", () => {
    const receipts = [receipt({ notes: "Keep up the great work!" }), receipt({ notes: null })];
    const status = computeBioblitzPrizePaymentStatus(7, ["most-observations"], WALLET, receipts);
    expect(status[0]!.paid).toBe(false);
  });
});
