import { describe, expect, it } from "vitest";

import {
  buildObservationLocationFields,
  fuzzLocation,
  radiusForArea,
} from "./fuzzy-location";

const TRUE_POINT = { lat: 37.8083333, lng: -122.4194444 };
const METERS_PER_DEGREE_LAT = 111_320;

/** Deterministic RNG so the geometry assertions are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Equirectangular distance in metres, matching the module's approximation. */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * METERS_PER_DEGREE_LAT;
  const dLng = (b.lng - a.lng) * METERS_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

describe("fuzzLocation", () => {
  it("keeps the true point inside the published circle", () => {
    const random = mulberry32(1);
    for (let i = 0; i < 200; i += 1) {
      const fuzzed = fuzzLocation(TRUE_POINT, 500, random);
      const offset = distanceMeters(TRUE_POINT, fuzzed.centroid);
      // The true point must remain inside the circle drawn around the centroid.
      expect(offset).toBeLessThanOrEqual(fuzzed.radiusMeters + 1);
    }
  });

  it("offsets the centroid away from the true point (centre is never home)", () => {
    const random = mulberry32(2);
    for (let i = 0; i < 200; i += 1) {
      const fuzzed = fuzzLocation(TRUE_POINT, 500, random);
      const offset = distanceMeters(TRUE_POINT, fuzzed.centroid);
      // Centroid is offset by at least the minimum fraction (0.35 * radius).
      expect(offset).toBeGreaterThan(500 * 0.35 - 5);
    }
  });

  it("produces different centroids across observations", () => {
    const random = mulberry32(3);
    const a = fuzzLocation(TRUE_POINT, 500, random);
    const b = fuzzLocation(TRUE_POINT, 500, random);
    expect(a.centroid).not.toEqual(b.centroid);
  });

  it("draws a closed ring whose vertices sit ~radius from the centroid", () => {
    const fuzzed = fuzzLocation(TRUE_POINT, 500, mulberry32(4));
    const ring = fuzzed.circle.geometry.coordinates[0];
    expect(ring.length).toBeGreaterThan(8);
    // First and last vertex are identical (closed polygon).
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) {
      const d = distanceMeters(fuzzed.centroid, { lat, lng });
      expect(d).toBeGreaterThan(500 * 0.95);
      expect(d).toBeLessThan(500 * 1.05);
    }
  });
});

describe("buildObservationLocationFields", () => {
  it("returns the exact coordinate when obscuring is off", () => {
    const fields = buildObservationLocationFields(TRUE_POINT, { obscure: false });
    expect(fields).toEqual({
      decimalLatitude: String(TRUE_POINT.lat),
      decimalLongitude: String(TRUE_POINT.lng),
    });
  });

  it("emits only standard Darwin Core privacy fields when obscuring", () => {
    const fields = buildObservationLocationFields(TRUE_POINT, {
      obscure: true,
      radiusMeters: radiusForArea("balanced"),
      random: mulberry32(5),
    });

    expect(fields.coordinateUncertaintyInMeters).toBe(500);
    expect(fields.dataGeneralizations).toContain("500");
    expect(fields.informationWithheld).toMatch(/privacy/i);
    // The published coordinate is the offset centroid, not the true point.
    expect(fields.decimalLatitude).not.toBe(String(TRUE_POINT.lat));
    // Nothing non-standard is persisted — no custom GeoJSON / dynamicProperties.
    expect(Object.keys(fields).sort()).toEqual(
      ["coordinateUncertaintyInMeters", "dataGeneralizations", "decimalLatitude", "decimalLongitude", "informationWithheld"].sort(),
    );
  });
});
