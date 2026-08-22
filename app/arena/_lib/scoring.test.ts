import { describe, expect, it, vi } from "vitest";

// scoring.ts re-exports the IO entry point from ./data.ts, which pulls in
// server-only + the indexer chain. Mock them so the pure functions can load.
vi.mock("server-only", () => ({}));
vi.mock("@/app/_lib/indexer", () => ({
  fetchHiddenAccountDids: vi.fn(async () => new Set<string>()),
  fetchHiddenRecordUris: vi.fn(async () => new Set<string>()),
  indexerQueryStrict: vi.fn(async () => null),
}));
vi.mock("@/app/_lib/pds", () => ({ resolvePdsHost: vi.fn(async () => null) }));
vi.mock("@/app/_lib/bioblitz", () => ({
  bioblitzRoundIdAt: vi.fn(() => null),
  featuredRound: vi.fn(() => ({ id: 1, label: "R1", start: "2026-06-26T00:00:00.000Z", end: "2026-07-03T23:59:59.999Z" })),
}));
vi.mock("@/app/_lib/bioblitz-merges", () => ({
  effectiveBioblitzMergeRecords: vi.fn(() => []),
  fetchBioblitzMerges: vi.fn(async () => []),
  indexBioblitzMerges: vi.fn(() => new Map()),
}));
vi.mock("@/app/_lib/bioblitz-exclusions", () => ({
  fetchBioblitzExclusions: vi.fn(async () => []),
  indexBioblitzExclusions: vi.fn(() => new Map()),
}));
vi.mock("@/app/_lib/species-identifications", () => ({
  SPECIES_IDENTIFICATION_TAG: "species-identification",
  identificationRkeyFromTags: vi.fn(() => null),
}));

import {
  assembleReport,
  buildStandings,
  dedupeIdentifications,
  imageReviewQueueSummary,
  isArenaPhotoProblem,
  loadArenaReport,
  matchTaxa,
  mergeCoversPair,
  photoIdQueueSummary,
  resolveOccurrence,
  scoreImageReviewCategory,
  scorePhotoIdCategory,
  type ArenaFlagInput,
  type ArenaIdentificationInput,
  type ArenaOccurrenceInput,
  type ImageReviewContext,
} from "./scoring";

const AGENT_A = "did:plc:agent-a";
const AGENT_B = "did:plc:agent-b";
const AGENT_C = "did:plc:agent-c";
const OWNER = "did:plc:owner";

let uriCounter = 0;
function occUri(did = OWNER): string {
  return `at://${did}/app.gainforest.dwc.occurrence/r${++uriCounter}`;
}

function occurrence(overrides: Partial<ArenaOccurrenceInput> = {}): ArenaOccurrenceInput {
  return { uri: occUri(), did: OWNER, cid: "cid-current", scientificName: null, ...overrides };
}

function identification(
  overrides: Partial<ArenaIdentificationInput> & { subjectUri: string },
): ArenaIdentificationInput {
  return {
    uri: `at://${overrides.did ?? AGENT_A}/app.gainforest.dwc.identification/r${++uriCounter}`,
    did: AGENT_A,
    subjectCid: "cid-old",
    scientificName: "Quercus robur",
    taxonRank: "species",
    confidence: 80,
    createdAt: "2026-07-01T10:00:00.000Z",
    indexedAt: "2026-07-01T10:00:05.000Z",
    ...overrides,
  };
}

function flag(overrides: Partial<ArenaFlagInput> & { parentUri: string }): ArenaFlagInput {
  return {
    uri: `at://${overrides.did ?? AGENT_A}/app.gainforest.feed.post/r${++uriCounter}`,
    did: AGENT_A,
    kind: "invalid",
    duplicateUri: null,
    createdAt: null,
    flaggedOwnerDid: OWNER,
    roundId: 1,
    ...overrides,
  };
}

