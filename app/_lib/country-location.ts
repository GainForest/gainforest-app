import { countryEntries, type CountryCode } from "./countries";
import { resolvePdsHost } from "./pds";

export type CertifiedLocationLike = {
  location?: unknown;
  name?: unknown;
  locationType?: unknown;
};

/** What the org's referenced location record tells us for display: the
 *  record's own name plus the country its coordinates resolve to (when they
 *  sit exactly on a country centroid — i.e. the record was created by our
 *  country picker). Coordinates are included so editors can show the saved
 *  spot on a map; for an approximate (geojson circle) record they are the
 *  published circle's center — the exact point was never published. */
export type CertifiedLocationSummary = {
  name: string | null;
  country: CountryCode | null;
  latitude: number | null;
  longitude: number | null;
  /** True for a published ~10 km circle rather than an exact point. */
  approximate: boolean;
};

const COORDINATE_EPSILON = 0.000001;

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
}

function parseCoordinateDecimal(value: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const [latitudeRaw, longitudeRaw] = value.split(",").map((part) => part.trim());
  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function coordinateStringFromLocation(location: unknown): string | null {
  if (!location || typeof location !== "object") return null;
  const value = location as { string?: unknown };
  return typeof value.string === "string" ? value.string : null;
}

function countryCodeFromCoordinates(latitude: number, longitude: number): CountryCode | null {
  for (const [code, country] of countryEntries) {
    if (
      Math.abs(country.coordinates.latitude - latitude) <= COORDINATE_EPSILON &&
      Math.abs(country.coordinates.longitude - longitude) <= COORDINATE_EPSILON
    ) {
      return code;
    }
  }
  return null;
}

// Country is resolved strictly from coordinates — the record `name` is never
// consulted because it is free-text and can be misleading.
export function countryCodeFromCertifiedLocation(locationRecord: CertifiedLocationLike | null | undefined): CountryCode | null {
  if (!locationRecord) return null;

  const coordinateString = coordinateStringFromLocation(locationRecord.location);
  const coordinates = parseCoordinateDecimal(coordinateString);
  return coordinates ? countryCodeFromCoordinates(coordinates.latitude, coordinates.longitude) : null;
}

/** Average of a GeoJSON polygon's outer ring — the center of the published
 *  approximate circle. Good enough for a ~10 km circle; not general-purpose. */
export function polygonRingCenter(geojson: unknown): { latitude: number; longitude: number } | null {
  if (!geojson || typeof geojson !== "object") return null;
  const geometry = (geojson as { geometry?: unknown }).geometry ?? geojson;
  if (!geometry || typeof geometry !== "object") return null;
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return null;
  const ring = coordinates[0] as unknown[];
  let latitudeSum = 0;
  let longitudeSum = 0;
  let count = 0;
  // The ring closes on its first vertex; skip the duplicate so it isn't double-weighted.
  for (const vertex of ring.slice(0, -1)) {
    if (!Array.isArray(vertex) || typeof vertex[0] !== "number" || typeof vertex[1] !== "number") return null;
    longitudeSum += vertex[0];
    latitudeSum += vertex[1];
    count += 1;
  }
  if (count === 0) return null;
  return { latitude: latitudeSum / count, longitude: longitudeSum / count };
}

function blobCidFromLocation(location: unknown): string | null {
  if (!location || typeof location !== "object") return null;
  const blob = (location as { blob?: unknown }).blob;
  if (!blob || typeof blob !== "object") return null;
  const ref = (blob as { ref?: unknown }).ref;
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object" && "$link" in ref) {
    const link = (ref as { $link?: unknown }).$link;
    return typeof link === "string" ? link : null;
  }
  return null;
}

/** Read the location record an organization references and summarize it for
 *  display. Null when the URI is missing, malformed, or the record is gone. */
export async function fetchCertifiedLocationSummary(uri: string | null | undefined, signal?: AbortSignal): Promise<CertifiedLocationSummary | null> {
  if (!uri) return null;
  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== "app.certified.location") return null;

  const host = await resolvePdsHost(parsed.did, signal);
  if (!host) return null;

  const params = new URLSearchParams({ repo: parsed.did, collection: parsed.collection, rkey: parsed.rkey });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, { signal });
  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as { value?: CertifiedLocationLike } | null;
  if (!data?.value) return null;
  const name = typeof data.value.name === "string" && data.value.name.trim() ? data.value.name.trim() : null;
  const country = countryCodeFromCertifiedLocation(data.value);

  const coordinates = parseCoordinateDecimal(coordinateStringFromLocation(data.value.location));
  if (coordinates) {
    return { name, country, latitude: coordinates.latitude, longitude: coordinates.longitude, approximate: false };
  }

  // An approximate location: a GeoJSON circle stored as a blob. Fetch it to
  // recover the published center so editors can show the area on a map.
  const approximate = data.value.locationType === "geojson";
  if (approximate) {
    const cid = blobCidFromLocation(data.value.location);
    if (cid) {
      try {
        const blobParams = new URLSearchParams({ did: parsed.did, cid });
        const blobResponse = await fetch(`https://${host}/xrpc/com.atproto.sync.getBlob?${blobParams.toString()}`, { signal });
        if (blobResponse.ok) {
          const center = polygonRingCenter(await blobResponse.json().catch(() => null));
          if (center) {
            return { name, country, latitude: center.latitude, longitude: center.longitude, approximate: true };
          }
        }
      } catch {
        // Fall through: the summary is still useful without the map seed.
      }
    }
  }

  return { name, country, latitude: null, longitude: null, approximate };
}

