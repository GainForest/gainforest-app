import { countryEntries, getCountry, type CountryCode } from "./countries";
import { resolvePdsHost } from "./pds";

export type CertifiedLocationLike = {
  location?: unknown;
  name?: unknown;
  locationType?: unknown;
};

/** What the org's referenced location record tells us for display: the
 *  record's own name plus the country it names or resolves to. Coordinates
 *  are included so editors can show the saved spot on a map; for an
 *  approximate (geojson circle) record they are the published circle's
 *  center — the exact point was never published. A `country-code` record
 *  carries no coordinates at all: a country is an area, and any point shown
 *  for it is the renderer's own convention. */
export type CertifiedLocationSummary = {
  name: string | null;
  country: CountryCode | null;
  latitude: number | null;
  longitude: number | null;
  /** True for a published ~10 km circle rather than an exact point. */
  approximate: boolean;
};

/** The `locationType` we publish for a whole-country location. The payload is
 *  an ISO 3166-1 alpha-2 code — self-describing, no coordinate claimed.
 *  (Proposed to the Location Protocol registry as `community.country-code.v1`;
 *  the wire value stays short because the lexicon caps `locationType` at 20.) */
export const COUNTRY_CODE_LOCATION_TYPE = "country-code";

const COORDINATE_EPSILON = 0.000001;

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
}

function parseCoordinateDecimal(value: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function inlineStringFromLocation(location: unknown): string | null {
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

/** A payload that is exactly an ISO 3166-1 alpha-2 code from our list.
 *  Validated against the country table — an unknown code yields null rather
 *  than a guess. */
function countryCodeFromPayload(text: string): CountryCode | null {
  const trimmed = text.trim();
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return null;
  const code = trimmed.toUpperCase() as CountryCode;
  return getCountry(code) ? code : null;
}

/** What a location record's payload text means, decoded the way both this
 *  app and Ma Earth have ever written it:
 *
 *  - `"CH"` (locationType `country-code`)  → a whole country, no coordinates
 *  - `"47.37,8.54"` (coordinate-decimal)   → a point, "lat,lon"
 *  - GeoJSON polygon (geojson / geojson-polygon) → an area, reduced to its center
 *
 *  The `locationType` is honored when given; without it the payload's own
 *  shape is unambiguous (a bare alpha-2 code can never parse as a coordinate
 *  or as JSON), so untyped callers still decode correctly. */
export type DecodedLocationPayload =
  | { kind: "country"; countryCode: CountryCode }
  | { kind: "point"; latitude: number; longitude: number }
  | { kind: "area"; latitude: number; longitude: number };

export function decodeLocationPayload(text: string, locationType?: string): DecodedLocationPayload | null {
  if (locationType === COUNTRY_CODE_LOCATION_TYPE) {
    const countryCode = countryCodeFromPayload(text);
    return countryCode ? { kind: "country", countryCode } : null;
  }

  const countryCode = countryCodeFromPayload(text);
  if (countryCode) return { kind: "country", countryCode };

  const coordinates = parseCoordinateDecimal(text);
  if (coordinates) return { kind: "point", ...coordinates };

  try {
    const center = polygonRingCenter(JSON.parse(text));
    if (center) return { kind: "area", ...center };
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

// Country resolution never consults the record `name` — it is free text and
// can be misleading. A `country-code` payload names the country outright;
// a legacy coordinate resolves only when it sits exactly on a centroid our
// country picker once published.
export function countryCodeFromCertifiedLocation(locationRecord: CertifiedLocationLike | null | undefined): CountryCode | null {
  if (!locationRecord) return null;
  const text = inlineStringFromLocation(locationRecord.location);
  if (!text) return null;
  const locationType = typeof locationRecord.locationType === "string" ? locationRecord.locationType : undefined;
  const decoded = decodeLocationPayload(text, locationType);
  if (!decoded) return null;
  if (decoded.kind === "country") return decoded.countryCode;
  if (decoded.kind === "point") return countryCodeFromCoordinates(decoded.latitude, decoded.longitude);
  return null;
}

/** Average of a GeoJSON polygon's outer ring — the center of the published
 *  approximate circle. Accepts a bare geometry or a Feature (Ma Earth writes
 *  the former, we write the latter). Good enough for a ~10 km circle; not
 *  general-purpose. */
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
 *  display. Null when the URI is missing, malformed, or the record is gone.
 *  Handles every payload either writer has published: inline strings and
 *  blobs (Ma Earth blobs everything), country codes, coordinates, and
 *  GeoJSON areas. */
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
  const locationType = typeof data.value.locationType === "string" ? data.value.locationType : undefined;

  // The payload lives inline or in a small blob — both are the org's own
  // declared location, so both are read.
  let text = inlineStringFromLocation(data.value.location);
  if (!text) {
    const cid = blobCidFromLocation(data.value.location);
    if (cid) {
      try {
        const blobParams = new URLSearchParams({ did: parsed.did, cid });
        const blobResponse = await fetch(`https://${host}/xrpc/com.atproto.sync.getBlob?${blobParams.toString()}`, { signal });
        if (blobResponse.ok) text = await blobResponse.text();
      } catch {
        /* fall through: the summary is still useful without the payload */
      }
    }
  }

  const decoded = text ? decodeLocationPayload(text, locationType) : null;
  if (decoded?.kind === "country") {
    return {
      name: name ?? getCountry(decoded.countryCode)?.name ?? null,
      country: decoded.countryCode,
      latitude: null,
      longitude: null,
      approximate: false,
    };
  }
  if (decoded?.kind === "point") {
    return {
      name,
      country: countryCodeFromCoordinates(decoded.latitude, decoded.longitude),
      latitude: decoded.latitude,
      longitude: decoded.longitude,
      approximate: false,
    };
  }
  if (decoded?.kind === "area") {
    return { name, country: null, latitude: decoded.latitude, longitude: decoded.longitude, approximate: true };
  }
  return { name, country: null, latitude: null, longitude: null, approximate: locationType?.startsWith("geojson") ?? false };
}
