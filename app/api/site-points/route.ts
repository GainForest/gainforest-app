import { NextResponse } from "next/server";
import { GLOBE_URL } from "../../_lib/urls";

// Project-site coordinates for the map view. Sourced from Green Globe's
// `list-organizations` endpoint — the same did → mapPoint data that
// data.gainforest.app plots — and returned as a flat did → {lat,lon} map.
// Proxied here (server-side) so the browser map fetches it same-origin and
// the upstream's ISR cache cadence is respected.
export const revalidate = 600;

type RawOrg = {
  did?: string;
  info?: { name?: string | null } | null;
  mapPoint?: { lat?: number | null; lon?: number | null } | null;
};

export async function GET() {
  const points: Record<string, { lat: number; lon: number; name: string | null }> = {};
  try {
    const res = await fetch(
      `${GLOBE_URL}/api/list-organizations?info=true&mapPoint=true`,
      { next: { revalidate } },
    );
    if (res.ok) {
      const orgs = (await res.json()) as RawOrg[];
      for (const o of orgs) {
        const did = o.did?.trim();
        const lat = o.mapPoint?.lat;
        const lon = o.mapPoint?.lon;
        if (did && typeof lat === "number" && typeof lon === "number") {
          points[did] = { lat, lon, name: o.info?.name?.trim() || null };
        }
      }
    }
  } catch {
    /* return whatever we have (possibly empty) */
  }
  return NextResponse.json(
    { points },
    { headers: { "cache-control": "s-maxage=600, stale-while-revalidate=1800" } },
  );
}
