// Point-in-polygon and GeoJSON validation utilities

export type Coordinates = { lat: number; lon: number };

export type PointBoundaryClassification =
  | { kind: "inside" }
  | { kind: "near-boundary"; distanceMeters: number }
  | { kind: "outside"; distanceMeters: number }
  | { kind: "invalid-boundary"; reason: string };

export type SiteBoundaryGeoJson = {
  type: "Feature" | "FeatureCollection" | "Polygon" | "MultiPolygon";
  _polygons: Array<Array<[number, number][]>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractPolygonRings(geometry: unknown): Array<[number, number][]> | null {
  if (!isRecord(geometry)) return null;
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates;
    if (!Array.isArray(coords)) return null;
    return coords as Array<[number, number][]>;
  }
  if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates;
    if (!Array.isArray(coords)) return null;
    return (coords as Array<Array<[number, number][]>>).flat();
  }
  return null;
}

export function validateGeojsonOrThrow(payload: unknown): SiteBoundaryGeoJson {
  if (!isRecord(payload)) {
    throw new Error("The map area file could not be read.");
  }

  const type = payload.type as string;
  const allPolygons: Array<Array<[number, number][]>> = [];

  if (type === "Feature") {
    const geom = payload.geometry;
    const rings = extractPolygonRings(geom);
    if (!rings) {
      throw new Error("The map area file must contain a drawn area.");
    }
    allPolygons.push(rings);
  } else if (type === "FeatureCollection") {
    const features = payload.features;
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error("The map area file must include at least one drawn area.");
    }
    for (const feature of features) {
      if (!isRecord(feature)) continue;
      const rings = extractPolygonRings(feature.geometry);
      if (rings) allPolygons.push(rings);
    }
    if (allPolygons.length === 0) {
      throw new Error("The map area file must include at least one drawn area.");
    }
  } else if (type === "Polygon" || type === "MultiPolygon") {
    const rings = extractPolygonRings(payload);
    if (!rings) throw new Error("The drawn map area is not valid.");
    allPolygons.push(rings);
  } else {
    throw new Error("The map area file type is not supported.");
  }

  return { type: type as SiteBoundaryGeoJson["type"], _polygons: allPolygons };
}

// Ray casting point-in-polygon (lon/lat order for GeoJSON)
function pointInRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0], yi = ring[i]![1];
    const xj = ring[j]![0], yj = ring[j]![1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, rings: [number, number][][]): boolean {
  if (rings.length === 0) return false;
  const outerRing = rings[0]!;
  if (!pointInRing(lon, lat, outerRing)) return false;
  // Check holes
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lon, lat, rings[i]!)) return false;
  }
  return true;
}

// Haversine distance between two lat/lon points in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest distance from point to a ring's edges
function distanceToRingMeters(lon: number, lat: number, ring: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j]![0], ay = ring[j]![1];
    const bx = ring[i]![0], by = ring[i]![1];
    // Project point onto segment
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((lon - ax) * dx + (lat - ay) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const nearestLon = ax + t * dx;
    const nearestLat = ay + t * dy;
    const d = haversineMeters(lat, lon, nearestLat, nearestLon);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function classifyPointAgainstGeoJsonBoundary(options: {
  geoJson: SiteBoundaryGeoJson;
  point: Coordinates;
  nearBoundaryMeters: number;
}): PointBoundaryClassification {
  const { geoJson, point, nearBoundaryMeters } = options;
  const { lon, lat } = point;

  try {
    for (const rings of geoJson._polygons) {
      if (pointInPolygon(lon, lat, rings)) {
        return { kind: "inside" };
      }
    }

    // Not inside any polygon — compute minimum distance to boundary
    let minDist = Infinity;
    for (const rings of geoJson._polygons) {
      for (const ring of rings) {
        const d = distanceToRingMeters(lon, lat, ring);
        if (d < minDist) minDist = d;
      }
    }

    if (minDist <= nearBoundaryMeters) {
      return { kind: "near-boundary", distanceMeters: minDist };
    }
    return { kind: "outside", distanceMeters: minDist };
  } catch {
    return { kind: "invalid-boundary", reason: "Failed to classify point against boundary." };
  }
}
