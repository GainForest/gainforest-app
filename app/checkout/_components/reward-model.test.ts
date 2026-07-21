import { describe, expect, it } from "vitest";
import { buildRewardCards, tierForAmount, type RewardLine } from "./reward-model";

const projectA: RewardLine = {
  kind: "donation",
  title: "Forest A",
  orgName: "Organization A",
  amountUsd: 25,
  image: "/forest-a.jpg",
};

const projectB: RewardLine = {
  kind: "donation",
  title: "Forest B",
  orgName: "Organization B",
  amountUsd: 80,
};

const tip: RewardLine = {
  kind: "tip",
  title: "GainForest tip",
  orgName: "GainForest",
  amountUsd: 10.5,
};

describe("buildRewardCards", () => {
  it("returns no rewards when no project donation settled", () => {
    expect(buildRewardCards([tip])).toEqual([]);
  });

  it("creates one non-duplicated card for a single project", () => {
    expect(buildRewardCards([projectA, tip])).toEqual([
      {
        id: "project-0",
        variant: "project",
        lines: [projectA],
        totalUsd: 25,
      },
    ]);
  });

  it("creates per-project cards and an overall card including the tip total", () => {
    const cards = buildRewardCards([projectA, projectB, tip]);

    expect(cards).toHaveLength(3);
    expect(cards.slice(0, 2)).toEqual([
      { id: "project-0", variant: "project", lines: [projectA], totalUsd: 25 },
      { id: "project-1", variant: "project", lines: [projectB], totalUsd: 80 },
    ]);
    expect(cards[2]).toEqual({
      id: "overall",
      variant: "total",
      lines: [projectA, projectB],
      totalUsd: 115.5,
    });
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