function reviewContext(overrides: Partial<ImageReviewContext> = {}): ImageReviewContext {
  return {
    merges: [],
    hiddenRecordUris: new Set<string>(),
    hiddenAccountDids: new Set<string>(),
    excludedDidsByRound: new Map(),
    knownObservationUris: new Set<string>(),
    ...overrides,
  };
}

describe("loadArenaReport against an empty protocol", () => {
  it("returns sane queues and empty standings when no arena activity exists", async () => {
    const report = await loadArenaReport();
    expect(report.generatedAt).toBeTruthy();
    expect(report.standings).toEqual([]);
    expect(report.queues.map((q) => q.category)).toEqual(["photo-id", "image-review"]);
    for (const queue of report.queues) {
      expect(queue.openCount).toBeGreaterThanOrEqual(0);
      expect(queue.sampleUris.length).toBeLessThanOrEqual(5);
    }
  });
});

// ── Taxon matching ──────────────────────────────────────────────────────────

describe("matchTaxa", () => {
  it("matches species case-insensitively across authorities", () => {
    expect(matchTaxa("quercus robur", "Quercus robur L.")).toBe("species");
  });
  it("matches genus when species differ or are missing", () => {
    expect(matchTaxa("Quercus robur", "Quercus alba")).toBe("genus");
    expect(matchTaxa("Quercus", "Quercus robur")).toBe("genus");
  });
  it("returns none for different genera", () => {
    expect(matchTaxa("Acer palmatum", "Quercus robur")).toBe("none");
  });
});

describe("isArenaPhotoProblem", () => {
  it("flags missing, kingdom-rank and placeholder names on photos only", () => {
    expect(isArenaPhotoProblem({ hasImageEvidence: true, scientificName: null, kingdom: null })).toBe(true);
    expect(isArenaPhotoProblem({ hasImageEvidence: true, scientificName: "Plantae", kingdom: "Plantae" })).toBe(true);
    expect(isArenaPhotoProblem({ hasImageEvidence: true, scientificName: "Unidentified moth", kingdom: null })).toBe(true);
    expect(isArenaPhotoProblem({ hasImageEvidence: true, scientificName: "N/A", kingdom: null })).toBe(true);
    expect(isArenaPhotoProblem({ hasImageEvidence: true, scientificName: "Morpho peleides", kingdom: "Animalia" })).toBe(false);
    // No image evidence → never a photo-id problem.
    expect(isArenaPhotoProblem({ hasImageEvidence: false, scientificName: null, kingdom: null })).toBe(false);
  });
});

// ── Photo identification ────────────────────────────────────────────────────

describe("dedupeIdentifications", () => {
  it("keeps the latest proposal per agent per pinned version", () => {
    const subjectUri = occUri();
    const first = identification({ subjectUri, confidence: 50 });
    const latest = identification({
      subjectUri,
      did: first.did,
      subjectCid: "cid-old",
      indexedAt: "2026-07-02T10:00:00.000Z",
    });
    const otherVersion = identification({
      subjectUri,
      did: first.did,
      subjectCid: "cid-new",
    });
    const deduped = dedupeIdentifications([first, otherVersion, latest]);
    expect(deduped).toHaveLength(2);
    expect(deduped.some((s) => s.uri === first.uri)).toBe(false);
    expect(deduped.some((s) => s.uri === latest.uri)).toBe(true);
  });
});

