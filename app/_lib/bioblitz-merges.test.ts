import { describe, expect, it } from "vitest";
import {
  effectiveBioblitzMergeRecords,
  indexBioblitzMerges,
  isObservationMergedAway,
  parseBioblitzMergeRecord,
  resolveActiveBioblitzMerge,
  type BioblitzMergeRecord,
} from "./bioblitz-merges";

const DID = "did:plc:collector";
const REPO = "did:plc:moderation";

function occurrenceUri(rkey: string, did = DID): string {
  return `at://${did}/app.gainforest.dwc.occurrence/${rkey}`;
}

function pdsEntry(overrides: Record<string, unknown> = {}, rkey = "merge-1"): unknown {
  return {
    uri: `at://${REPO}/app.gainforest.bioblitz.merge/${rkey}`,
    value: {
      $type: "app.gainforest.bioblitz.merge",
      subject: DID,
      roundId: 9,
      canonical: occurrenceUri("keep"),
      duplicates: [occurrenceUri("dupe-a"), occurrenceUri("dupe-b")],
      merged: true,
      createdAt: "2026-08-20T18:00:00.000Z",
      ...overrides,
    },
  };
}

function record(overrides: Partial<BioblitzMergeRecord> = {}): BioblitzMergeRecord {
  return {
    rkey: "merge-1",
    uri: `at://${REPO}/app.gainforest.bioblitz.merge/merge-1`,
    subjectDid: DID,
    roundId: 9,
    canonicalUri: occurrenceUri("keep"),
    duplicateUris: [occurrenceUri("dupe-a"), occurrenceUri("dupe-b")],
    merged: true,
    createdAt: "2026-08-20T18:00:00.000Z",
    ...overrides,
  };
}

describe("parseBioblitzMergeRecord", () => {
  it("parses a well-formed merge event", () => {
    const parsed = parseBioblitzMergeRecord(pdsEntry());
    expect(parsed).toMatchObject({
      rkey: "merge-1",
      subjectDid: DID,
      roundId: 9,
      canonicalUri: occurrenceUri("keep"),
      duplicateUris: [occurrenceUri("dupe-a"), occurrenceUri("dupe-b")],
      merged: true,
    });
  });

  it("defaults a missing merged flag to true for forwards compatibility", () => {
    const parsed = parseBioblitzMergeRecord(pdsEntry({ merged: undefined }));
    expect(parsed?.merged).toBe(true);
  });

  it("drops the canonical URI and non-occurrence URIs from the duplicate list", () => {
    const parsed = parseBioblitzMergeRecord(
      pdsEntry({
        duplicates: [
          occurrenceUri("keep"),
          occurrenceUri("dupe-a"),
          occurrenceUri("dupe-a"),
          "at://did:plc:x/app.gainforest.feed.post/nope",
          "https://example.com",
          42,
        ],
      }),
    );
    expect(parsed?.duplicateUris).toEqual([occurrenceUri("dupe-a")]);
  });

  it("rejects merge events without any duplicates", () => {
    expect(parseBioblitzMergeRecord(pdsEntry({ duplicates: [] }))).toBeNull();
    expect(parseBioblitzMergeRecord(pdsEntry({ duplicates: [occurrenceUri("keep")] }))).toBeNull();
  });

  it("accepts undo events without duplicates", () => {
    const parsed = parseBioblitzMergeRecord(pdsEntry({ merged: false, duplicates: [] }));
    expect(parsed?.merged).toBe(false);
  });

  it("rejects malformed records", () => {
    expect(parseBioblitzMergeRecord(null)).toBeNull();
    expect(parseBioblitzMergeRecord({})).toBeNull();
    expect(parseBioblitzMergeRecord(pdsEntry({ subject: "not-a-did" }))).toBeNull();
    expect(parseBioblitzMergeRecord(pdsEntry({ roundId: 0 }))).toBeNull();
    expect(parseBioblitzMergeRecord(pdsEntry({ roundId: 1.5 }))).toBeNull();
    expect(parseBioblitzMergeRecord(pdsEntry({ canonical: "not-a-uri" }))).toBeNull();
    expect(parseBioblitzMergeRecord(pdsEntry({ createdAt: "" }))).toBeNull();
  });
});

