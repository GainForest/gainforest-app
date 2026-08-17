"use client";

import { countries, getCountry, type CountryCode } from "@/app/_lib/countries";
import { createRecord } from "./mutations";

const COUNTRY_LOCATION_SRS = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";

export async function createCountryLocationStrongRef(
  countryCode: string,
  options?: { repo?: string },
): Promise<{ uri: string; cid: string }> {
  const country = getCountry(countryCode);
  if (!country) throw new Error("Choose a country from the list.");

  const { latitude, longitude } = country.coordinates;
  return createRecord("app.certified.location", {
    $type: "app.certified.location",
    lpVersion: "1.0",
    srs: COUNTRY_LOCATION_SRS,
    locationType: "coordinate-decimal",
    location: {
      $type: "app.certified.location#string",
      string: `${latitude},${longitude}`,
    },
    name: country.name,
    createdAt: new Date().toISOString(),
  }, undefined, options);
}

export function normalizeCountryCode(value: string): CountryCode | null {
  const code = value.trim().toUpperCase() as CountryCode;
  return countries[code] ? code : null;
}
