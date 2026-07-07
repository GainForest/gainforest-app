import { describe, expect, it } from "vitest";
import type { GlobeLayer, GlobeLayerGroup, LngLatBounds } from "./globe-types";
import { buildDroneTimeSeries, overlapRatio } from "./time-series";

function flight(
  name: string,
  capturedAt: string | null,
  bounds: LngLatBounds | null,
  type: GlobeLayer["type"] = "raster_tif",
  groupRef: string | null = null,
): GlobeLayer {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    type,
    endpoint: `layers/test/${name}.tif`,
    description: "",
    category: "test",
    bounds,
    capturedAt,
    groupRef,
  };
}

function area(uri: string, name: string, bounds: LngLatBounds | null = null): GlobeLayerGroup {
  return { uri, name, description: "", bounds };
}

// Real footprints published by Oceanus Conservation (PH mangrove sites).
const TUMANAN_1 = flight("Tumanan (2025-04-09)", "2025-04-09", [126.34303096, 8.25476583, 126.35745156, 8.26481389]);
const TUMANAN_2 = flight("Tumanan (2025-08-16)", "2025-08-16", [126.34316366, 8.25481846, 126.35747229, 8.26445468]);
const TUMANAN_3 = flight("Tumanan (2025-10-14)", "2025-10-14", [126.34345254, 8.25471625, 126.35772009, 8.26462226]);
const CAGUYAO_SMALL = flight("Caguyao (2024-12-03)", "2024-12-03", [126.36508075, 8.27471238, 126.36975213, 8.27794736]);
const CAGUYAO_BIG = flight("Caguyao (2025-03-28)", "2025-03-28", [126.35879031, 8.26734954, 126.3722052, 8.28327838]);
// Four adjacent family plots flown in one two-day campaign — NOT a time series.
const BUCTO_SANCHEZ = flight("Bucto - Sanchez (2025-03-19)", "2025-03-19", [126.32995187, 8.24599899, 126.33238288, 8.24889894]);
const BUCTO_SOTTO = flight("Bucto - Sotto (2025-03-19)", "2025-03-19", [126.33060627, 8.24773014, 126.33394763, 8.25102213]);
const BUCTO_CAJES = flight("Bucto - Cajes (2025-03-19)", "2025-03-19", [126.33118166, 8.24652129, 126.33378806, 8.24928362]);
const BUCTO_ACEVEDO = flight("Bucto - Acevedo (2025-03-20)", "2025-03-20", [126.33219194, 8.24828278, 126.33536819, 8.25162354]);

describe("overlapRatio", () => {
  it("is 1 when one footprint contains the other", () => {
    expect(overlapRatio(CAGUYAO_SMALL.bounds!, CAGUYAO_BIG.bounds!)).toBeCloseTo(1, 5);
  });

  it("is ~1 for repeat flights of the same area", () => {
    expect(overlapRatio(TUMANAN_1.bounds!, TUMANAN_2.bounds!)).toBeGreaterThan(0.9);
    expect(overlapRatio(TUMANAN_2.bounds!, TUMANAN_3.bounds!)).toBeGreaterThan(0.9);
  });

  it("is 0 for disjoint footprints", () => {
    expect(overlapRatio(TUMANAN_1.bounds!, CAGUYAO_SMALL.bounds!)).toBe(0);
  });

  it("stays below the grouping bar for adjacent plots on different days", () => {
    expect(overlapRatio(BUCTO_SANCHEZ.bounds!, BUCTO_ACEVEDO.bounds!)).toBeLessThan(0.5);
    expect(overlapRatio(BUCTO_SOTTO.bounds!, BUCTO_ACEVEDO.bounds!)).toBeLessThan(0.5);
    expect(overlapRatio(BUCTO_CAJES.bounds!, BUCTO_ACEVEDO.bounds!)).toBeLessThan(0.5);
  });
});

describe("buildDroneTimeSeries", () => {
  const all = [
    TUMANAN_1, TUMANAN_2, TUMANAN_3,
    CAGUYAO_SMALL, CAGUYAO_BIG,
    BUCTO_SANCHEZ, BUCTO_SOTTO, BUCTO_CAJES, BUCTO_ACEVEDO,
  ];

  it("groups repeat flights into per-area series and skips one-off plots", () => {
    const series = buildDroneTimeSeries(all);
    expect(series.map((entry) => entry.name).sort()).toEqual(["Caguyao", "Tumanan"]);

    const tumanan = series.find((entry) => entry.name === "Tumanan")!;
    expect(tumanan.layers.map((layer) => layer.capturedAt)).toEqual([
      "2025-04-09", "2025-08-16", "2025-10-14",
    ]);
    expect(tumanan.steps).toHaveLength(3);
    expect(tumanan.steps[0]!.layerIds).toEqual([TUMANAN_1.id]);

    const caguyao = series.find((entry) => entry.name === "Caguyao")!;
    expect(caguyao.steps.map((step) => step.date)).toEqual(["2024-12-03", "2025-03-28"]);
  });

  it("never promotes same-day overlaps (adjacent plots) to a series", () => {
    const series = buildDroneTimeSeries([BUCTO_SANCHEZ, BUCTO_SOTTO, BUCTO_CAJES, BUCTO_ACEVEDO]);
    expect(series).toEqual([]);
  });

  it("unions member footprints into the series bounds", () => {
    const [caguyao] = buildDroneTimeSeries([CAGUYAO_SMALL, CAGUYAO_BIG]);
    expect(caguyao!.bounds).toEqual(CAGUYAO_BIG.bounds);
  });

  it("ignores non-raster layers and layers without bounds or dates", () => {
    const delineations = flight(
      "Tree Delineations Orthomosaic 2024-08-21",
      "2024-08-21",
      [126.3074737, 8.92067719, 126.30930274, 8.92242867],
      "geojson_line",
    );
    const undated = flight("Tumanan (undated)", null, TUMANAN_2.bounds!);
    const unbounded = flight("Tumanan (2025-08-16) v2", "2025-08-16", null);
    expect(buildDroneTimeSeries([delineations, undated, unbounded, TUMANAN_1])).toEqual([]);
  });

  it("keeps flights sorted oldest-first regardless of input order", () => {
    const [series] = buildDroneTimeSeries([TUMANAN_3, TUMANAN_1, TUMANAN_2]);
    expect(series!.layers.map((layer) => layer.id)).toEqual([
      TUMANAN_1.id, TUMANAN_2.id, TUMANAN_3.id,
    ]);
  });
});

