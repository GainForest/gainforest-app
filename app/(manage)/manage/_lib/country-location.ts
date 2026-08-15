"use client";

import { getCountry } from "@/app/_lib/countries";
import { COUNTRY_CODE_LOCATION_TYPE } from "@/app/_lib/country-location";
import { createRecord } from "./mutations";

const COUNTRY_LOCATION_SRS = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";

/**
 * Publish a whole-country location. The record names the country by its ISO
 * 3166-1 alpha-2 code — it claims no coordinate, because the org never named
 * one. Any pin drawn for it (globe, editor) is the renderer's own convention,
 * looked up from the country table at render time.
 *
 * Until 2026-08 this wrote the country's centroid as a `coordinate-decimal`
 * point, which read as "the org is at this exact spot". Readers keep decoding
 * those legacy records; each save replaces the referenced record, so they age
 * out naturally.
 */
export async function createCountryLocationStrongRef(
  countryCode: string,
  options?: { repo?: string },
): Promise<{ uri: string; cid: string }> {
  const country = getCountry(countryCode);
  if (!country) throw new Error("Choose a country from the list.");

  return createRecord("app.certified.location", {
    $type: "app.certified.location",
    lpVersion: "1.0",
    // Required by the lexicon; meaningless for a payload with no coordinates.
    srs: COUNTRY_LOCATION_SRS,
    locationType: COUNTRY_CODE_LOCATION_TYPE,
    location: {
      $type: "app.certified.location#string",
      string: countryCode.trim().toUpperCase(),
    },
    name: country.name,
    createdAt: new Date().toISOString(),
  }, undefined, options);
}
