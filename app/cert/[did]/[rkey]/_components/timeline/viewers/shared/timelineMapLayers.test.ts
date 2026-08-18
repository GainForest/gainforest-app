import { describe, expect, it } from "vitest";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import type { TimelineReference } from "../../timelineReferences";
import { getTimelineMapLayerState } from "./timelineMapLayerState";
import { buildTimelineMapLayers, type TimelineMapLayer } from "./timelineMapLayers";

const activitySubject = {
  uri: "at://did:plc:org/org.hypercerts.claim.activity/activity-1",
  cid: "bafy-activity",
};
const siteSubject = {
  uri: "at://did:plc:org/app.certified.location/site-1",
  cid: "bafy-site",
};

function makeAttachment(subjects = [activitySubject, siteSubject]): TimelineAttachmentItem {
  return {
    metadata: {
      did: "did:plc:org",
      uri: "at://did:plc:org/org.hypercerts.context.attachment/att-1",
      rkey: "att-1",
      cid: "bafy-att",
      createdAt: null,
      indexedAt: null,
    },
    creatorInfo: null,
    record: {
      title: "Tree evidence",
      shortDescription: null,
      description: null,
      contentType: "tree-dataset",
      subjects,
      content: [],
      createdAt: null,
    },
  };
}

function makeTreeReference(
  id: string,
  title: string,
  overrides: Partial<TimelineReference> = {},
): TimelineReference {
  return {
    id,
    kind: "tree",
    title,
    description: "10 trees",
    treeGroupUri: id,
    ...overrides,
  };
}

describe("timeline map layers", () => {
  it("builds tree dataset layers with linked site context", () => {
    const datasetUri = "at://did:plc:org/app.gainforest.dwc.dataset/dataset-1";

    expect(
      buildTimelineMapLayers([
        {
          item: makeAttachment(),
          references: [makeTreeReference(datasetUri, "Restoration trees")],
        },
      ]),
    ).toEqual([
      {
        datasetUri,
        title: "Restoration trees",
        description: "10 trees",
        siteRef: siteSubject,
      },
    ]);
  });

  it("dedupes repeated tree dataset layers", () => {
    const datasetUri = "at://did:plc:org/app.gainforest.dwc.dataset/dataset-1";

    expect(
      buildTimelineMapLayers([
        {
          item: makeAttachment(),
          references: [
            makeTreeReference(datasetUri, "Restoration trees"),
            makeTreeReference(datasetUri, "Duplicate trees"),
          ],
        },
      ]),
    ).toHaveLength(1);
  });

  it("ignores non-tree and non-dataset references", () => {
    expect(
      buildTimelineMapLayers([
        {
          item: makeAttachment([activitySubject]),
          references: [
            makeTreeReference(
              "at://did:plc:org/app.gainforest.dwc.occurrence/tree-1",
              "One tree",
            ),
            {
              id: "at://did:plc:org/app.gainforest.dwc.dataset/nature-1",
              kind: "biodiversityDataset",
              title: "Nature data",
            },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("summarizes active and hidden map layer state", () => {
    const activeUri = "at://did:plc:org/app.gainforest.dwc.dataset/active";
    const hiddenUri = "at://did:plc:org/app.gainforest.dwc.dataset/hidden";
    const layers: TimelineMapLayer[] = [
      {
        datasetUri: activeUri,
        title: "Active trees",
        siteRef: null,
      },
      {
        datasetUri: hiddenUri,
        title: "Hidden trees",
        siteRef: null,
      },
    ];

    const state = getTimelineMapLayerState(layers, { [activeUri]: true });

    expect(state.activeCount).toBe(1);
    expect(state.hiddenCount).toBe(1);
    expect(state.activeLayers.map((layer) => layer.datasetUri)).toEqual([activeUri]);
    expect(state.hiddenLayers.map((layer) => layer.datasetUri)).toEqual([hiddenUri]);
  });
});
