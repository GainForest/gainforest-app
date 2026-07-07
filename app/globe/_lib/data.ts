/**
 * Globe data fetchers: the organization roster (proxied Green Globe index) and
 * per-organization project sites (certified locations from the shared
 * indexer, with GeoJSON boundaries resolved from each org's PDS).
 */

import { fetchBumicertsByDid, fetchLocationsByDid } from "../../_lib/indexer";
import type { GlobeOrganization, GlobeSite, GlobeTreeStat, LngLatBounds } from "./globe-types";

/** The org's own location record (referenced from its certified organization
 *  profile) — lets the site list keep "where the org is based" apart from the
 *  project sites. */
export { fetchOrganizationLocationUri } from "../../_lib/indexer";

/** Organization roster for the globe (name, country, marker point). */
export async function fetchGlobeOrganizations(signal?: AbortSignal): Promise<GlobeOrganization[]> {
  const res = await fetch("/api/globe/organizations", { signal });
  if (!res.ok) throw new Error(`globe organizations ${res.status}`);
  const json = (await res.json()) as { organizations?: GlobeOrganization[] };
  return (json.organizations ?? []).filter((org) => Boolean(org?.did && org?.name));
}

/** All mapped sites (certified locations) for one organization. */
export async function fetchOrganizationSites(
  did: string,
  signal?: AbortSignal,
): Promise<GlobeSite[]> {
  const locations = await fetchLocationsByDid(did, signal);
  return locations.map((location) => ({
    uri: location.metadata.uri,
    rkey: location.metadata.rkey,
    name: location.record.name ?? location.metadata.rkey,
    geojsonUrl: location.record.location?.kind === "uri" ? location.record.location.uri : null,
    point:
      location.record.location?.kind === "point"
        ? { lat: location.record.location.lat, lon: location.record.location.lon }
        : null,
  }));
}

/** Per-organization measured-tree counts (orgs with no trees are omitted). */
export async function fetchGlobeTreeStats(signal?: AbortSignal): Promise<GlobeTreeStat[]> {
  const res = await fetch("/api/globe/trees", { signal });
  if (!res.ok) throw new Error(`globe tree stats ${res.status}`);
  const json = (await res.json()) as { organizations?: GlobeTreeStat[] };
  return (json.organizations ?? []).filter(
    (stat) => Boolean(stat?.did) && typeof stat?.trees === "number" && stat.trees > 0,
  );
}

/** Which of the organization's projects reference each site: certified
 *  location AT-URI → project titles. Lets the site list badge every site with
 *  the project(s) it belongs to, so a long roster of boundaries stays legible. */
export async function fetchOrganizationSiteProjects(
  did: string,
  signal?: AbortSignal,
): Promise<Map<string, string[]>> {
  const page = await fetchBumicertsByDid(did, 500, null, signal);
  const bySite = new Map<string, string[]>();
  for (const project of page.records) {
    const title = project.title?.trim();
    if (!title) continue;
    for (const uri of project.locationUris) {
      const titles = bySite.get(uri) ?? [];
      if (!titles.includes(title)) titles.push(title);
      bySite.set(uri, titles);
    }
  }
  return bySite;
}

const geojsonCache = new Map<string, Promise<GeoJSON.GeoJSON | null>>();

/** Fetch + cache a site's GeoJSON boundary. Some legacy "boundaries" are plain
 *  `lat,lon` text blobs; those resolve to null (the site keeps its point). */
export function fetchSiteGeoJson(url: string, signal?: AbortSignal): Promise<GeoJSON.GeoJSON | null> {
  let promise = geojsonCache.get(url);
  if (!promise) {
    promise = (async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as GeoJSON.GeoJSON;
        return typeof parsed === "object" && parsed !== null && "type" in parsed ? parsed : null;
      } catch {
        return null;
      }
    })();
    geojsonCache.set(url, promise);
    promise.catch(() => {
      if (geojsonCache.get(url) === promise) geojsonCache.delete(url);
    });
  }
  return promise;
}

