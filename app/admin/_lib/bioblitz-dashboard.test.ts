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

import { loadBioblitzAdminRound } from "./bioblitz-dashboard";

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
      collectors: [{ did: REGISTERED_DID, count: 4, displayName: "Registered observer", avatarRef: null }],
      unfilteredCollectors: [
        { did: BEES_DID, count: 486, displayName: "Bees and Trees", avatarRef: null },
        { did: REGISTERED_DID, count: 4, displayName: "Registered observer", avatarRef: null },
      ],
      totalObservations: 4,
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

  it("keeps an actively ignored collector visible when they never registered for the round", async () => {
    const data = await loadBioblitzAdminRound(5, Date.parse("2026-07-28T12:00:00.000Z"));

    expect(data.registrants).toEqual([
      {
        did: BEES_DID,
        displayName: "Bees and Trees",
        avatarUrl: "https://example.com/bees.jpg",
        registeredAt: null,
        observationCount: 486,
        wins: [],
        availablePackages: [],
      },
      {
        did: REGISTERED_DID,
        displayName: "Registered observer",
        avatarUrl: null,
        registeredAt: "2026-07-25T12:00:00.000Z",
        observationCount: 4,
        wins: [],
        availablePackages: [],
      },
    ]);
  });
});
