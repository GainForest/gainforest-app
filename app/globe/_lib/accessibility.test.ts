import { describe, expect, it } from "vitest";
import { globeMotionSettings, isSheetExpanded, nextSheetButtonSnap, treeListEntries } from "./accessibility";

describe("Globe accessibility helpers", () => {
  it("gives the sheet button one predictable keyboard action and state", () => {
    expect(nextSheetButtonSnap("collapsed")).toBe("full");
    expect(nextSheetButtonSnap("peek")).toBe("full");
    expect(nextSheetButtonSnap("half")).toBe("full");
    expect(nextSheetButtonSnap("full")).toBe("peek");
    expect(isSheetExpanded("collapsed")).toBe(false);
    expect(isSheetExpanded("peek")).toBe(false);
    expect(isSheetExpanded("half")).toBe(true);
    expect(isSheetExpanded("full")).toBe(true);
  });

  it("removes globe motion when reduced motion is requested", () => {
    expect(globeMotionSettings(true, true)).toEqual({
      cameraDuration: 0,
      layerFadeDuration: 0,
      idleSpin: false,
    });
    expect(globeMotionSettings(false, true)).toEqual({
      cameraDuration: 2200,
      layerFadeDuration: 250,
      idleSpin: true,
    });
  });

  it("uses the map features as the source for the keyboard tree list", () => {
    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "tree-1",
          geometry: { type: "Point", coordinates: [7.1, 46.2] },
          properties: { species: "Oak", Height: 4 },
        },
        {
          type: "Feature",
          id: "zero-tree",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { species: "Zero coordinate tree" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [Number.NaN, 1] },
          properties: {},
        },
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
          properties: {},
        },
      ],
    };

    expect(treeListEntries(collection)).toEqual([
      {
        detail: {
          id: "tree-1",
          species: "Oak",
          height: "4m",
          dbh: null,
          date: null,
          notes: null,
          photos: [],
        },
        coordinates: [7.1, 46.2],
      },
      {
        detail: {
          id: "zero-tree",
          species: "Zero coordinate tree",
          height: null,
          dbh: null,
          date: null,
          notes: null,
          photos: [],
        },
        coordinates: [0, 0],
      },
    ]);
  });
});