describe("effectiveBioblitzMergeRecords", () => {
  it("keeps the newest event per round + canonical", () => {
    const merged = record({ rkey: "old", createdAt: "2026-08-20T10:00:00.000Z" });
    const undone = record({
      rkey: "new",
      uri: `at://${REPO}/app.gainforest.bioblitz.merge/new`,
      merged: false,
      createdAt: "2026-08-20T12:00:00.000Z",
    });
    expect(effectiveBioblitzMergeRecords([merged, undone])).toEqual([]);
    expect(effectiveBioblitzMergeRecords([undone, merged])).toEqual([]);

    const remerged = record({
      rkey: "newest",
      uri: `at://${REPO}/app.gainforest.bioblitz.merge/newest`,
      createdAt: "2026-08-20T14:00:00.000Z",
    });
    expect(effectiveBioblitzMergeRecords([merged, undone, remerged])).toEqual([remerged]);
  });

  it("tracks distinct canonicals and rounds independently", () => {
    const a = record();
    const b = record({
      rkey: "merge-2",
      uri: `at://${REPO}/app.gainforest.bioblitz.merge/merge-2`,
      canonicalUri: occurrenceUri("keep-2"),
      duplicateUris: [occurrenceUri("dupe-c")],
    });
    const otherRoundUndo = record({
      rkey: "merge-3",
      uri: `at://${REPO}/app.gainforest.bioblitz.merge/merge-3`,
      roundId: 10,
      merged: false,
      createdAt: "2026-08-21T10:00:00.000Z",
    });
    expect(effectiveBioblitzMergeRecords([a, b, otherRoundUndo])).toHaveLength(2);
  });
});

describe("indexBioblitzMerges / isObservationMergedAway", () => {
  it("flags only merged-away URIs for the named round", () => {
    const merges = indexBioblitzMerges([record()]);
    expect(isObservationMergedAway(merges, occurrenceUri("dupe-a"), 9)).toBe(true);
    expect(isObservationMergedAway(merges, occurrenceUri("dupe-b"), 9)).toBe(true);
    expect(isObservationMergedAway(merges, occurrenceUri("keep"), 9)).toBe(false);
    expect(isObservationMergedAway(merges, occurrenceUri("dupe-a"), 8)).toBe(false);
    expect(isObservationMergedAway(merges, null, 9)).toBe(false);
    expect(isObservationMergedAway(merges, occurrenceUri("dupe-a"), null)).toBe(false);
  });

  it("ignores undone merges", () => {
    const undo = record({
      rkey: "undo",
      uri: `at://${REPO}/app.gainforest.bioblitz.merge/undo`,
      merged: false,
      createdAt: "2026-08-21T00:00:00.000Z",
    });
    const merges = indexBioblitzMerges([record(), undo]);
    expect(isObservationMergedAway(merges, occurrenceUri("dupe-a"), 9)).toBe(false);
  });
});

describe("resolveActiveBioblitzMerge", () => {
  it("resolves a stale rkey to the currently active merge for that canonical", () => {
    const old = record({ rkey: "old", createdAt: "2026-08-20T10:00:00.000Z" });
    const active = record({
      rkey: "active",
      uri: `at://${REPO}/app.gainforest.bioblitz.merge/active`,
      createdAt: "2026-08-20T12:00:00.000Z",
    });
    expect(resolveActiveBioblitzMerge([old, active], "old")).toEqual(active);
    expect(resolveActiveBioblitzMerge([old, active], "missing")).toBeNull();
  });

  it("returns null when the merge was already undone", () => {
    const old = record({ rkey: "old" });
    const undo = record({
      rkey: "undo",
      uri: `at://${REPO}/app.gainforest.bioblitz.merge/undo`,
      merged: false,
      createdAt: "2026-08-21T00:00:00.000Z",
    });
    expect(resolveActiveBioblitzMerge([old, undo], "old")).toBeNull();
  });
});
