import { describe, expect, it } from "vitest";
import {
  APPROXIMATE_FUZZ_DEGREES,
  circlePolygonFeature,
  clipLocationName,
  coarsePlaceLabel,
  fuzzCoordinate,
  publishedLocationName,
  type OrgLocationChoice,
} from "./org-location-geometry";

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const place = (over: Partial<OrgLocationChoice["place"]> = {}): OrgLocationChoice["place"] => ({
  name: "1037/4 Tambon Nai Mueang, Nong Khai, Thailand",
  latitude: 17.8807,
  longitude: 102.734,
  countryCode: "TH",
  region: "Nong Khai Province",
  country: "Thailand",
  kind: "place",
  ...over,
});

describe("fuzzCoordinate", () => {
  it("stays within the advertised per-axis offset", () => {
    for (let i = 0; i < 200; i++) {
      const out = fuzzCoordinate(17.8807, 102.734);
      expect(Math.abs(out.latitude - 17.8807)).toBeLessThanOrEqual(APPROXIMATE_FUZZ_DEGREES);
      expect(Math.abs(out.longitude - 102.734)).toBeLessThanOrEqual(APPROXIMATE_FUZZ_DEGREES);
    }
  });

  it("clamps latitude and wraps longitude at the antimeridian", () => {
    const nearPole = fuzzCoordinate(89.99, 0, () => 1);
    expect(nearPole.latitude).toBeLessThanOrEqual(90);
    const nearWrap = fuzzCoordinate(0, 179.95, () => 1);
    expect(nearWrap.longitude).toBeGreaterThanOrEqual(-180);
    expect(nearWrap.longitude).toBeLessThanOrEqual(180);
  });
});

describe("circlePolygonFeature", () => {
  it("builds a closed ring of the requested radius", () => {
    const feature = circlePolygonFeature(17.8807, 102.734);
    const ring = feature.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const vertex of ring.slice(0, -1)) {
      const distance = haversineKm(vertex as [number, number], [102.734, 17.8807]);
      expect(distance).toBeGreaterThan(9.5);
      expect(distance).toBeLessThan(10.5);
    }
  });
});

describe("coarsePlaceLabel", () => {
  it("prefers region + country, deduplicating identical values", () => {
    expect(coarsePlaceLabel({ region: "Nong Khai Province", country: "Thailand" })).toBe(
      "Nong Khai Province, Thailand",
    );
    expect(coarsePlaceLabel({ region: null, country: "Thailand" })).toBe("Thailand");
    expect(coarsePlaceLabel({ region: "Singapore", country: "Singapore" })).toBe("Singapore");
    expect(coarsePlaceLabel({ region: null, country: null })).toBeNull();
  });
});

describe("publishedLocationName", () => {
  it("publishes the exact name for exact locations", () => {
    expect(publishedLocationName({ place: place(), approximate: false })).toBe(place().name);
  });

  it("never publishes the precise name for approximate locations", () => {
    const name = publishedLocationName({ place: place(), approximate: true });
    expect(name).toBe("Nong Khai Province, Thailand");
    expect(name).not.toContain("1037/4");
  });

  it("publishes no name when nothing coarse is known", () => {
    const bare = place({ region: null, country: null });
    expect(publishedLocationName({ place: bare, approximate: true })).toBeNull();
  });

  it("clips names to the lexicon's grapheme budget", () => {
    const long = place({ name: "x".repeat(400) });
    const clipped = publishedLocationName({ place: long, approximate: false })!;
    expect([...clipped].length).toBeLessThanOrEqual(100);
  });
});
