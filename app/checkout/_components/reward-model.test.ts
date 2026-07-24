import { describe, expect, it } from "vitest";
import {
  buildRewardCards,
  checkoutPhaseAfterSettlement,
  donationTotalUsd,
  pendingTipUsd,
  rewardEffectsEnabled,
  tierForAmount,
  type RewardLine,
} from "./reward-model";

const projectA: RewardLine = {
  kind: "donation",
  title: "Forest A",
  orgName: "Organization A",
  amountUsd: 25,
  image: "/forest-a.jpg",
  receiptUri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/receipt-a",
  cardEligible: true,
};

const projectB: RewardLine = {
  kind: "donation",
  title: "Forest B",
  orgName: "Organization B",
  amountUsd: 80,
  receiptUri: "at://did:plc:facilitator/org.hypercerts.funding.receipt/receipt-b",
  cardEligible: true,
};

const tip: RewardLine = {
  kind: "tip",
  title: "GainForest tip",
  orgName: "GainForest",
  amountUsd: 10.5,
};

describe("checkout settlement presentation", () => {
  it("returns partial settlement to review while completed donations remain recorded", () => {
    expect(checkoutPhaseAfterSettlement(true, 1)).toBe("review");
    expect(checkoutPhaseAfterSettlement(false, 1)).toBe("done");
    expect(checkoutPhaseAfterSettlement(false, 0)).toBe("review");
  });

  it("keeps reward effects purposeful while honoring reduced motion", () => {
    expect(rewardEffectsEnabled(false, true)).toBe(true);
    expect(rewardEffectsEnabled(null, true)).toBe(true);
    expect(rewardEffectsEnabled(true, true)).toBe(false);
    expect(rewardEffectsEnabled(false, false)).toBe(false);
  });
});

describe("donationTotalUsd", () => {
  it("excludes a GainForest tip from the amount described as project donations", () => {
    expect(donationTotalUsd([projectA, tip])).toBe(25);
  });

  it("totals completed project donations when no tip is present", () => {
    expect(donationTotalUsd([projectA, projectB])).toBe(105);
  });
});

describe("pendingTipUsd", () => {
  it("does not charge a settled tip again when partial donations are retried", () => {
    expect(pendingTipUsd(10.5, [projectA, tip])).toBe(0);
  });

  it("keeps the requested tip before it settles", () => {
    expect(pendingTipUsd(10.5, [projectA])).toBe(10.5);
  });
});

describe("buildRewardCards", () => {
  it("returns no rewards for tips or settled lines without receipts", () => {
    const unrecorded = { ...projectA, receiptUri: null, cardEligible: false };
    expect(buildRewardCards([tip, unrecorded])).toEqual([]);
  });

  it("creates one deterministic card per project funding receipt", () => {
    expect(buildRewardCards([projectA, projectB, tip])).toEqual([
      {
        id: projectA.receiptUri,
        variant: "project",
        lines: [projectA],
        totalUsd: 25,
      },
      {
        id: projectB.receiptUri,
        variant: "project",
        lines: [projectB],
        totalUsd: 80,
      },
    ]);
  });
});

describe("tierForAmount", () => {
  it.each([
    [0, "seedling"],
    [25, "sapling"],
    [75, "grove"],
    [200, "canopy"],
    [750, "oldGrowth"],
  ] as const)("places %s USD in the %s tier", (amount, tier) => {
    expect(tierForAmount(amount).key).toBe(tier);
  });
});
