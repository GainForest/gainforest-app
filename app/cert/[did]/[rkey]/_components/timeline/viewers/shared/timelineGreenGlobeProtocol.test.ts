import { describe, expect, it } from "vitest";
import {
  buildTimelineGreenGlobeDatasetLayersMessage,
  buildTimelineGreenGlobeIframeSrc,
  getGreenGlobePreviewTargetOrigin,
  GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE,
  GREEN_GLOBE_PREVIEW_SET_DATASET_LAYERS_MESSAGE_TYPE,
  isGreenGlobePreviewReadyMessage,
} from "./timelineGreenGlobeProtocol";
import type { TimelineMapLayer } from "./timelineMapLayers";

const datasetOne = "at://did:plc:org/app.gainforest.dwc.dataset/dataset-1";
const datasetTwo = "at://did:plc:org/app.gainforest.dwc.dataset/dataset-2";

const layers: TimelineMapLayer[] = [
  {
    datasetUri: datasetOne,
    title: "Restoration trees",
    description: "2 trees",
    siteRef: {
      uri: "at://did:plc:org/app.certified.location/site-1",
      cid: "bafy-site-1",
    },
  },
  {
    datasetUri: datasetTwo,
    title: "Mangrove trees",
    siteRef: null,
  },
];

describe("timeline Green Globe preview protocol", () => {
  it("builds an iframe URL that starts with an empty map preview", () => {
    const href = buildTimelineGreenGlobeIframeSrc(
      "http://localhost:8910/embed/did%3Aplc%3Aorg",
    );
    const url = new URL(href);

    expect(url.pathname).toBe("/embed/did%3Aplc%3Aorg");
    expect(url.searchParams.get("preview-mode")).toBe("none");
    expect(url.searchParams.getAll("dataset-ref")).toEqual([]);
  });

  it("builds dataset-layer messages with active refs and site context", () => {
    const message = buildTimelineGreenGlobeDatasetLayersMessage({
      projectDid: "did:plc:org",
      layers,
      activeDatasetRefs: [datasetOne, datasetTwo, datasetOne, "unknown"],
      focusedDatasetRef: datasetTwo,
      requestId: "request-1",
    });

    expect(message.type).toBe(GREEN_GLOBE_PREVIEW_SET_DATASET_LAYERS_MESSAGE_TYPE);
    expect(message.activeDatasetRefs).toEqual([datasetOne, datasetTwo]);
    expect(message.datasetLayers).toEqual([
      {
        datasetRef: datasetOne,
        title: "Restoration trees",
        siteRef: layers[0]?.siteRef,
      },
      {
        datasetRef: datasetTwo,
        title: "Mangrove trees",
        siteRef: null,
      },
    ]);
    expect(message.focusedDatasetRef).toBe(datasetTwo);
    expect(message.emptySelection).toBe("clear");
    expect(message.view.fit).toBe("active-dataset-bounds");
  });

  it("clears active refs and preserves the current view when all layers are hidden", () => {
    const message = buildTimelineGreenGlobeDatasetLayersMessage({
      projectDid: "did:plc:org",
      layers,
      activeDatasetRefs: [],
      focusedDatasetRef: datasetOne,
      requestId: "request-2",
    });

    expect(message.activeDatasetRefs).toEqual([]);
    expect(message.focusedDatasetRef).toBeNull();
    expect(message.emptySelection).toBe("clear");
    expect(message.view.fit).toBe("preserve");
  });

  it("extracts a strict message target origin", () => {
    expect(getGreenGlobePreviewTargetOrigin("http://localhost:8910/embed/did")).toBe(
      "http://localhost:8910",
    );
    expect(getGreenGlobePreviewTargetOrigin("not a url")).toBeNull();
  });

  it("requires ready messages to match the active project", () => {
    expect(
      isGreenGlobePreviewReadyMessage(
        {
          type: GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE,
          version: 1,
          projectDid: "did:plc:org",
        },
        "did:plc:org",
      ),
    ).toBe(true);

    expect(
      isGreenGlobePreviewReadyMessage(
        {
          type: GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE,
          version: 1,
          projectDid: "did:plc:other",
        },
        "did:plc:org",
      ),
    ).toBe(false);
  });
});
