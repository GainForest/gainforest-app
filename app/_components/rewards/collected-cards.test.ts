import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectedCardsStorageKey,
  collectedFromReward,
  parseStoredCards,
  readCollectedCards,
  rewardFromCollected,
  writeCollectedCards,
} from "./collected-cards";
import type { RewardCard } from "@/app/checkout/_components/reward-model";

const reward: RewardCard = {
  id: "project-0",
  variant: "project",
  totalUsd: 80,
  lines: [
    {
      kind: "donation",
      title: "Cloud Forest",
      orgName: "Forest Team",
      amountUsd: 80,
      image: "/cloud-forest.jpg",
    },
  ],
};

describe("collected card persistence model", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses isolated account and guest storage scopes", () => {
    expect(collectedCardsStorageKey("did:plc:alice")).toBe("gainforest.reward-cards.v1:did:plc:alice");
    expect(collectedCardsStorageKey(null)).toBe("gainforest.reward-cards.v1:guest");
  });

  it("round-trips a reward through the stored representation", () => {
    const collected = collectedFromReward(reward, 1_720_000_000_000);

    expect(collected).toMatchObject({
      id: "project-0-1720000000000",
      title: "Cloud Forest",
      orgName: "Forest Team",
      tier: "grove",
      collectedAt: 1_720_000_000_000,
    });
    expect(rewardFromCollected(collected)).toEqual({ ...reward, id: collected.id });
    expect(parseStoredCards(JSON.stringify([collected]))).toEqual([collected]);
  });

  it("drops malformed browser data instead of passing it to the gallery", () => {
    const valid = collectedFromReward(reward, 1);
    const malformed = {
      ...valid,
      id: "broken",
      lines: [{ kind: "donation", title: "Missing fields" }],
    };

    expect(parseStoredCards("not-json")).toEqual([]);
    expect(parseStoredCards(JSON.stringify([malformed, valid]))).toEqual([valid]);
  });

  it("keeps the newer session collection when a quota write fails", () => {
    const key = "gainforest.reward-cards.v1:test-quota-failure";
    const existing = collectedFromReward(reward, 1);
    const incoming = collectedFromReward({ ...reward, id: "project-1" }, 2);
    const localStorage = {
      getItem: vi.fn(() => JSON.stringify([existing])),
      setItem: vi.fn(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }),
    };
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage }));

    expect(readCollectedCards(key)).toEqual([existing]);
    expect(writeCollectedCards(key, [incoming, existing])).toBe(false);
    expect(readCollectedCards(key)).toEqual([incoming, existing]);
  });
});
