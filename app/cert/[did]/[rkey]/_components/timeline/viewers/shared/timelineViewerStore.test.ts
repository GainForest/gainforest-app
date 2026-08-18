import { describe, expect, it } from "vitest";
import {
  createTimelineViewerState,
  setTimelineMapLayerActive,
} from "./timelineViewerStore";

describe("timeline viewer map layer state", () => {
  it("keeps multiple shown layers and focuses the one most recently shown", () => {
    let state = createTimelineViewerState();

    expect(state.hasMountedGreenGlobePreview).toBe(false);

    state = setTimelineMapLayerActive(state, "dataset-one", true);
    state = setTimelineMapLayerActive(state, "dataset-two", true);

    expect(state.hasMountedGreenGlobePreview).toBe(true);
    expect(state.activeMapLayerByDatasetUri).toEqual({
      "dataset-one": true,
      "dataset-two": true,
    });
    expect(state.focusedMapLayerDatasetUri).toBe("dataset-two");
  });

  it("keeps focus when hiding a different active layer", () => {
    let state = createTimelineViewerState();

    state = setTimelineMapLayerActive(state, "dataset-one", true);
    state = setTimelineMapLayerActive(state, "dataset-two", true);
    state = setTimelineMapLayerActive(state, "dataset-one", false);

    expect(state.activeMapLayerByDatasetUri).toEqual({
      "dataset-two": true,
    });
    expect(state.focusedMapLayerDatasetUri).toBe("dataset-two");
  });

  it("falls back to another shown layer or clears focus when hiding the focused layer", () => {
    let state = createTimelineViewerState();

    state = setTimelineMapLayerActive(state, "dataset-one", true);
    state = setTimelineMapLayerActive(state, "dataset-two", true);
    state = setTimelineMapLayerActive(state, "dataset-two", false);

    expect(state.activeMapLayerByDatasetUri).toEqual({
      "dataset-one": true,
    });
    expect(state.focusedMapLayerDatasetUri).toBe("dataset-one");

    state = setTimelineMapLayerActive(state, "dataset-one", false);

    expect(state.activeMapLayerByDatasetUri).toEqual({});
    expect(state.focusedMapLayerDatasetUri).toBeNull();
    expect(state.hasMountedGreenGlobePreview).toBe(true);
  });
});
