"use client";

/**
 * Publishing an organization's declared location. The location is an
 * `app.certified.location` record referenced from the org record:
 *
 * - a whole country          → a `country-code` record naming the country by
 *                              its ISO 3166-1 alpha-2 code — no coordinate
 * - an exact place           → an inline "lat,lon" point with the place name
 * - an approximate place     → the coordinate offset by up to ~0.1°/axis,
 *                              published as a ~10 km circle (GeoJSON blob,
 *                              like project sites) under a coarse
 *                              region/country name — the precise point and
 *                              the searched name are never published
 *
 * The whole save runs SERVER-SIDE as one proxy request (`saveOrgLocation`):
 * the browser submits the pick and the proxy fuzzes, uploads, creates the
 * location record and repoints the org record in one go. A closed tab or a
 * navigation can no longer strand the chain halfway — the failure mode that
 * left a location record no organization pointed at (ECO-879/ECO-882). It
 * also keeps the exact coordinate of an approximate pick from round-tripping
 * through the browser after fuzzing.
 */

import { getCountry } from "@/app/_lib/countries";
import { publishedLocationName, type OrgLocationChoice } from "@/app/_lib/org-location-geometry";
import { saveOrgLocationViaProxy, type SaveOrgLocationChoice } from "./mutations";

export type { GeocodedPlace, OrgLocationChoice } from "@/app/_lib/org-location-geometry";

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

/** The wire shape the proxy validates; strips anything extra off the place. */
function choicePayload(choice: OrgLocationChoice): SaveOrgLocationChoice {
  return {
    place: {
      name: choice.place.name,
      latitude: choice.place.latitude,
      longitude: choice.place.longitude,
      countryCode: choice.place.countryCode,
      region: choice.place.region,
      country: choice.place.country,
      kind: choice.place.kind,
    },
    approximate: choice.approximate,
  };
}

/**
 * Save (or clear, with `null`) an organization's declared location — one
 * request, completed entirely server-side.
 */
export async function saveOrganizationLocation(
  choice: OrgLocationChoice | null,
  options?: { repo?: string },
): Promise<void> {
  await saveOrgLocationViaProxy(choice ? choicePayload(choice) : null, options);
}

/**
 * Mint the location record for a choice and return the strong ref, without
 * touching the organization record — the creation flow includes the ref in
 * the org record it writes itself.
 */
export async function createOrgLocationStrongRef(
  choice: OrgLocationChoice,
  options?: { repo?: string },
): Promise<{ uri: string; cid: string }> {
  const result = await saveOrgLocationViaProxy(choicePayload(choice), { ...options, mintOnly: true });
  if (!result.uri || !result.cid) throw new Error("Could not publish the location.");
  return { uri: result.uri, cid: result.cid };
}
