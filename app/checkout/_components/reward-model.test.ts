import { describe, expect, it } from "vitest";
import { buildRewardCards, tierForAmount, type RewardLine } from "./reward-model";

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
