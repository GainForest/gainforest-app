import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BIOBLITZ_LATE_UPLOAD_GRACE_MS,
  BIOBLITZ_POINTS_FROM_ROUND,
  bioblitzPublishTimeMs,
  bioblitzRoundUsesPoints,
  fetchBioblitzRoundRegistrants,
  frozenWinnersFor,
  isWithinRoundUploadWindow,
  type BioblitzRound,
  type FrozenRoundWinners,
} from "./bioblitz";

const ROUND: BioblitzRound = {
  id: 3,
  label: "Round 3",
  start: "2026-07-11T00:00:00.000Z",
  end: "2026-07-17T23:59:59.999Z",
};

/** Test-only TID encoder mirroring atproto's base32-sortable layout:
 *  (microseconds << 10) | clock-id, 13 chars. */
function encodeTid(ms: number): string {
  const TID_CHARS = "234567abcdefghijklmnopqrstuvwxyz";
  const value = (BigInt(Math.round(ms)) * 1000n * 1024n) | 42n;
  let out = "";
  for (let i = 12; i >= 0; i -= 1) out += TID_CHARS[Number((value >> BigInt(i * 5)) & 31n)]!;
  return out;
}

describe("bioblitzRoundUsesPoints", () => {
  it("keeps every round before the points era in the old format", () => {
    for (let roundId = 1; roundId < BIOBLITZ_POINTS_FROM_ROUND; roundId += 1) {
      expect(bioblitzRoundUsesPoints(roundId)).toBe(false);
    }
    expect(bioblitzRoundUsesPoints(BIOBLITZ_POINTS_FROM_ROUND)).toBe(true);
    expect(bioblitzRoundUsesPoints(BIOBLITZ_POINTS_FROM_ROUND + 5)).toBe(true);
  });
});

describe("bioblitzPublishTimeMs", () => {
  it("round-trips a synthetic TID rkey", () => {
    const t = Date.parse("2026-07-15T12:34:56.789Z");
    expect(bioblitzPublishTimeMs(encodeTid(t))).toBeCloseTo(t, 0);
  });

  it("decodes a real PDS-generated TID rkey to its creation instant", () => {
    // Real record: rkey 3msbbb6eh5k2t, record createdAt 2026-08-04T14:54:52.568Z
    // (client-set, so a couple of minutes of clock skew is expected).
    const ms = bioblitzPublishTimeMs("3msbbb6eh5k2t");
    expect(ms).not.toBeNull();
    expect(Math.abs(ms! - Date.parse("2026-08-04T14:54:52.568Z"))).toBeLessThan(10 * 60_000);
  });

  it("reads the epoch-ms timestamp from importer obs-<ms> rkeys", () => {
    expect(bioblitzPublishTimeMs("obs-1785793342976")).toBe(1785793342976);
    expect(bioblitzPublishTimeMs("obs-1785810309455-split")).toBe(1785810309455);
  });

  it("returns null for rkeys that carry no recognisable timestamp", () => {
    expect(bioblitzPublishTimeMs("self")).toBeNull();
    expect(bioblitzPublishTimeMs("my-custom-key")).toBeNull();
    expect(bioblitzPublishTimeMs("obs-abc")).toBeNull();
    expect(bioblitzPublishTimeMs("")).toBeNull();
    expect(bioblitzPublishTimeMs(null)).toBeNull();
    expect(bioblitzPublishTimeMs(undefined)).toBeNull();
  });
});

describe("isWithinRoundUploadWindow", () => {
  const endMs = Date.parse(ROUND.end);

  it("keeps records published inside the round", () => {
    expect(isWithinRoundUploadWindow(`obs-${endMs - 3_600_000}`, endMs)).toBe(true);
  });

  it("keeps late uploads within the grace window (offline sync)", () => {
    expect(
      isWithinRoundUploadWindow(`obs-${endMs + BIOBLITZ_LATE_UPLOAD_GRACE_MS - 1000}`, endMs),
    ).toBe(true);
  });

  it("excludes records actually published after the grace window", () => {
    expect(
      isWithinRoundUploadWindow(`obs-${endMs + BIOBLITZ_LATE_UPLOAD_GRACE_MS + 1000}`, endMs),
    ).toBe(false);
  });

  it("keeps records whose publish time cannot be derived", () => {
    expect(isWithinRoundUploadWindow("my-custom-key", endMs)).toBe(true);
    expect(isWithinRoundUploadWindow(null, endMs)).toBe(true);
  });
});

