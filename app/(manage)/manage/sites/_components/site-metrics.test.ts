import { describe, expect, it } from "vitest";
import { computeSiteMetrics } from "./site-metrics";

const polygon = (coordinates: GeoJSON.Position[][]): GeoJSON.Polygon => ({ type: "Polygon", coordinates });
const square = (lon: number, lat: number, size: number): GeoJSON.Position[] => [
  [lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat],
];

describe("computeSiteMetrics", () => {
  it("subtracts polygon holes", () => {
    const outerOnly = computeSiteMetrics(polygon([square(0, 0, 1)]));
    const withHole = computeSiteMetrics(polygon([square(0, 0, 1), square(0.25, 0.25, 0.5)]));
    expect(outerOnly && outerOnly !== "Invalid" ? outerOnly.area : 0).toBeGreaterThan(0);
    expect(withHole && withHole !== "Invalid" ? withHole.area : 0).toBeCloseTo(
      (outerOnly && outerOnly !== "Invalid" ? outerOnly.area : 0) * 0.75,
      -1,
    );
  });

  it("uses geodesic longitude scaling at high latitude", () => {
    const equator = computeSiteMetrics(polygon([square(0, 0, 1)]));
    const highLatitude = computeSiteMetrics(polygon([square(0, 70, 1)]));
    const equatorArea = equator && equator !== "Invalid" ? equator.area : 0;
    const highArea = highLatitude && highLatitude !== "Invalid" ? highLatitude.area : 0;
    expect(highArea).toBeGreaterThan(0);
    expect(highArea).toBeLessThan(equatorArea * 0.4);
  });

  it("returns Invalid for geometry without coordinates", () => {
    expect(computeSiteMetrics({ type: "GeometryCollection", geometries: [] })).toBe("Invalid");
  });
});
