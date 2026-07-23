export type SiteMetrics = { area: number; lat: number; lon: number } | "Invalid" | null;

const EARTH_RADIUS_METRES = 6_378_137;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

function normalizedLongitudeDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/** Chamberlain–Duquette spherical ring area in square metres. */
function ringArea(ring: GeoJSON.Position[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!current || !next) continue;
    const lonDelta = toRadians(normalizedLongitudeDelta(current[0] ?? 0, next[0] ?? 0));
    sum += lonDelta * (2 + Math.sin(toRadians(current[1] ?? 0)) + Math.sin(toRadians(next[1] ?? 0)));
  }
  return Math.abs(sum * EARTH_RADIUS_METRES * EARTH_RADIUS_METRES / 2);
}

function polygonArea(rings: GeoJSON.Position[][]): number {
  const [outer, ...holes] = rings;
  if (!outer) return 0;
  return Math.max(0, ringArea(outer) - holes.reduce((area, hole) => area + ringArea(hole), 0));
}

export function computeSiteMetrics(geoJson: GeoJSON.GeoJSON): SiteMetrics {
  try {
    const features: GeoJSON.Feature[] = geoJson.type === "FeatureCollection"
      ? geoJson.features
      : geoJson.type === "Feature"
        ? [geoJson]
        : [{ type: "Feature", geometry: geoJson as GeoJSON.Geometry, properties: {} }];

    let squareMetres = 0;
    let sumLat = 0;
    let sumLon = 0;
    let count = 0;
    const addPoint = (position: GeoJSON.Position) => {
      const lon = position[0];
      const lat = position[1];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      sumLon += lon;
      sumLat += lat;
      count += 1;
    };
    const addPolygon = (rings: GeoJSON.Position[][]) => {
      squareMetres += polygonArea(rings);
      // Use the exterior ring for the display centre; holes must not pull it.
      for (const point of rings[0] ?? []) addPoint(point);
    };

    for (const feature of features) {
      const geometry = feature.geometry;
      if (!geometry) continue;
      if (geometry.type === "Polygon") addPolygon(geometry.coordinates);
      else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach(addPolygon);
      else if (geometry.type === "Point") addPoint(geometry.coordinates);
      else if (geometry.type === "MultiPoint" || geometry.type === "LineString") geometry.coordinates.forEach(addPoint);
      else if (geometry.type === "MultiLineString") geometry.coordinates.flat().forEach(addPoint);
    }

    if (count === 0) return "Invalid";
    return { area: squareMetres / 10_000, lat: sumLat / count, lon: sumLon / count };
  } catch {
    return "Invalid";
  }
}
