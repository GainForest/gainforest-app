import { describe, expect, it } from "vitest";
import { bioblitzRoundIdAt } from "./bioblitz";
import {
  indexBioblitzExclusions,
  isAccountExcludedFromBioblitzRound,
  parseBioblitzExclusionRecord,
  type BioblitzExclusionRecord,
} from "./bioblitz-exclusions";

const ACCOUNT_A = "did:plc:account-a";
const ACCOUNT_B = "did:plc:account-b";

function exclusion(subjectDid: string, roundId: number, rkey: string): BioblitzExclusionRecord {
  return {
    rkey,
    uri: `at://did:plc:moderation/app.gainforest.bioblitz.exclusion/${rkey}`,
    subjectDid,
    roundId,
    createdAt: "2026-07-28T00:00:00.000Z",
  };
}

describe("BioBlitz weekly exclusions", () => {
  it("parses a valid exclusion record", () => {
    expect(
      parseBioblitzExclusionRecord({
        uri: "at://did:plc:moderation/app.gainforest.bioblitz.exclusion/abc",
        value: {
          $type: "app.gainforest.bioblitz.exclusion",
          subject: ACCOUNT_A,
          roundId: 3,
          createdAt: "2026-07-28T00:00:00.000Z",
        },
      }),
    ).toEqual(exclusion(ACCOUNT_A, 3, "abc"));
  });

  it.each([
    null,
    {},
    { uri: "at://example", value: { subject: "not-an-account", roundId: 1, createdAt: "now" } },
    { uri: "at://example", value: { subject: ACCOUNT_A, roundId: 0, createdAt: "now" } },
    { uri: "at://example", value: { subject: ACCOUNT_A, roundId: 1.5, createdAt: "now" } },
  ])("ignores malformed records", (entry) => {
    expect(parseBioblitzExclusionRecord(entry)).toBeNull();
  });

  it("deduplicates accounts within a round without excluding other weeks", () => {
    const indexed = indexBioblitzExclusions([
      exclusion(ACCOUNT_A, 2, "one"),
      exclusion(ACCOUNT_A, 2, "duplicate"),
      exclusion(ACCOUNT_B, 3, "three"),
    ]);

    expect(indexed.get(2)).toEqual(new Set([ACCOUNT_A]));
    expect(isAccountExcludedFromBioblitzRound(indexed, ACCOUNT_A, 2)).toBe(true);
    expect(isAccountExcludedFromBioblitzRound(indexed, ACCOUNT_A, 3)).toBe(false);
    expect(isAccountExcludedFromBioblitzRound(indexed, ACCOUNT_B, 3)).toBe(true);
    expect(isAccountExcludedFromBioblitzRound(indexed, ACCOUNT_A, null)).toBe(false);
  });

  it("maps timestamps to the fixed round windows for all-time standings", () => {
    expect(bioblitzRoundIdAt(Date.parse("2026-06-25T23:59:59.999Z"))).toBeNull();
    expect(bioblitzRoundIdAt(Date.parse("2026-06-26T00:00:00.000Z"))).toBe(1);
    expect(bioblitzRoundIdAt(Date.parse("2026-07-03T23:59:59.999Z"))).toBe(1);
    expect(bioblitzRoundIdAt(Date.parse("2026-07-04T00:00:00.000Z"))).toBe(2);
    expect(bioblitzRoundIdAt(Date.parse("2026-07-11T00:00:00.000Z"))).toBe(3);
  });
});