describe("buildDroneTimeSeries — declared layer groups", () => {
  const GROUP_URI = "at://did:plc:test/app.gainforest.organization.layerGroup/tumanan";

  it("builds a series from groupRef members, named after the group", () => {
    const a = flight("Flight A", "2025-04-09", TUMANAN_1.bounds!, "raster_tif", GROUP_URI);
    const b = flight("Flight B", "2025-08-16", TUMANAN_2.bounds!, "raster_tif", GROUP_URI);
    const [series] = buildDroneTimeSeries([a, b], [area(GROUP_URI, "Tumanan Mangroves")]);
    expect(series!.id).toBe(GROUP_URI);
    expect(series!.name).toBe("Tumanan Mangroves");
    expect(series!.steps.map((step) => step.date)).toEqual(["2025-04-09", "2025-08-16"]);
  });

  it("lets vector products of the same survey share the raster's slider stop", () => {
    const ortho = flight("Ortho", "2025-04-09", TUMANAN_1.bounds!, "raster_tif", GROUP_URI);
    const lines = flight("Delineations", "2025-04-09", TUMANAN_1.bounds!, "geojson_line", GROUP_URI);
    const later = flight("Ortho 2", "2025-08-16", TUMANAN_2.bounds!, "raster_tif", GROUP_URI);
    const [series] = buildDroneTimeSeries([ortho, lines, later], [area(GROUP_URI, "Tumanan")]);
    expect(series!.steps[0]!.layerIds.sort()).toEqual([lines.id, ortho.id].sort());
    expect(series!.steps[1]!.layerIds).toEqual([later.id]);
  });

  it("declared grouping beats geometric inference — overlapping members of two groups never merge", () => {
    const otherUri = "at://did:plc:test/app.gainforest.organization.layerGroup/other";
    // Same footprint, different declared areas: the heuristic would merge them.
    const a1 = flight("A1", "2025-01-01", TUMANAN_1.bounds!, "raster_tif", GROUP_URI);
    const a2 = flight("A2", "2025-02-01", TUMANAN_1.bounds!, "raster_tif", GROUP_URI);
    const b1 = flight("B1", "2025-01-15", TUMANAN_1.bounds!, "raster_tif", otherUri);
    const b2 = flight("B2", "2025-02-15", TUMANAN_1.bounds!, "raster_tif", otherUri);
    const series = buildDroneTimeSeries(
      [a1, a2, b1, b2],
      [area(GROUP_URI, "Area A"), area(otherUri, "Area B")],
    );
    expect(series.map((entry) => entry.name).sort()).toEqual(["Area A", "Area B"]);
    expect(series.every((entry) => entry.layers.length === 2)).toBe(true);
  });

  it("keeps single-day declared groups out of both the series list and the heuristic", () => {
    const a = flight("Same day A", "2025-04-09", TUMANAN_1.bounds!, "raster_tif", GROUP_URI);
    const b = flight("Same day B", "2025-04-09", TUMANAN_2.bounds!, "raster_tif", GROUP_URI);
    expect(buildDroneTimeSeries([a, b], [area(GROUP_URI, "Tumanan")])).toEqual([]);
  });

  it("falls back to the group's own bounds when members carry none", () => {
    const a = flight("No bounds A", "2025-04-09", null, "raster_tif", GROUP_URI);
    const b = flight("No bounds B", "2025-08-16", null, "raster_tif", GROUP_URI);
    const [series] = buildDroneTimeSeries([a, b], [area(GROUP_URI, "Tumanan", TUMANAN_1.bounds!)]);
    expect(series!.bounds).toEqual(TUMANAN_1.bounds);
  });

  it("still infers geometrically for layers without a resolvable group", () => {
    const dangling = { ...CAGUYAO_SMALL, groupRef: "at://did:plc:test/app.gainforest.organization.layerGroup/gone" };
    const series = buildDroneTimeSeries([dangling, CAGUYAO_BIG], []);
    expect(series).toHaveLength(1);
    expect(series[0]!.name).toBe("Caguyao");
  });
});
