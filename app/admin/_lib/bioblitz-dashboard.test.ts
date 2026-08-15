import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BioblitzExclusionRecord } from "@/app/_lib/bioblitz-exclusions";

const {
  bioblitzRounds,
  fetchBioblitzRoundRegistrants,
  fetchRoundCollectors,
  roundStatus,
  fetchBioblitzExclusionsStrict,
  effectiveBioblitzExclusionRecords,
  fetchIndexedCertifiedProfileCards,
  loadBioblitzConfirmedWinners,
} = vi.hoisted(() => ({
  bioblitzRounds: vi.fn(),
  fetchBioblitzRoundRegistrants: vi.fn(),
  fetchRoundCollectors: vi.fn(),
  roundStatus: vi.fn(),
  fetchBioblitzExclusionsStrict: vi.fn(),
  effectiveBioblitzExclusionRecords: vi.fn(),
  fetchIndexedCertifiedProfileCards: vi.fn(),
  loadBioblitzConfirmedWinners: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/_lib/bioblitz", () => ({
  bioblitzRounds,
  fetchBioblitzRoundRegistrants,
  fetchRoundCollectors,
  roundStatus,
}));
vi.mock("@/app/_lib/bioblitz-exclusions", () => ({
  fetchBioblitzExclusionsStrict,
  effectiveBioblitzExclusionRecords,
}));
vi.mock("@/app/_lib/indexer", () => ({ fetchIndexedCertifiedProfileCards }));
vi.mock("./bioblitz-confirmed-winners", () => ({ loadBioblitzConfirmedWinners }));

import { loadBioblitzAdminRound, loadBioblitzAdminRoundCounts } from "./bioblitz-dashboard";

const ROUND = {
  id: 5,
  label: "Round 5",
  start: "2026-07-25T00:00:00.000Z",
  end: "2026-07-31T23:59:59.999Z",
};

const BEES_DID = "did:plc:bees";
const REGISTERED_DID = "did:plc:registered";

describe("BioBlitz admin roster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bioblitzRounds.mockReturnValue([ROUND]);
    roundStatus.mockReturnValue("live");
    fetchBioblitzRoundRegistrants.mockResolvedValue([
      {
        did: REGISTERED_DID,
        displayName: "Registered observer",
        avatarUrl: null,
        createdAt: "2026-07-25T12:00:00.000Z",
      },
    ]);
    fetchRoundCollectors.mockResolvedValue({
      collectors: [{ did: REGISTERED_DID, count: 4, points: 7.5, displayName: "Registered observer", avatarRef: null }],
      unfilteredCollectors: [
        { did: BEES_DID, count: 486, points: 486, displayName: "Bees and Trees", avatarRef: null },
        { did: REGISTERED_DID, count: 4, points: 7.5, displayName: "Registered observer", avatarRef: null },
      ],
      totalObservations: 4,
      totalPoints: 7.5,
      imageCounts: {},
      collectorCount: 1,
    });
    fetchBioblitzExclusionsStrict.mockResolvedValue([
      {
        rkey: "exclude-bees",
        uri: `at://did:plc:moderation/app.gainforest.bioblitz.exclusion/exclude-bees`,
        subjectDid: BEES_DID,
        roundId: 5,
        excluded: true,
        createdAt: "2026-07-28T11:34:44.538Z",
      },
    ]);
    effectiveBioblitzExclusionRecords.mockImplementation((records: readonly BioblitzExclusionRecord[]) =>
      records.filter((record) => record.excluded),
    );
    fetchIndexedCertifiedProfileCards.mockResolvedValue(
      new Map([[BEES_DID, { displayName: "Bees and Trees", avatarUrl: "https://example.com/bees.jpg" }]]),
    );
  });

  it("returns eligible totals for the round rail without substituting failed reads for zero", async () => {
    await expect(loadBioblitzAdminRoundCounts([ROUND])).resolves.toEqual([
      { roundId: 5, totalObservations: 4 },
    ]);

    fetchRoundCollectors.mockRejectedValueOnce(new Error("indexer unavailable"));
    await expect(loadBioblitzAdminRoundCounts([ROUND])).resolves.toEqual([
      { roundId: 5, totalObservations: null },
    ]);
  });

  it("keeps an actively ignored collector visible when they never registered for the round", async () => {
    const data = await loadBioblitzAdminRound(5, Date.parse("2026-07-28T12:00:00.000Z"));

    expect(data.totalObservations).toBe(4);
    expect(data.registrants).toEqual([
      {
        did: BEES_DID,
        displayName: "Bees and Trees",
        avatarUrl: "https://example.com/bees.jpg",
        registeredAt: null,
        observationCount: 486,
        points: 486,
        wins: [],
        availablePackages: [],
      },
      {
        did: REGISTERED_DID,
        displayName: "Registered observer",
        avatarUrl: null,
        registeredAt: "2026-07-25T12:00:00.000Z",
        observationCount: 4,
        points: 7.5,
        wins: [],
        availablePackages: [],
      },
    ]);
  });
});
