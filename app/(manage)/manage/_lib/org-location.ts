"use client";

/**
 * Publishing an organization's declared location. The location is an
 * `app.certified.location` record referenced from the org record:
 *
 * - a whole country          → the existing country-centroid record (keeps
 *                              the flag rendering on profiles)
 * - an exact place           → an inline "lat,lon" point with the place name
 * - an approximate place     → the coordinate offset by up to ~0.1°/axis,
 *                              published as a ~10 km circle (GeoJSON blob,
 *                              like project sites) under a coarse
 *                              region/country name — the precise point and
 *                              the searched name never leave the browser
 */

import { getCountry } from "@/app/_lib/countries";
import {
  circlePolygonFeature,
  fuzzCoordinate,
  publishedLocationName,
  type OrgLocationChoice,
} from "@/app/_lib/org-location-geometry";
import { createRecord, uploadBlob } from "./mutations";
import { createCountryLocationStrongRef } from "./country-location";

export type { GeocodedPlace, OrgLocationChoice } from "@/app/_lib/org-location-geometry";

const COUNTRY_LOCATION_SRS = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";

/**
 * The label + country code the hero shows right after a save, matching what
 * the account data will read back once the indexer/PDS round-trip completes.
 */
export function displayLocationFromChoice(choice: OrgLocationChoice): {
  name: string | null;
  country: string;
} {
  if (choice.place.kind === "country" && !choice.approximate) {
    const code = choice.place.countryCode ?? "";
    const country = code ? getCountry(code) : undefined;
    if (country) return { name: country.name, country: code.toUpperCase() };
  }
  return { name: publishedLocationName(choice), country: "" };
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toLexBlobRef(uploaded: { ref?: unknown; mimeType?: unknown; size?: unknown; blob?: unknown }, fallbackSize: number) {
  const raw = isRecordObject(uploaded.blob) ? uploaded.blob : uploaded;
  if (!("ref" in raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("Could not save the location. Please try again.");
  }
  return {
    $type: "blob" as const,
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "application/geo+json",
    size: typeof raw.size === "number" ? raw.size : fallbackSize,
  };
}

/**
 * Create the location record for a steward's choice and return the strong ref
 * to store on the organization record.
 */
export async function createOrgLocationStrongRef(
  choice: OrgLocationChoice,
  options?: { repo?: string },
): Promise<{ uri: string; cid: string }> {
  const { place } = choice;

  // A country pick reuses the centroid record shape the app has always
  // written, so profiles keep deriving the flag from it.
  if (place.kind === "country" && !choice.approximate && place.countryCode && getCountry(place.countryCode)) {
    return createCountryLocationStrongRef(place.countryCode, options);
  }

  const name = publishedLocationName(choice);

  if (!choice.approximate) {
    return createRecord("app.certified.location", {
      $type: "app.certified.location",
      lpVersion: "1.0",
      srs: COUNTRY_LOCATION_SRS,
      locationType: "coordinate-decimal",
      location: {
        $type: "app.certified.location#string",
        string: `${place.latitude.toFixed(6)},${place.longitude.toFixed(6)}`,
      },
      ...(name ? { name } : {}),
      createdAt: new Date().toISOString(),
    }, undefined, options);
  }

  // Approximate: offset the point, publish only a circle around the offset.
  const fuzzed = fuzzCoordinate(place.latitude, place.longitude);
  const feature = circlePolygonFeature(fuzzed.latitude, fuzzed.longitude);
  const payload = JSON.stringify(feature);
  const file = new File([payload], "approximate-location.geojson", { type: "application/geo+json" });
  const uploaded = await uploadBlob(file, options);

  return createRecord("app.certified.location", {
    $type: "app.certified.location",
    lpVersion: "1.0",
    srs: COUNTRY_LOCATION_SRS,
    locationType: "geojson",
    location: {
      $type: "org.hypercerts.defs#smallBlob",
      blob: toLexBlobRef(uploaded, payload.length),
    },
    ...(name ? { name } : {}),
    createdAt: new Date().toISOString(),
  }, undefined, options);
}
