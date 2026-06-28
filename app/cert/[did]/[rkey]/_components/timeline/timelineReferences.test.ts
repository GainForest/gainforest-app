import { describe, expect, it } from "vitest";
import type { ManagedLocation, OccurrenceRecord, TimelineAttachmentItem, TimelineDatasetRecord } from "@/app/_lib/indexer";
import { buildTimelineReferences, collectTimelineReferenceLookupInput, type TimelineReferenceCopy } from "./timelineReferences";

const copy: TimelineReferenceCopy = {
  linkedRecord: "Linked record",
  linkedAudioRecord: "Linked audio record",
  audioEvidence: "Audio evidence",
  linkedDataset: "Linked dataset",
  linkedTreeRecord: "Linked tree record",
  linkedSiteRecord: "Linked site record",
  siteEvidence: "Site evidence",
  linkedNatureData: "Linked nature data",
  treeCount: (count) => `${count} tree${count === 1 ? "" : "s"}`,
  speciesCount: (count) => `${count} species`,
  observationCount: (count) => `${count} observation${count === 1 ? "" : "s"}`,
  individualCount: (count) => `${count} individual${count === 1 ? "" : "s"}`,
};

function attachment(args: {
  contentType?: string | null;
  contentUris?: string[];
  subjectUris?: string[];
}): TimelineAttachmentItem {
  return {
    metadata: { did: "did:example:org", uri: null, rkey: null, cid: null, createdAt: null, indexedAt: null },
    creatorInfo: null,
    record: {
      title: null,
      shortDescription: null,
      description: null,
      contentType: args.contentType ?? null,
      subjects: (args.subjectUris ?? []).map((uri, index) => ({ uri, cid: `cid-${index}` })),
      content: (args.contentUris ?? []).map((uri) => ({ $type: "org.hypercerts.defs#uri", uri })),
      createdAt: null,
    },
  };
}

function occurrence(overrides: Partial<OccurrenceRecord> = {}): OccurrenceRecord {
  return {
    kind: "occurrence",
    id: "occ-1",
    did: "did:example:org",
    rkey: "occ-1",
    cid: "occ-cid",
    atUri: "at://did:example:org/app.gainforest.dwc.occurrence/occ-1",
    scientificName: "Ficus testus",
    vernacularName: null,
    kingdom: "Plantae",
    family: null,
    genus: null,
    basisOfRecord: null,
    recordedBy: null,
    individualCount: 3,
    country: null,
    countryCode: null,
    stateProvince: null,
    locality: null,
    lat: null,
    lon: null,
    coordinateUncertaintyInMeters: null,
    eventDate: "2024-05-01",
    habitat: null,
    siteRef: "at://did:example:org/app.certified.location/site-1",
    datasetRef: "at://did:example:org/app.gainforest.dwc.dataset/dataset-1",
    datasetName: null,
    dynamicProperties: null,
    establishmentMeans: "planted",
    createdAt: "2024-05-02T00:00:00.000Z",
    creatorName: null,
    creatorAvatarRef: null,
    remarks: null,
    imageUrl: null,
    imageRef: null,
    audioRef: null,
    audioUrl: null,
    media: [],
    ...overrides,
  };
}

describe("timeline reference inputs", () => {
  it("collects content references and certified place context without using the activity subject", () => {
    const input = collectTimelineReferenceLookupInput([
      attachment({
        contentUris: [
          "at://did:example:org/app.gainforest.ac.audio/audio-1",
          "at://did:example:org/app.gainforest.dwc.dataset/dataset-1",
          "https://example.org/report.pdf",
        ],
        subjectUris: [
          "at://did:example:org/org.hypercerts.claim.activity/activity-1",
          "at://did:example:org/app.certified.location/site-1",
        ],
      }),
    ]);

    expect(input).toEqual({
      audioUris: ["at://did:example:org/app.gainforest.ac.audio/audio-1"],
      occurrenceUris: [],
      datasetUris: ["at://did:example:org/app.gainforest.dwc.dataset/dataset-1"],
      locationUris: ["at://did:example:org/app.certified.location/site-1"],
    });
  });
});

describe("timeline reference view models", () => {
  it("builds a tree dataset reference from URI-resolved dataset and occurrence records", () => {
    const datasetUri = "at://did:example:org/app.gainforest.dwc.dataset/dataset-1";
    const dataset: TimelineDatasetRecord = {
      metadata: { did: "did:example:org", uri: datasetUri, rkey: "dataset-1", cid: "dataset-cid", createdAt: "2024-05-01T00:00:00.000Z" },
      record: { name: "Restoration trees", description: null, recordCount: 99, createdAt: "2024-05-01T00:00:00.000Z" },
    };
    const place: ManagedLocation = {
      metadata: { did: "did:example:org", uri: "at://did:example:org/app.certified.location/site-1", rkey: "site-1", cid: "site-cid", createdAt: null },
      record: { name: "North slope", description: null, locationType: "Project place", location: null },
    };

    const refs = buildTimelineReferences({
      entries: [attachment({ contentType: "tree-dataset", contentUris: [datasetUri], subjectUris: ["at://did:example:org/org.hypercerts.claim.activity/activity-1", place.metadata.uri] })],
      audio: [],
      occurrences: [occurrence()],
      treeGroups: [dataset],
      places: [place],
      copy,
    });

    expect(refs.map((ref) => [ref.id, ref.kind, ref.title])).toEqual([
      [datasetUri, "tree", "Restoration trees"],
      [place.metadata.uri, "location", "North slope"],
    ]);
    expect(refs[0]?.metrics).toMatchObject({ treeCount: 99, speciesCount: 1 });
    expect(refs[0]?.mapHref).toContain(encodeURIComponent(datasetUri));
  });
});
