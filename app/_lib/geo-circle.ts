/**
 * Build a circle as a GeoJSON polygon from a centre point + radius in metres.
 *
 * Shared by the observation location fuzzer (to draw the obscured area) and by
 * the map resolver, which reconstructs the circle purely from the Darwin Core
 * fields a record carries — the offset `decimalLatitude`/`decimalLongitude`
 * (centre) plus `coordinateUncertaintyInMeters` (radius). Nothing custom is
 * persisted: the shape is derived on demand from standard DwC terms.
 */

export type CircleFeature = GeoJSON.Feature<GeoJSON.Polygon, { radiusMeters: number }>;

const METERS_PER_DEGREE_LAT = 111_320;
/** Vertices used to approximate the circle; 48 reads as smooth at any zoom. */
const DEFAULT_SEGMENTS = 48;

function metersToLatDegrees(meters: number): number {
  return meters / METERS_PER_DEGREE_LAT;
}

function metersToLngDegrees(meters: number, atLat: number): number {
  const scale = Math.cos((atLat * Math.PI) / 180);
  // Near the poles cos → 0; clamp so we never divide by ~zero.
  return meters / (METERS_PER_DEGREE_LAT * Math.max(Math.abs(scale), 1e-6));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function circleGeoJson(
  lat: number,
  lng: number,
  radiusMeters: number,
  segments: number = DEFAULT_SEGMENTS,
): CircleFeature {
  const radius = Math.max(1, radiusMeters);
  const ring: GeoJSON.Position[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * 2 * Math.PI;
    const north = radius * Math.cos(angle);
    const east = radius * Math.sin(angle);
    const pointLat = lat + metersToLatDegrees(north);
    const pointLng = lng + metersToLngDegrees(east, lat);
    ring.push([round(pointLng, 6), round(pointLat, 6)]);
  }
  ring.push([...ring[0]]); // close the ring

  return {
    type: "Feature",
    properties: { radiusMeters: Math.round(radius) },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}
