import { describe, expect, it } from "vitest";
import { findTreeByShareKey, parseTreeShareKey, treeShareKey } from "./trees";

function tree(lon: number, lat: number, properties: Record<string, unknown> = {}): GeoJSON.Feature {
  return {
    type: "Feature",
    id: `${lon},${lat}`,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties,
  };
}

function collection(...features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("treeShareKey", () => {
  it("writes a lon,lat key a link can carry", () => {
    expect(treeShareKey(34.3412035, 1.0739864)).toBe("34.341203,1.073986");
  });

  it("round-trips through a shared link", () => {
    const key = treeShareKey(-72.123456, -3.5);
    expect(parseTreeShareKey(key)).toEqual({ lon: -72.123456, lat: -3.5 });
  });

  it("refuses keys that are not a coordinate", () => {
    expect(parseTreeShareKey(null)).toBeNull();
    expect(parseTreeShareKey("")).toBeNull();
    expect(parseTreeShareKey("somewhere nice")).toBeNull();
    expect(parseTreeShareKey("34.34")).toBeNull();
    expect(parseTreeShareKey("340.5,12.0")).toBeNull();
  });
});

describe("findTreeByShareKey", () => {
  const trees = collection(
    tree(34.3412035, 1.0739864, { species: "Agrocapass", Height: 0.9 }),
    tree(34.3417662, 1.0752058, { Plant_Name: "caliandra" }),
    tree(-72.5, -3.5),
  );

  it("opens the tree the link points at", () => {
    const found = findTreeByShareKey(trees, "34.341766,1.075206");
    expect(found?.species).toBe("Caliandra");
    expect(found?.lon).toBeCloseTo(34.3417662, 6);
  });

  it("still finds a tree whose position shifted slightly on re-upload", () => {
    // ~5m away — the same tree, re-measured.
    expect(findTreeByShareKey(trees, "34.341244,1.073996")?.species).toBe("Agrocapass");
  });

  it("picks the closest tree when several are near the link", () => {
    const crowded = collection(tree(10, 10), tree(10.00002, 10), tree(10.00005, 10));
    expect(findTreeByShareKey(crowded, "10.000021,10.000000")?.lon).toBeCloseTo(10.00002, 6);
  });

  it("returns nothing when the link points somewhere with no tree", () => {
    expect(findTreeByShareKey(trees, "0.000000,0.000000")).toBeNull();
    expect(findTreeByShareKey(trees, "not-a-place")).toBeNull();
    expect(findTreeByShareKey(null, "34.341766,1.075206")).toBeNull();
  });
});
