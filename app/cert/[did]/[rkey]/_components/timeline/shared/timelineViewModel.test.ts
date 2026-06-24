import { describe, expect, it } from "vitest";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import type { TimelineReferenceCopy } from "../timelineReferences";
import type { TimelineFeedCopy } from "./timelineFeedViewModel";
import {
  buildTimelineEntryViewModels,
  getFilteredTimelineEntries,
  getTimelineFilterCounts,
  paginateTimelineEntries,
} from "./timelineViewModel";

const referenceCopy: TimelineReferenceCopy = {
  linkedRecord: "Linked record",
  linkedAudioRecord: "Linked sound",
  audioEvidence: "Sound evidence",
  linkedDataset: "Linked tree group",
  linkedTreeRecord: "Linked tree record",
  linkedSiteRecord: "Linked project place",
  siteEvidence: "Project place evidence",
  linkedNatureData: "Linked nature data",
  treeCount: (count) => `${count} trees`,
  speciesCount: (count) => `${count} species`,
  observationCount: (count) => `${count} sightings`,
  individualCount: (count) => `${count} individuals`,
};

const feedCopy: TimelineFeedCopy = {
  linkedNatureDataGroup: "Linked nature data group",
  linkedNatureData: "Linked nature data",
  linkedFile: "Linked file",
  image: "Image",
  video: "Video",
  audio: "Sound",
  pdf: "PDF",
  document: "Document",
  linkedTreeInformation: "Linked tree information",
  linkedItem: "Linked evidence",
  linkedProjectPlace: "Linked project place",
  linkedTreeGroup: "Linked tree group",
  linkedSound: "Linked sound",
  groupedData: "Grouped data",
  unresolvedReferenceBody: "This linked evidence could not be loaded yet.",
};

const emptySources = {
  audio: [],
  occurrences: [],
  occurrencesIncomplete: false,
  treeGroups: [],
  places: [],
};

function attachment(rkey: string, contentType: string | null, content: unknown): TimelineAttachmentItem {
  return {
    metadata: {
      did: "did:example:org",
      uri: `at://did:example:org/org.hypercerts.context.attachment/${rkey}`,
      rkey,
      cid: null,
      createdAt: null,
      indexedAt: null,
    },
    creatorInfo: null,
    record: {
      title: null,
      shortDescription: null,
      description: null,
      contentType,
      subjects: null,
      content,
      createdAt: null,
    },
  };
}

function uriContent(uri: string) {
  return { $type: "org.hypercerts.defs#uri", uri };
}

describe("timeline view model", () => {
  it("builds shared entry models with filter counts and pagination", () => {
    const entries = [
      attachment("trees", "tree-dataset", [uriContent("at://did:example:org/app.gainforest.dwc.dataset/trees")]),
      attachment("sounds", "audio", [uriContent("at://did:example:org/app.gainforest.ac.audio/sound")]),
      attachment("nature", "biodiversity", [uriContent("at://did:example:org/app.gainforest.dwc.occurrence/nature")]),
      attachment("file", "document", [{ $type: "org.hypercerts.defs#uri", uri: "https://example.org/report.pdf" }]),
    ];

    const models = buildTimelineEntryViewModels({
      entries,
      sources: emptySources,
      providedReferences: [],
      referenceCopy,
      feedCopy,
    });
    const counts = getTimelineFilterCounts(models);

    expect(models.map((model) => model.kind)).toEqual(["tree", "audio", "nature", "file"]);
    expect(counts.get("tree")).toBe(1);
    expect(counts.get("audio")).toBe(1);
    expect(counts.get("nature")).toBe(1);
    expect(counts.get("file")).toBe(1);
    expect(getFilteredTimelineEntries(models, "audio").map((model) => model.item.metadata.rkey)).toEqual(["sounds"]);
    expect(paginateTimelineEntries(models, 2, 2)).toMatchObject({
      totalPages: 2,
      safePage: 2,
      visibleItems: [models[2], models[3]],
    });
  });
});