describe("resolveOccurrence", () => {
  it("detects owner acceptance via CID change plus name match", () => {
    const o = occurrence({ cid: "cid-new", scientificName: "Quercus robur" });
    const resolution = resolveOccurrence(o, [
      identification({ subjectUri: o.uri, subjectCid: "cid-old", scientificName: "Quercus Robur L." }),
    ]);
    expect(resolution).toEqual({ status: "owner", taxon: "Quercus robur" });
  });

  it("does not credit owner acceptance when CIDs match or are missing", () => {
    const sameCid = occurrence({ cid: "cid-old", scientificName: "Quercus robur" });
    expect(
      resolveOccurrence(sameCid, [
        identification({ subjectUri: sameCid.uri, subjectCid: "cid-old" }),
      ]).status,
    ).toBe("open");

    const noCid = occurrence({ cid: null, scientificName: "Quercus robur" });
    expect(
      resolveOccurrence(noCid, [
        identification({ subjectUri: noCid.uri, subjectCid: null }),
      ]).status,
    ).toBe("open");
  });

  it("resolves by convergence at ≥3 distinct identifiers with ≥2/3 agreement", () => {
    const o = occurrence();
    const subs = [AGENT_A, AGENT_B, AGENT_C].map((did) =>
      identification({ subjectUri: o.uri, did, scientificName: "Morpho peleides" }),
    );
    expect(resolveOccurrence(o, subs)).toEqual({ status: "convergence", taxon: "morpho peleides" });
  });

  it("stays open on weak agreement or too few identifiers", () => {
    const weak = occurrence();
    expect(
      resolveOccurrence(weak, [
        identification({ subjectUri: weak.uri, did: AGENT_A }),
        identification({ subjectUri: weak.uri, did: AGENT_B, scientificName: "Acer palmatum" }),
        identification({ subjectUri: weak.uri, did: AGENT_C, scientificName: "Acer campestre" }),
      ]).status,
    ).toBe("open");

    const twoOnly = occurrence();
    expect(
      resolveOccurrence(twoOnly, [
        identification({ subjectUri: twoOnly.uri, did: AGENT_A }),
        identification({ subjectUri: twoOnly.uri, did: AGENT_B }),
      ]).status,
    ).toBe("open");
  });

  it("counts 2-of-3 as sufficient agreement (≥2/3)", () => {
    const o = occurrence();
    const subs = [
      identification({ subjectUri: o.uri, did: AGENT_A }),
      identification({ subjectUri: o.uri, did: AGENT_B }),
      identification({ subjectUri: o.uri, did: AGENT_C, scientificName: "Acer palmatum" }),
    ];
    expect(resolveOccurrence(o, subs)).toEqual({
      status: "convergence",
      taxon: "quercus robur",
    });
  });

  it("lets owner acceptance outrank convergence", () => {
    const o = occurrence({ cid: "cid-new", scientificName: "Acer palmatum" });
    const subs = [
      identification({ subjectUri: o.uri, subjectCid: "cid-old", scientificName: "Acer Palmatum" }),
      identification({ subjectUri: o.uri, did: AGENT_B }),
      identification({ subjectUri: o.uri, did: AGENT_C }),
    ];
    expect(resolveOccurrence(o, subs)).toEqual({ status: "owner", taxon: "Acer palmatum" });
  });

  it("ignores self-identifications for convergence", () => {
    const o = occurrence({ did: AGENT_A });
    const subs = [
      identification({ subjectUri: o.uri, did: AGENT_A }), // own observation
      identification({ subjectUri: o.uri, did: AGENT_B }),
      identification({ subjectUri: o.uri, did: AGENT_C }),
    ];
    expect(resolveOccurrence(o, subs).status).toBe("open");
  });
});

