import { describe, expect, it } from "vitest";

import { circleGeoJson } from "./geo-circle";

const METERS_PER_DEGREE_LAT = 111_320;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * METERS_PER_DEGREE_LAT;
  const dLng = (b.lng - a.lng) * METERS_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

describe("circleGeoJson", () => {
  it("returns a closed polygon Feature carrying the radius", () => {
    const circle = circleGeoJson(37.8083, -122.4194, 500);
    expect(circle.type).toBe("Feature");
    expect(circle.geometry.type).toBe("Polygon");
    expect(circle.properties.radiusMeters).toBe(500);
    const ring = circle.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("places every vertex ~radius metres from the centre", () => {
    const center = { lat: 37.8083, lng: -122.4194 };
    const ring = circleGeoJson(center.lat, center.lng, 500).geometry.coordinates[0];
    for (const [lng, lat] of ring) {
      const d = distanceMeters(center, { lat, lng });
      expect(d).toBeGreaterThan(500 * 0.97);
      expect(d).toBeLessThan(500 * 1.03);
    }
  });

  it("clamps a non-positive radius to a minimum so the ring is never degenerate", () => {
    const ring = circleGeoJson(0, 0, 0).geometry.coordinates[0];
    expect(ring.length).toBeGreaterThan(8);
  });
});
