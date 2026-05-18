/**
 * Live project locations for the landing globe.
 *
 * Matches green_globe's `useIndexedOrganizations` hook one-for-one — its
 * source is **ATProto**, indexed by Hyperindex:
 *
 *   /api/list-organizations?info=true&mapPoint=true
 *     ⇒ ALL_ORGANIZATION_INFOS (visibility = "Public") on Hyperindex
 *     ⇒ ALL_DEFAULT_SITES + CERTIFIED_LOCATION_BY_URI
 *     ⇒ centroid of the GeoJSON blob on the org's PDS
 *
 * green_globe then client-side filters with:
 *   organizations.filter(o => o.mapPoint !== null && o.info !== null)
 *
 * We reproduce that here, so the pins shown on this landing are exactly
 * the pins shown on gainforest.app's deployed Mapbox globe. (The S3
 * `gainforest-all-shapefiles.geojson` file is *not* used by the main
 * green_globe map — it's only wired into the separate "shapefile-related"
 * route, and would skip real ATProto orgs.)
 */

const GLOBE_ORIGIN =
  process.env.NEXT_PUBLIC_GREEN_GLOBE_URL?.trim() || "https://gainforest.app";

export type ProjectPin = {
  did: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
};

type RawOrg = {
  did?: string;
  info?: { name?: string | null; country?: string | null } | null;
  mapPoint?: { lat?: number | null; lon?: number | null } | null;
};

export async function fetchProjectPins(): Promise<ProjectPin[]> {
  try {
    const url = `${GLOBE_ORIGIN}/api/list-organizations?info=true&mapPoint=true`;
    const res = await fetch(url, {
      // Match green_globe's ISR cadence (route.ts → revalidate = 300).
      next: { revalidate: 60 * 5 },
    });
    if (!res.ok) throw new Error(`green_globe ${res.status}`);
    const data = (await res.json()) as RawOrg[];
    const pins: ProjectPin[] = [];
    for (const org of data) {
      // Literal port of green_globe's `useIndexedOrganizations` filter
      // (src/app/(map-routes)/(main)/_hooks/useIndexedOrganizations.ts):
      //
      //   organizations.filter(
      //     (o) => o.mapPoint !== null && o.info !== null,
      //   );
      //
      // We additionally require a non-empty name so tooltips never render
      // "undefined" — green_globe assumes name is present once info isn't
      // null, but we're defensive at the data boundary.
      const did = org.did?.trim();
      const name = org.info?.name?.trim();
      const lat = org.mapPoint?.lat;
      const lon = org.mapPoint?.lon;
      if (!did || !name) continue;
      if (typeof lat !== "number" || typeof lon !== "number") continue;
      pins.push({
        did,
        name,
        country: org.info?.country?.trim() || "",
        lat,
        lon,
      });
    }
    return pins;
  } catch (err) {
    console.warn("[landing] project pins fetch failed, using fallback", err);
    return FALLBACK_PINS;
  }
}

// Tiny fallback so the globe is never completely empty if the upstream
// endpoint is unreachable.
const FALLBACK_PINS: ProjectPin[] = [
  { did: "fallback-agape", name: "Agape Hand", country: "PE", lat: -11.26, lon: -75.64 },
  { did: "fallback-bula", name: "Bula Garden Tanzania", country: "TZ", lat: -4.8, lon: 38.29 },
  { did: "fallback-lobongia", name: "Restoring Lobongia rangelands", country: "UG", lat: 3.51, lon: 34.13 },
  { did: "fallback-marina-gardens", name: "Marina Gardens", country: "SG", lat: 1.28, lon: 103.86 },
  { did: "fallback-precious", name: "Precious Forests", country: "BR", lat: -3.47, lon: -62.21 },
];
