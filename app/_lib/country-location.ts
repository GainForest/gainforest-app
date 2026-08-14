import { countryEntries, type CountryCode } from "./countries";
import { resolvePdsHost } from "./pds";

export type CertifiedLocationLike = {
  location?: unknown;
  name?: unknown;
};

/** What the org's referenced location record tells us for display: the
 *  record's own name plus the country its coordinates resolve to (when they
 *  sit exactly on a country centroid — i.e. the record was created by our
 *  country picker). */
export type CertifiedLocationSummary = {
  name: string | null;
  country: CountryCode | null;
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
  return { name, country: countryCodeFromCertifiedLocation(data.value) };
}