describe("scorePhotoIdCategory", () => {
  it("rewards calibrated correct IDs with earliness decay and genus half credit", () => {
    const o = occurrence({ cid: "cid-new", scientificName: "Quercus robur" });
    const early = identification({
      subjectUri: o.uri,
      did: AGENT_A,
      confidence: 90,
      indexedAt: "2026-07-01T08:00:00.000Z",
    });
    const lateAgree = identification({
      subjectUri: o.uri,
      did: AGENT_B,
      confidence: 90,
      indexedAt: "2026-07-01T09:00:00.000Z",
    });
    const genusOnly = identification({
      subjectUri: o.uri,
      did: AGENT_C,
      scientificName: "Quercus suber",
      confidence: 70,
      indexedAt: "2026-07-01T09:30:00.000Z",
    });

    const { tallies, ownerReviewPoints } = scorePhotoIdCategory([o], [early, lateAgree, genusOnly]);

    const expectedEarly = (1 - (0.9 - 1) ** 2) * 1; // k=0
    const expectedLate = (1 - (0.9 - 1) ** 2) * 0.5; // one earlier same-taxon proposal
    const expectedGenus = (1 - (0.7 - 1) ** 2) * 0.5; // genus half credit; no decay (a different taxon)
    expect(tallies.get(AGENT_A)!.score).toBeCloseTo(expectedEarly);
    expect(tallies.get(AGENT_B)!.score).toBeCloseTo(expectedLate);
    expect(tallies.get(AGENT_C)!.score).toBeCloseTo(expectedGenus);
    expect(tallies.get(AGENT_C)!.correct).toBe(1); // genus counts as partially correct
    expect(ownerReviewPoints.get(OWNER)).toBe(0.5);
  });

  it("penalises confident wrong guesses and scores self-IDs zero", () => {
    const o = occurrence({ did: AGENT_A, cid: "cid-new", scientificName: "Morpho peleides" });
    const correct = identification({
      subjectUri: o.uri,
      did: AGENT_C,
      scientificName: "Morpho peleides",
      confidence: 90,
    });
    const wrong = identification({
      subjectUri: o.uri,
      did: AGENT_B,
      scientificName: "Acer palmatum",
      confidence: 95,
    });
    const selfId = identification({ subjectUri: o.uri, did: AGENT_A, confidence: 99 });
    const { tallies, ownerReviewPoints } = scorePhotoIdCategory([o], [correct, wrong, selfId]);

    expect(tallies.get(AGENT_B)!.score).toBeCloseTo(1 - 0.95 ** 2);
    expect(tallies.get(AGENT_B)!.correct).toBe(0);
    expect(tallies.get(AGENT_A)!.submissions).toBe(1);
    expect(tallies.get(AGENT_A)!.score).toBe(0);
    // The owner's own ID earns nothing, but accepting AGENT_C's proposal on
    // their observation still pays review points.
    expect(ownerReviewPoints.get(AGENT_A)).toBe(0.5);
  });

  it("leaves unresolved occurrences out of resolved counts", () => {
    const o = occurrence();
    const single = identification({ subjectUri: o.uri, did: AGENT_A });
    const { tallies, resolvedUris } = scorePhotoIdCategory([o], [single]);
    expect(resolvedUris.size).toBe(0);
    expect(tallies.get(AGENT_A)).toMatchObject({ submissions: 1, resolved: 0, correct: 0, score: 0 });
  });
});

// ── Image review ────────────────────────────────────────────────────────────

