/**
 * Record shapes for an organization's declared location, built server-side by
 * the proxy's `saveOrgLocation` composite operation. Pure — no I/O — so the
 * shapes are unit-testable and stay in one place.
 *
 * The privacy rule for approximate locations lives with the caller: the exact
 * coordinate must be fuzzed (keyed, server-held secret) before it reaches
 * `approximateLocationRecord`, and the exact point must never be published.
 */

import { getCountry } from "@/app/_lib/countries";
import { COUNTRY_CODE_LOCATION_TYPE } from "@/app/_lib/country-location";
import {
  circlePolygonFeature,
  publishedLocationName,
  type OrgLocationChoice,
} from "@/app/_lib/org-location-geometry";

const LOCATION_SRS = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
export const LOCATION_COLLECTION = "app.certified.location";
export const ORG_COLLECTION = "app.certified.actor.organization";

/** Wire shape of a location choice as the browser submits it. */
export type OrgLocationChoiceInput = {
  place: {
    name: string;
    latitude: number;
    longitude: number;
    countryCode: string | null;
    region: string | null;
    country: string | null;
    kind: "country" | "place";
  };
  approximate: boolean;
};

export function isOrgLocationChoiceInput(value: unknown): value is OrgLocationChoiceInput {
  if (!value || typeof value !== "object") return false;
  const choice = value as { place?: unknown; approximate?: unknown };
  if (typeof choice.approximate !== "boolean") return false;
  if (!choice.place || typeof choice.place !== "object") return false;
  const place = choice.place as Record<string, unknown>;
  const optionalString = (v: unknown) => v === null || typeof v === "string";
  return (
    typeof place.name === "string" &&
    place.name.trim().length > 0 &&
    place.name.length <= 1000 &&
    typeof place.latitude === "number" &&
    Number.isFinite(place.latitude) &&
    Math.abs(place.latitude) <= 90 &&
    typeof place.longitude === "number" &&
    Number.isFinite(place.longitude) &&
    Math.abs(place.longitude) <= 180 &&
    optionalString(place.countryCode) &&
    optionalString(place.region) &&
    optionalString(place.country) &&
    (place.kind === "country" || place.kind === "place")
  );
}

/** A whole country: named by ISO code, no coordinate claimed (ECO-880). */
export function countryLocationRecord(countryCode: string): Record<string, unknown> | null {
  const country = getCountry(countryCode);
  if (!country) return null;
  return {
    $type: LOCATION_COLLECTION,
    lpVersion: "1.0",
    // Required by the lexicon; meaningless for a payload with no coordinates.
    srs: LOCATION_SRS,
    locationType: COUNTRY_CODE_LOCATION_TYPE,
    location: { $type: "app.certified.location#string", string: countryCode.trim().toUpperCase() },
    name: country.name,
    createdAt: new Date().toISOString(),
  };
}

/** An exact place: a coordinate point with the place's name. */
export function exactLocationRecord(choice: OrgLocationChoice): Record<string, unknown> {
  const name = publishedLocationName(choice);
  return {
    $type: LOCATION_COLLECTION,
    lpVersion: "1.0",
    srs: LOCATION_SRS,
    locationType: "coordinate-decimal",
    location: {
      $type: "app.certified.location#string",
      string: `${choice.place.latitude.toFixed(6)},${choice.place.longitude.toFixed(6)}`,
    },
    ...(name ? { name } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** The published circle for an approximate location, as a GeoJSON payload.
 *  `fuzzed` must already be offset — never pass the exact point. */
export function approximateCirclePayload(fuzzed: { latitude: number; longitude: number }): string {
  return JSON.stringify(circlePolygonFeature(fuzzed.latitude, fuzzed.longitude));
}

/** An approximate location: the circle blob under a coarse name. */
export function approximateLocationRecord(
  choice: OrgLocationChoice,
  blobRef: Record<string, unknown>,
): Record<string, unknown> {
  const name = publishedLocationName(choice);
  return {
    $type: LOCATION_COLLECTION,
    lpVersion: "1.0",
    srs: LOCATION_SRS,
    locationType: "geojson",
    location: { $type: "org.hypercerts.defs#smallBlob", blob: blobRef },
    ...(name ? { name } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** The rkey of a location record owned by `repo`, or null when the URI is
 *  malformed or points into a different repo. Used to take back a location
 *  this save just minted, and to remove the location a save replaced —
 *  never a record in someone else's repo. */
export function ownedLocationRkey(uri: string | null | undefined, repo: string): string | null {
  if (!uri || !repo) return null;
  const prefix = `at://${repo}/${LOCATION_COLLECTION}/`;
  if (!uri.startsWith(prefix)) return null;
  const rkey = uri.slice(prefix.length);
  return rkey && !rkey.includes("/") ? rkey : null;
}

/** Normalize an upload response into the lexicon's blob ref shape. The auth
 *  service returns either the blob object itself or `{ blob }`. */
export function lexBlobRef(uploaded: unknown, fallbackSize: number): Record<string, unknown> | null {
  if (!uploaded || typeof uploaded !== "object") return null;
  const raw = "blob" in (uploaded as Record<string, unknown>) &&
    typeof (uploaded as { blob?: unknown }).blob === "object" &&
    (uploaded as { blob?: unknown }).blob !== null
    ? (uploaded as { blob: Record<string, unknown> }).blob
    : (uploaded as Record<string, unknown>);
  if (!("ref" in raw) || raw.ref === undefined || raw.ref === null) return null;
  return {
    $type: "blob",
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "application/geo+json",
    size: typeof raw.size === "number" ? raw.size : fallbackSize,
  };
}