/** Flatten any GeoJSON object into plain features (for one FeatureCollection). */
export function toFeatures(
  geojson: GeoJSON.GeoJSON | null | undefined,
  properties?: Record<string, unknown>,
): GeoJSON.Feature[] {
  if (!geojson || typeof geojson !== "object") return [];
  const withProps = (feature: GeoJSON.Feature): GeoJSON.Feature =>
    properties ? { ...feature, properties: { ...(feature.properties ?? {}), ...properties } } : feature;
  if (geojson.type === "FeatureCollection") {
    return (geojson.features ?? []).filter(Boolean).map(withProps);
  }
  if (geojson.type === "Feature") return [withProps(geojson)];
  return [withProps({ type: "Feature", geometry: geojson as GeoJSON.Geometry, properties: {} })];
}

// ── Point-in-polygon (even-odd ray casting) ──────────────────────────────

function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Position[][]): boolean {
  // Even-odd across every ring: a point inside a hole crosses an even number
  // of edges overall, so holes cancel the outer ring automatically.
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const pi = ring[i];
      const pj = ring[j];
      const xi = pi?.[0];
      const yi = pi?.[1];
      const xj = pj?.[0];
      const yj = pj?.[1];
      if (
        typeof xi !== "number" || typeof yi !== "number" ||
        typeof xj !== "number" || typeof yj !== "number"
      ) {
        continue;
      }
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geometry: GeoJSON.Geometry | null | undefined): boolean {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  }
  if (geometry.type === "GeometryCollection") {
    return (geometry.geometries ?? []).some((child) => pointInGeometry(lng, lat, child));
  }
  return false;
}

/** Keep only the point features that fall inside any of the boundary
 *  features. Used on the project globe page: an org's tree file spans every
 *  project, but the page should only show the trees of this project's sites.
 *  Returns an empty collection when the boundaries contain no polygons. */
export function filterPointsWithinBoundaries(
  collection: GeoJSON.FeatureCollection,
  boundaries: GeoJSON.Feature[],
): GeoJSON.FeatureCollection {
  const polygons = boundaries
    .map((feature) => feature.geometry)
    .filter((geometry): geometry is GeoJSON.Geometry =>
      Boolean(
        geometry &&
          (geometry.type === "Polygon" ||
            geometry.type === "MultiPolygon" ||
            geometry.type === "GeometryCollection"),
      ),
    );
  if (polygons.length === 0) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: collection.features.filter((feature) => {
      const geometry = feature.geometry;
      if (!geometry || geometry.type !== "Point") return false;
      const lng = geometry.coordinates[0];
      const lat = geometry.coordinates[1];
      if (typeof lng !== "number" || typeof lat !== "number") return false;
      return polygons.some((polygon) => pointInGeometry(lng, lat, polygon));
    }),
  };
}

// ── GeoJSON bounds (port of Green Globe's geojsonBbox) ─────────────────────

function collectCoords(value: unknown, out: Array<[number, number]>): void {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    out.push([value[0], value[1]]);
    return;
  }
  for (const child of value) collectCoords(child, out);
}

export function geojsonBounds(geojson: GeoJSON.GeoJSON | null | undefined): LngLatBounds | null {
  if (!geojson || typeof geojson !== "object") return null;
  const coords: Array<[number, number]> = [];

  const processGeometry = (geometry: GeoJSON.Geometry | null | undefined) => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") {
      for (const child of geometry.geometries ?? []) processGeometry(child);
      return;
    }
    collectCoords((geometry as { coordinates?: unknown }).coordinates, coords);
  };

  if (geojson.type === "FeatureCollection") {
    for (const feature of geojson.features ?? []) processGeometry(feature?.geometry);
  } else if (geojson.type === "Feature") {
    processGeometry(geojson.geometry);
  } else {
    processGeometry(geojson as GeoJSON.Geometry);
  }

  if (coords.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function mergeBounds(a: LngLatBounds | null, b: LngLatBounds | null): LngLatBounds | null {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

/** Small padded box around a bare point so `fitBounds` works uniformly. */
export function pointBounds(lat: number, lon: number, offset = 0.02): LngLatBounds {
  return [lon - offset, lat - offset, lon + offset, lat + offset];
}
