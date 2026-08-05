import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BioblitzRound } from "@/app/_lib/bioblitz";
import type { InternalBadgeData } from "@/app/internal/badges/_lib/badge-records";

const { fetchInternalBadgeDataStrict } = vi.hoisted(() => ({
  fetchInternalBadgeDataStrict: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/internal/badges/_lib/badge-records", () => ({ fetchInternalBadgeDataStrict }));

import {
  BioblitzWinnerConflictError,
  loadBioblitzConfirmedWinners,
} from "./bioblitz-confirmed-winners";

const ROUND: BioblitzRound = {
  id: 4,
  label: "Round 4",
  start: "2026-07-17T00:00:00.000Z",
  end: "2026-07-23T23:59:59.999Z",
};

function badgeData(awards: Array<{ badgeUri: string; did: string; url?: string }>): InternalBadgeData {
  return {
    repoDid: "did:plc:gainforest",
    definitions: [
      { uri: "at://did:plc:gainforest/app.certified.badge.definition/most", title: "bioblitz-most-images-round-4" },
      { uri: "at://did:plc:gainforest/app.certified.badge.definition/picture", title: "bioblitz-best-picture-round-4" },
    ],
    awards: awards.map((award) => ({
      badge: { uri: award.badgeUri },
      subjectDid: award.did,
      url: award.url ?? null,
    })),
    pendingAwards: [],
  } as unknown as InternalBadgeData;
}

describe("confirmed BioBlitz winners", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses a configured steward decision without recalculating a leaderboard", async () => {
    const winners = await loadBioblitzConfirmedWinners(
      { ...ROUND, mostObservations: { did: "did:plc:confirmed", count: 42 } },
      null,
    );

    expect(winners).toEqual({
      "most-observations": {
        did: "did:plc:confirmed",
        count: 42,
        winningObservationUri: null,
      },
    });
    expect(fetchInternalBadgeDataStrict).not.toHaveBeenCalled();
  });

  it("uses the recipient and stored image from an issued recognition award", async () => {
    fetchInternalBadgeDataStrict.mockResolvedValue(
      badgeData([
        {
          badgeUri: "at://did:plc:gainforest/app.certified.badge.definition/most",
          did: "did:plc:collector",
        },
        {
          badgeUri: "at://did:plc:gainforest/app.certified.badge.definition/picture",
          did: "did:plc:photographer",
          url: "at://did:plc:photographer/app.gainforest.dwc.occurrence/picture",
        },
      ]),
    );

    const winners = await loadBioblitzConfirmedWinners(ROUND, "did:plc:gainforest");

    expect(winners).toEqual({
      "most-observations": { did: "did:plc:collector", winningObservationUri: null },
      "best-picture": {
        did: "did:plc:photographer",
        winningObservationUri: "at://did:plc:photographer/app.gainforest.dwc.occurrence/picture",
      },
    });
  });

  it("fails closed when an override and issued award disagree", async () => {
    fetchInternalBadgeDataStrict.mockResolvedValue(
      badgeData([{ badgeUri: "at://did:plc:gainforest/app.certified.badge.definition/most", did: "did:plc:awarded" }]),
    );

    await expect(
      loadBioblitzConfirmedWinners(
        { ...ROUND, mostObservations: { did: "did:plc:configured" } },
        "did:plc:gainforest",
      ),
    ).rejects.toBeInstanceOf(BioblitzWinnerConflictError);
  });

  it("fails closed when a suppressed prize still has an issued award", async () => {
    fetchInternalBadgeDataStrict.mockResolvedValue(
      badgeData([{ badgeUri: "at://did:plc:gainforest/app.certified.badge.definition/most", did: "did:plc:awarded" }]),
    );

    await expect(
      loadBioblitzConfirmedWinners({ ...ROUND, mostObservations: null }, "did:plc:gainforest"),
    ).rejects.toBeInstanceOf(BioblitzWinnerConflictError);
  });

  it("fails closed when one round prize has two recipients", async () => {
    fetchInternalBadgeDataStrict.mockResolvedValue(
      badgeData([
        { badgeUri: "at://did:plc:gainforest/app.certified.badge.definition/most", did: "did:plc:first" },
        { badgeUri: "at://did:plc:gainforest/app.certified.badge.definition/most", did: "did:plc:second" },
      ]),
    );

    await expect(
      loadBioblitzConfirmedWinners(ROUND, "did:plc:gainforest"),
    ).rejects.toBeInstanceOf(BioblitzWinnerConflictError);
  });
});