describe("mergeCoversPair / scoreImageReviewCategory", () => {
  const parent = occUri();
  const dup = occUri();

  it("confirms duplicate flags covered by an active merge in either orientation", () => {
    expect(mergeCoversPair([{ canonicalUri: parent, duplicateUris: [dup] }], parent, dup)).toBe(true);
    expect(mergeCoversPair([{ canonicalUri: dup, duplicateUris: [parent] }], parent, dup)).toBe(true);
    expect(mergeCoversPair([{ canonicalUri: parent, duplicateUris: [] }], parent, dup)).toBe(false);
  });

  it("scores confirmed flags, voids dead targets, leaves pending flags unresolved", () => {
    const ctx = reviewContext({
      merges: [{ canonicalUri: parent, duplicateUris: [dup] }],
      hiddenRecordUris: new Set([occUri()]),
      knownObservationUris: new Set([parent, dup]),
    });
    const confirmedDup = flag({ parentUri: parent, kind: "duplicate", duplicateUri: dup });
    const confirmedInvalid = flag({ parentUri: [...ctx.hiddenRecordUris][0]!, kind: "invalid" });
    const deadTarget = flag({ parentUri: "at://did:plc:x/app.gainforest.dwc.occurrence/gone", did: AGENT_B });
    const pending = flag({ parentUri: dup, did: AGENT_B, kind: "duplicate", duplicateUri: occUri() });

    const { tallies, confirmedParentUris } = scoreImageReviewCategory(
      [confirmedDup, confirmedInvalid, deadTarget, pending],
      ctx,
    );

    expect(tallies.get(AGENT_A)).toMatchObject({ submissions: 2, resolved: 2, correct: 2, score: 2 });
    expect(tallies.get(AGENT_B)).toMatchObject({ submissions: 2, resolved: 1, correct: 0, score: 0 });
    expect(confirmedParentUris).toEqual(new Set([parent, [...ctx.hiddenRecordUris][0]]));
    // Precision: A is 2/2, B is 0/1.
    expect(tallies.get(AGENT_B)!.correct / tallies.get(AGENT_B)!.resolved).toBe(0);
  });

  it("confirms invalid flags via hidden account or round exclusion", () => {
    const target = occUri();
    const ctx = reviewContext({
      hiddenAccountDids: new Set([OWNER]),
      excludedDidsByRound: new Map([[1, new Set(["did:plc:excluded"])]]),
      knownObservationUris: new Set([target]),
    });
    const byHiddenAccount = flag({ parentUri: target });
    const byExclusion = flag({
      parentUri: target,
      flaggedOwnerDid: "did:plc:excluded",
      roundId: 1,
    });
    const wrongRound = flag({
      parentUri: target,
      flaggedOwnerDid: "did:plc:excluded",
      roundId: 2,
    });
    const { tallies } = scoreImageReviewCategory([byHiddenAccount, byExclusion, wrongRound], ctx);
    expect(tallies.get(AGENT_A)).toMatchObject({ submissions: 3, correct: 2 });
  });
});

// ── Queues + standings ──────────────────────────────────────────────────────

describe("queues and standings", () => {
  it("builds queue summaries", () => {
    const problems = Array.from({ length: 7 }, (_, i) =>
      occurrence({ uri: `at://o/app.gainforest.dwc.occurrence/p${i}` }),
    );
    const photoQueue = photoIdQueueSummary(problems);
    expect(photoQueue.category).toBe("photo-id");
    expect(photoQueue.openCount).toBe(7);
    expect(photoQueue.sampleUris).toHaveLength(5);

    const roundObs = [occurrence({ uri: "at://o/app.gainforest.dwc.occurrence/a" })];
    const reviewQueue = imageReviewQueueSummary({
      roundObservations: roundObs,
      flaggedParentUris: new Set([roundObs[0]!.uri]),
      mergedAwayUris: new Set<string>(),
      hiddenRecordUris: new Set<string>(),
      hiddenAccountDids: new Set<string>(),
    });
    expect(reviewQueue.category).toBe("image-review");
    expect(reviewQueue.openCount).toBe(0);
    expect(reviewQueue.sampleUris).toHaveLength(0);
  });

  it("combines categories and owner points into sorted standings", () => {
    const o = occurrence({ cid: "cid-new", scientificName: "Quercus robur" });
    const photoId = scorePhotoIdCategory([o], [
      identification({ subjectUri: o.uri, did: AGENT_A, confidence: 90 }),
    ]);
    const imageReview = scoreImageReviewCategory(
      [flag({ parentUri: o.uri, did: AGENT_B, kind: "invalid" })],
      reviewContext({ hiddenRecordUris: new Set([o.uri]) }),
    );
    const standings = buildStandings(photoId, imageReview);
    expect(standings[0]!.total).toBeGreaterThan(standings[1]!.total);
    const agentA = standings.find((s) => s.did === AGENT_A)!;
    expect(agentA.ownerReviewPoints).toBe(0); // A proposed, OWNER reviews
    expect(agentA.categories.map((c) => c.category)).toEqual(["photo-id", "image-review"]);
  });

  it("assembles a report shape", () => {
    const report = assembleReport([], []);
    expect(report.generatedAt).toBeTruthy();
    expect(report.queues).toEqual([]);
    expect(report.standings).toEqual([]);
  });
});
