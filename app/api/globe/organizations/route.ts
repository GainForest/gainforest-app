import { NextResponse } from "next/server";
import { GLOBE_URL } from "../../../_lib/urls";

// Organization roster for the native globe view. Sourced from Green Globe's
// `list-organizations` endpoint — the curated did → name/country/mapPoint
// index data.gainforest.app plots — and proxied server-side so the browser
// fetches it same-origin (the upstream does not serve CORS headers).
export const revalidate = 600;

type RawOrg = {
  did?: string;
  info?: { name?: string | null; country?: string | null } | null;
  mapPoint?: { lat?: number | null; lon?: number | null } | null;
};

export async function GET() {
  const organizations: Array<{
    did: string;
    name: string;
    country: string | null;
    lat: number | null;
    lon: number | null;
  }> = [];

  try {
    const res = await fetch(`${GLOBE_URL}/api/list-organizations?info=true&mapPoint=true`, {
      next: { revalidate },
    });
    if (res.ok) {
      const orgs = (await res.json()) as RawOrg[];
      for (const org of orgs) {
        const did = org.did?.trim();
        const name = org.info?.name?.trim();
        if (!did || !name) continue;
        const lat = org.mapPoint?.lat;
        const lon = org.mapPoint?.lon;
        organizations.push({
          did,
          name,
          country: org.info?.country?.trim() || null,
          lat: typeof lat === "number" ? lat : null,
          lon: typeof lon === "number" ? lon : null,
        });
      }
    }
  } catch {
    /* return whatever we have (possibly empty) */
  }

  return NextResponse.json(
    { organizations },
    { headers: { "cache-control": "s-maxage=600, stale-while-revalidate=1800" } },
  );
}