describe("frozenWinnersFor", () => {
  const awards = new Map<number, FrozenRoundWinners>([
    [3, { mostObservations: { did: "did:plc:awarded", count: 12 }, bestPicture: { did: "did:plc:photo", count: null } }],
  ]);

  it("uses the badge awards when the round has no hand-pinned override", () => {
    const frozen = frozenWinnersFor(ROUND, awards);
    expect(frozen.mostObservations).toEqual({ did: "did:plc:awarded", count: 12 });
    expect(frozen.bestPicture).toEqual({ did: "did:plc:photo", count: null });
  });

  it("prefers a hand-pinned override over the badge award", () => {
    const frozen = frozenWinnersFor(
      { ...ROUND, mostObservations: { did: "did:plc:pinned", count: 20 } },
      awards,
    );
    expect(frozen.mostObservations).toEqual({ did: "did:plc:pinned", count: 20 });
    expect(frozen.bestPicture).toEqual({ did: "did:plc:photo", count: null });
  });

  it("treats an explicit null override as frozen with no winner", () => {
    const frozen = frozenWinnersFor({ ...ROUND, bestPicture: null }, awards);
    expect(frozen.bestPicture).toBeNull();
  });

  it("leaves prizes undefined (not frozen) when neither source has them", () => {
    const frozen = frozenWinnersFor(ROUND, new Map());
    expect(frozen.mostObservations).toBeUndefined();
    expect(frozen.bestPicture).toBeUndefined();
    expect(frozenWinnersFor(ROUND, null).mostObservations).toBeUndefined();
  });
});

describe("fetchBioblitzRoundRegistrants", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubIndexerResponse(body: unknown, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
  }

  const node = (did: string, displayName: string | null = null) => ({
    node: {
      did,
      createdAt: "2026-07-09T21:18:10.607Z",
      certifiedProfileData: { displayName, avatar: null },
    },
  });

  it("keeps the full roster when the indexer only failed to decorate one row", async () => {
    // Mirrors the live round-2 payload: one registrant's avatar blob ref is
    // malformed, so the indexer nulls the avatar and reports a partial error
    // while every registrant row is still present.
    stubIndexerResponse(
      {
        errors: [{ message: 'blob.ref expected ref to be a CID string or {"$link": string} object' }],
        data: {
          appGainforestFeedPost: {
            pageInfo: { hasNextPage: false, endCursor: null },
            edges: [node("did:plc:aaa", "mena"), node("did:plc:bbb", "Luah"), node("did:plc:ccc", "Satyam2")],
          },
        },
      },
      // Hyperindex reports the partial serialization failure as HTTP 400.
      400,
    );

    const registrants = await fetchBioblitzRoundRegistrants(ROUND);
    expect(registrants.map((registrant) => registrant.did)).toEqual([
      "did:plc:aaa",
      "did:plc:bbb",
      "did:plc:ccc",
    ]);
  });

  it("still fails when a whole registrant row was dropped", async () => {
    stubIndexerResponse({
      errors: [{ message: "some row-level failure" }],
      data: {
        appGainforestFeedPost: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [node("did:plc:aaa"), { node: null }],
        },
      },
    });

    await expect(fetchBioblitzRoundRegistrants(ROUND)).rejects.toThrow(
      "Could not load BioBlitz registrations.",
    );
  });

  it("still fails when the indexer returns errors with no data at all", async () => {
    stubIndexerResponse({ errors: [{ message: "indexer down" }], data: null });

    await expect(fetchBioblitzRoundRegistrants(ROUND)).rejects.toThrow("indexer down");
  });
});
