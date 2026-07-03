/**
 * Partner organization roster for the Partners section globe.
 *
 * Source: the merged GainForest app's `/api/globe/organizations` route
 * (bumicerts-clean-rewrite `app/api/globe/organizations/route.ts`),
 * which merges TWO rosters server-side:
 *
 *   1. Green Globe's curated `list-organizations` index (the ~dozens of
 *      orgs with organization.info + a curated map pin), and
 *   2. every Ma Earth–badged organization from the shared indexer,
 *      with pins derived from their certified-location records.
 *
 * That union is "all the Ma Earth + GainForest orgs" (~800+, ~680 with
 * coordinates) — a much bigger roster than the `fetchProjectPins()`
 * subset the Partners section used before. We consume it as-is instead
 * of re-implementing the merge: the upstream route is cached (600 s
 * memo + CDN s-maxage) and this fetch adds its own ISR revalidate.
 */

import { GAINFOREST_APP_URL } from "./urls";

export type PartnerOrg = {
  did: string;
  name: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  /** Ma Earth–badged organization (drives the Ma Earth fallback badge). */
  maEarth: boolean;
};

type RawOrg = {
  did?: string;
  name?: string;
  country?: string | null;
  lat?: number | null;
  lon?: number | null;
  maEarth?: boolean;
};

const REVALIDATE_SECONDS = 60 * 10;

export async function fetchPartnerOrgs(): Promise<PartnerOrg[]> {
  try {
    const res = await fetch(`${GAINFOREST_APP_URL}/api/globe/organizations`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`globe organizations ${res.status}`);
    const json = (await res.json()) as { organizations?: RawOrg[] };
    const orgs: PartnerOrg[] = (json.organizations ?? [])
      .filter((org) => Boolean(org?.did?.trim() && org?.name?.trim()))
      .map((org) => ({
        did: org.did!.trim(),
        name: org.name!.trim(),
        country: org.country?.trim() || null,
        lat: typeof org.lat === "number" ? org.lat : null,
        lon: typeof org.lon === "number" ? org.lon : null,
        maEarth: org.maEarth === true,
      }));
    if (orgs.length === 0) {
      console.warn(
        "[landing] partner org roster came back empty; using fallback",
      );
      return FALLBACK_PARTNER_ORGS;
    }
    return orgs;
  } catch (err) {
    console.warn("[landing] partner org roster fetch failed, using fallback", err);
    return FALLBACK_PARTNER_ORGS;
  }
}

// Tiny fallback (real orgs, real coordinates) so the Partners globe is
// never completely empty if the upstream endpoint is unreachable.
const FALLBACK_PARTNER_ORGS: PartnerOrg[] = [
  {
    did: "fallback-agape",
    name: "Agape Hand",
    country: "PE",
    lat: -11.26,
    lon: -75.64,
    maEarth: false,
  },
  {
    did: "fallback-bula",
    name: "Bula Garden Tanzania",
    country: "TZ",
    lat: -4.8,
    lon: 38.29,
    maEarth: true,
  },
  {
    did: "fallback-lobongia",
    name: "Restoring Lobongia rangelands",
    country: "UG",
    lat: 3.51,
    lon: 34.13,
    maEarth: false,
  },
  {
    did: "fallback-marina-gardens",
    name: "Marina Gardens",
    country: "SG",
    lat: 1.28,
    lon: 103.86,
    maEarth: false,
  },
];
