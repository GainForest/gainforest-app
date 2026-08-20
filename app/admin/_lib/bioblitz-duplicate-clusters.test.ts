import { describe, expect, it } from "vitest";
import {
  clusterDuplicateCandidates,
  speciesKey,
  type DuplicateCandidateRecord,
} from "./bioblitz-duplicate-clusters";

const DID = "did:plc:collector";
const OTHER_DID = "did:plc:other";

let counter = 0;
function candidate(overrides: Partial<DuplicateCandidateRecord> = {}): DuplicateCandidateRecord {
  counter += 1;
  const rkey = overrides.rkey ?? `rkey-${counter}`;
  return {
    uri: `at://${overrides.did ?? DID}/app.gainforest.dwc.occurrence/${rkey}`,
    did: DID,
    rkey,
    createdAt: "2026-08-20T17:00:00.000Z",
    imageCid: `cid-${counter}`,
    associatedMedia: null,
    scientificName: null,
    vernacularName: null,
    points: 2.5,
    ...overrides,
  };
}

function at(minutes: number, seconds = 0): string {
  return new Date(Date.UTC(2026, 7, 20, 17, minutes, seconds)).toISOString();
}

describe("speciesKey", () => {
  it("prefers the scientific name and normalises case/whitespace", () => {
    expect(speciesKey({ scientificName: "  Gongylosoma   baliodeirus ", vernacularName: "Snake" })).toBe(
      "gongylosoma baliodeirus",
    );
  });

  it("falls back to the vernacular name and rejects placeholders", () => {
    expect(speciesKey({ scientificName: null, vernacularName: "Snake" })).toBe("snake");
    expect(speciesKey({ scientificName: "Unidentified", vernacularName: null })).toBeNull();
    expect(speciesKey({ scientificName: "unknown species", vernacularName: "N/A" })).toBeNull();
    expect(speciesKey({ scientificName: null, vernacularName: null })).toBeNull();
  });
});

describe("clusterDuplicateCandidates", () => {
  it("clusters a same-species rapid burst (the snake case) and keeps a separate species apart", () => {
    // Modeled on the real case: dozens of Gongylosoma baliodeirus photos in
    // ~20 minutes, plus an earlier Oligodon waandersi group.
    const snakes = Array.from({ length: 6 }, (_, index) =>
      candidate({
        rkey: `snake-${index}`,
        scientificName: "Gongylosoma baliodeirus",
        createdAt: at(36 + index * 3),
        associatedMedia: `IMG_10${44 + index * 7}.jpg`,
      }),
    );
    const otherSnakes = Array.from({ length: 2 }, (_, index) =>
      candidate({
        rkey: `oligodon-${index}`,
        scientificName: "Oligodon waandersi",
        createdAt: at(11 + index),
      }),
    );
    const clusters = clusterDuplicateCandidates([...snakes, ...otherSnakes]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.records).toHaveLength(6);
    expect(clusters[0]!.signals).toContain("species-burst");
    expect(clusters[1]!.records).toHaveLength(2);
  });

  it("starts a new cluster when the same species reappears after the burst gap", () => {
    const morning = candidate({ scientificName: "Ardea alba", createdAt: at(0) });
    const evening = candidate({ scientificName: "Ardea alba", createdAt: at(45) });
    expect(clusterDuplicateCandidates([morning, evening])).toHaveLength(0);
  });

  it("flags identical image blobs regardless of timing or labels", () => {
    const first = candidate({ imageCid: "cid-same", createdAt: at(0) });
    const second = candidate({ imageCid: "cid-same", createdAt: at(59) });
    const clusters = clusterDuplicateCandidates([first, second]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.signals).toEqual(["identical-image"]);
  });

  it("flags consecutive filenames uploaded close together", () => {
    const a = candidate({ associatedMedia: "IMG_1044.jpg", createdAt: at(0) });
    const b = candidate({ associatedMedia: "IMG_1045.jpg", createdAt: at(2) });
    const clusters = clusterDuplicateCandidates([a, b]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.signals).toEqual(["filename-burst"]);
  });

  it("does not link far-apart filenames or different prefixes", () => {
    const a = candidate({ associatedMedia: "IMG_1044.jpg", createdAt: at(0) });
    const b = candidate({ associatedMedia: "IMG_1099.jpg", createdAt: at(1) });
    const c = candidate({ associatedMedia: "DSC_1045.jpg", createdAt: at(2) });
    expect(clusterDuplicateCandidates([a, b, c])).toHaveLength(0);
  });

  it("uses scanner pairs but ignores cross-collector and unknown URIs", () => {
    const a = candidate({ createdAt: at(0) });
    const b = candidate({ createdAt: at(50) });
    const other = candidate({ did: OTHER_DID, createdAt: at(1) });
    const clusters = clusterDuplicateCandidates(
      [a, b, other],
      [
        [a.uri, b.uri],
        [a.uri, other.uri],
        [a.uri, "at://did:plc:x/app.gainforest.dwc.occurrence/missing"],
      ],
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.records.map((record) => record.uri).sort()).toEqual([a.uri, b.uri].sort());
    expect(clusters[0]!.signals).toEqual(["scanner"]);
  });

  it("never clusters across collectors on metadata signals", () => {
    const mine = candidate({ scientificName: "Ardea alba", createdAt: at(0) });
    const theirs = candidate({ did: OTHER_DID, scientificName: "Ardea alba", createdAt: at(1) });
    expect(clusterDuplicateCandidates([mine, theirs])).toHaveLength(0);
  });

  it("computes the points delta and picks the best earliest observation as canonical", () => {
    const unlabeled = candidate({
      scientificName: "Ardea alba",
      points: 2,
      createdAt: at(0),
    });
    const labeled = candidate({
      scientificName: "Ardea alba",
      points: 2.5,
      createdAt: at(5),
    });
    const another = candidate({
      scientificName: "Ardea alba",
      points: 2.5,
      createdAt: at(9),
    });
    const clusters = clusterDuplicateCandidates([unlabeled, labeled, another]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.pointsBefore).toBe(7);
    expect(clusters[0]!.pointsAfter).toBe(2.5);
    // Highest points wins; the tie between the two 2.5-point shots resolves
    // to the earlier one.
    expect(clusters[0]!.canonicalUri).toBe(labeled.uri);
    // Members stay in submission order.
    expect(clusters[0]!.records[0]!.uri).toBe(unlabeled.uri);
  });

  it("merges overlapping signals into one cluster", () => {
    const a = candidate({ scientificName: "Ardea alba", createdAt: at(0) });
    const b = candidate({ scientificName: "Ardea alba", createdAt: at(10) });
    const c = candidate({ imageCid: b.imageCid, createdAt: at(55) });
    const clusters = clusterDuplicateCandidates([a, b, c]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.records).toHaveLength(3);
    expect(clusters[0]!.signals).toEqual(["identical-image", "species-burst"]);
  });

  it("sorts clusters by size, then points impact", () => {
    const big = Array.from({ length: 3 }, (_, index) =>
      candidate({ scientificName: "Ardea alba", createdAt: at(index) }),
    );
    const small = Array.from({ length: 2 }, (_, index) =>
      candidate({ scientificName: "Bubo bubo", createdAt: at(30 + index) }),
    );
    const clusters = clusterDuplicateCandidates([...small, ...big]);
    expect(clusters.map((cluster) => cluster.records.length)).toEqual([3, 2]);
  });
});
