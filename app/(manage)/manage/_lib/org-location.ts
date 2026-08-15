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
 *                              the searched name are never published
 *
 * The offset for an approximate location is computed by the server
 * (`/api/manage/org-location`), keyed on a secret, so that saving the same
 * location twice publishes the same circle. A fresh random offset per save
 * would let anyone average the published circles back to the true point.
 */

import { getCountry } from "@/app/_lib/countries";
import {
  circlePolygonFeature,
  publishedLocationName,
  type OrgLocationChoice,
} from "@/app/_lib/org-location-geometry";
import { createRecord, deleteRecord, putRecord, uploadBlob } from "./mutations";
import { createCountryLocationStrongRef } from "./country-location";
import { resolvePdsHost } from "@/app/_lib/pds";

export type { GeocodedPlace, OrgLocationChoice } from "@/app/_lib/org-location-geometry";

const COUNTRY_LOCATION_SRS = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";

/** Where a personal account's declared location lives (rkey `self`). */
export const PERSONAL_LOCATION_COLLECTION = "app.gainforest.actor.location";
const ORG_RECORD_COLLECTION = "app.certified.actor.organization";

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

async function fetchExistingSelfRecord(repo: string, collection: string): Promise<Record<string, unknown>> {
  const host = await resolvePdsHost(repo).catch(() => null);
  if (!host) return {};
  const params = new URLSearchParams({ repo, collection, rkey: "self" });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return {};
  const data = (await response.json().catch(() => ({}))) as { value?: unknown };
  return typeof data.value === "object" && data.value !== null && !Array.isArray(data.value)
    ? data.value as Record<string, unknown>
    : {};
}

/**
 * Save (or clear, with `null`) an organization's declared location: mint the
 * location record, then read-merge the org record so only `location` changes.
 */
export async function saveOrganizationLocation(
  repo: string,
  choice: OrgLocationChoice | null,
  options?: { repo?: string },
): Promise<void> {
  const existing = await fetchExistingSelfRecord(repo, ORG_RECORD_COLLECTION);
  const record: Record<string, unknown> = {
    ...existing,
    $type: ORG_RECORD_COLLECTION,
    createdAt: typeof existing.createdAt === "string" ? existing.createdAt : new Date().toISOString(),
  };
  if (choice) record.location = await createOrgLocationStrongRef(choice, options);
  else delete record.location;
  await putRecord(ORG_RECORD_COLLECTION, "self", record, options);
}

/**
 * Save (or clear, with `null`) a personal account's declared location — the
 * `app.gainforest.actor.location/self` companion record. People have no
 * organization record, and writing one would misclassify them as an org.
 */
export async function savePersonalLocation(
  choice: OrgLocationChoice | null,
  options?: { repo?: string },
): Promise<void> {
  if (!choice) {
    await deleteRecord(PERSONAL_LOCATION_COLLECTION, "self", options).catch((error) => {
      // Clearing an already-clear location is not an error.
      if (!(error instanceof Error) || !/not found|could not locate/i.test(error.message)) throw error;
    });
    return;
  }
  const location = await createOrgLocationStrongRef(choice, options);
  await putRecord(PERSONAL_LOCATION_COLLECTION, "self", {
    $type: PERSONAL_LOCATION_COLLECTION,
    location,
    createdAt: new Date().toISOString(),
  }, options);
}

/** Ask the server for the keyed offset of an approximate location. */
async function fetchFuzzedCoordinate(
  latitude: number,
  longitude: number,
  repo?: string,
): Promise<{ latitude: number; longitude: number }> {
  const response = await fetch("/api/manage/org-location", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ latitude, longitude, ...(repo ? { repo } : {}) }),
  });
  const data = (await response.json().catch(() => null)) as
    | { latitude?: number; longitude?: number; error?: string }
    | null;
  if (!response.ok || typeof data?.latitude !== "number" || typeof data?.longitude !== "number") {
    throw new Error(data?.error ?? "Could not save an approximate location. Please try again.");
  }
  return { latitude: data.latitude, longitude: data.longitude };
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

  // Approximate: offset the point server-side, publish only a circle around
  // the offset. Failing here must not fall back to the exact coordinate.
  const fuzzed = await fetchFuzzedCoordinate(place.latitude, place.longitude, options?.repo);
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
