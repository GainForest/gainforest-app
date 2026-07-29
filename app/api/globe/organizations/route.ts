import { NextResponse } from "next/server";
import { indexerQuery } from "../../../_lib/indexer";
import { countryCodeFromCertifiedLocation } from "../../../_lib/country-location";
import { resolvePdsHost } from "../../../_lib/pds";
import { geojsonBounds } from "../../../globe/_lib/data";
import { chunk, fetchGlobeRoster } from "../_roster";

// Organization roster for the native globe view, resolved entirely from the
// shared indexer (api.hi.gainforest.app). Every org is treated the same way,
// whether or not it carries a Ma Earth badge:
//
//   - membership: every `app.certified.actor.organization` record, plus Ma
//                 Earth–badged accounts that only have a certified profile
//                 (see `../_roster`)
//   - name:       certified profile displayName
//   - pin +
//     country:    the org's own declared location — the `app.certified.location`
//                 record referenced by `app.certified.actor.organization/self`.
//                 Most orgs store it in a small blob rather than inline, so the
//                 blob is read from the org's PDS. A declared area (including
//                 the circle a fuzzy/obscured location uses) is pinned at its
//                 center. Nothing is ever derived from project-site geometry —
//                 the pin always comes from the org's own location record.
//   - maEarth:    a display flag from the badge index, nothing more
//
// Caching: an in-process memo (plus the s-maxage response header for the CDN)
// instead of route-level ISR — ISR's params-blind route cache made staleness
// opaque.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROSTER_TTL_MS = 600_000;
/** A build that lost the indexer roster or badge index is served briefly, then rebuilt. */
const DEGRADED_ROSTER_TTL_MS = 30_000;

type GlobeOrgOut = {
  did: string;
  name: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  maEarth: boolean;
  /** Published drone-imagery layers (orthomosaics / aerial tiles). */
  droneLayers: number;
  /** All published map data layers. */
  dataLayers: number;
};

// ── Declared-location resolution (pin + country from one record read) ────────

type Point = { lat: number; lon: number };

/** Parse a declared coordinate: "lat,lon". */
function parseCoordinate(text: string): Point | null {
  const match = text.trim().match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/** The point to pin an org at, from its own declared location value: either a
 *  bare coordinate, or the center of the area it declared. Orgs that generalise
 *  their location publish a circle, whose bounds center is its true center. */
function pointFromDeclaredLocation(text: string): Point | null {
  const trimmed = text.trim();
  const coordinate = parseCoordinate(trimmed);
  if (coordinate) return coordinate;
  try {
    const bounds = geojsonBounds(JSON.parse(trimmed) as GeoJSON.GeoJSON);
    if (bounds) return { lon: (bounds[0] + bounds[2]) / 2, lat: (bounds[1] + bounds[3]) / 2 };
  } catch {
    /* not GeoJSON either — no pin */
  }
  return null;
}

type ResolvedLocation = { point: Point | null; country: string | null };

/** Pin + country from one declared location value: the country is recognised
 *  when the coordinate matches the country the org picked from the list. */
function resolvedFromLocationText(text: string): ResolvedLocation {
  return {
    point: pointFromDeclaredLocation(text),
    country: countryCodeFromCertifiedLocation({ location: { string: text } }),
  };
}

type LocationNode = {
  location?: {
    __typename?: string;
    string?: string | null;
    blob?: { ref?: string | null } | null;
  } | null;
};

/** The indexer aliases cleanly, so a batch of location records is one query. */
const LOCATION_BATCH_SIZE = 100;
/** Declared-location blobs are small and cluster on a couple of PDS hosts. */
const BLOB_CONCURRENCY = 24;
const BLOB_TIMEOUT_MS = 5000;

/** Read one declared-location blob (a "lat,lon" or GeoJSON payload) from its PDS. */
async function fetchDeclaredLocationBlob(did: string, ref: string): Promise<string | null> {
  try {
    const host = await resolvePdsHost(did);
    if (!host) return null;
    const url = `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await fn(items[index]!);
      }
    }),
  );
}

/** Resolve org declared locations to a map pin + country code. The record
 *  stores its value either inline or in a small blob on the org's PDS — both
 *  are the org's own declared location, so both are read. */
async function resolveDeclaredLocations(
  entries: Array<[string, string]>,
): Promise<Map<string, ResolvedLocation>> {
  const resolved = new Map<string, ResolvedLocation>();
  if (entries.length === 0) return resolved;

  const fields = `{
    location {
      __typename
      ... on AppCertifiedLocationString { string }
      ... on OrgHypercertsDefsSmallBlob { blob { ref } }
    }
  }`;

  // did → blob ref, for the majority of orgs that store the coordinate as a blob.
  const blobRefs: Array<[string, string]> = [];

  await Promise.all(
    chunk(entries, LOCATION_BATCH_SIZE).map(async (batch) => {
      const query = `query GlobeOrgDeclaredLocations {\n${batch
        .map(([, uri], index) => `l${index}: appCertifiedLocationByUri(uri: ${JSON.stringify(uri)}) ${fields}`)
        .join("\n")}\n}`;
      const data = await indexerQuery<Record<string, LocationNode | null>>(query, {}).catch((error) => {
        console.warn("[globe/organizations] declared-location batch failed", error);
        return null;
      });
      if (!data) return;
      batch.forEach(([did], index) => {
        const loc = data[`l${index}`]?.location;
        if (loc?.__typename === "AppCertifiedLocationString" && loc.string) {
          resolved.set(did, resolvedFromLocationText(loc.string));
        } else if (loc?.__typename === "OrgHypercertsDefsSmallBlob" && loc.blob?.ref) {
          blobRefs.push([did, loc.blob.ref]);
        }
      });
    }),
  );

  await mapWithConcurrency(blobRefs, BLOB_CONCURRENCY, async ([did, ref]) => {
    const text = await fetchDeclaredLocationBlob(did, ref);
    if (text) resolved.set(did, resolvedFromLocationText(text));
  });

  return resolved;
}

// ── Data-layer stats ─────────────────────────────────────────────────────────────

/** Layer types that render drone/aerial imagery on the globe. */
const DRONE_LAYER_TYPES = new Set(["raster_tif", "tms_tile"]);

const LAYER_STATS_QUERY = `
  query GlobeLayerStats($first: Int!, $after: String) {
    appGainforestOrganizationLayer(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { did type } }
    }
  }
`;

type LayerStats = Map<string, { drone: number; total: number }>;

type LayerStatsData = {
  appGainforestOrganizationLayer?: {
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
    edges?: Array<{ node?: { did?: string; type?: string } | null } | null> | null;
  } | null;
};

/** Count published map data layers per organization (one indexer scan) so the
 *  globe can surface + filter orgs with drone imagery and extra data. */
async function fetchLayerStats(): Promise<LayerStats> {
  const stats: LayerStats = new Map();
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    const data: LayerStatsData | null = await indexerQuery<LayerStatsData>(LAYER_STATS_QUERY, {
      first: 1000,
      after,
    }).catch((error) => {
      console.warn("[globe/organizations] layer stats failed", error);
      return null;
    });
    const conn: LayerStatsData["appGainforestOrganizationLayer"] = data?.appGainforestOrganizationLayer;
    if (!conn) break;
    for (const edge of conn.edges ?? []) {
      const node = edge?.node;
      if (!node?.did) continue;
      const entry = stats.get(node.did) ?? { drone: 0, total: 0 };
      entry.total += 1;
      if (node.type && DRONE_LAYER_TYPES.has(node.type)) entry.drone += 1;
      stats.set(node.did, entry);
    }
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return stats;
}

type RosterBuild = { organizations: GlobeOrgOut[]; degraded: boolean };

async function buildRoster(): Promise<RosterBuild> {
  const [roster, layerStats] = await Promise.all([fetchGlobeRoster(), fetchLayerStats()]);

  const declaredLocations = await resolveDeclaredLocations(
    roster.orgs.flatMap((org) => (org.locationUri ? [[org.did, org.locationUri] as [string, string]] : [])),
  ).catch(() => new Map<string, ResolvedLocation>());

  const organizations = roster.orgs.map((org) => {
    const declared = declaredLocations.get(org.did) ?? null;
    const layerStat = layerStats.get(org.did);
    return {
      did: org.did,
      name: org.name,
      country: declared?.country ?? null,
      lat: declared?.point?.lat ?? null,
      lon: declared?.point?.lon ?? null,
      maEarth: roster.maEarth.has(org.did),
      droneLayers: layerStat?.drone ?? 0,
      dataLayers: layerStat?.total ?? 0,
    };
  });

  return { organizations, degraded: roster.degraded };
}

let rosterMemo: { at: number; ttl: number; promise: Promise<RosterBuild> } | null = null;

export async function GET() {
  if (!rosterMemo || Date.now() - rosterMemo.at > rosterMemo.ttl) {
    const promise = buildRoster();
    const memo = { at: Date.now(), ttl: ROSTER_TTL_MS, promise };
    rosterMemo = memo;
    promise.then(
      (build) => {
        // A build missing its upstreams only lives briefly.
        if (rosterMemo === memo && build.degraded) memo.ttl = DEGRADED_ROSTER_TTL_MS;
      },
      () => {
        // A failed build should not poison the memo.
        if (rosterMemo === memo) rosterMemo = null;
      },
    );
  }

  let build: RosterBuild = { organizations: [], degraded: true };
  try {
    build = await rosterMemo.promise;
  } catch {
    /* return an empty roster; the client tolerates it */
  }

  return NextResponse.json(
    { organizations: build.organizations },
    {
      headers: {
        "cache-control": build.degraded
          ? "s-maxage=30, stale-while-revalidate=120"
          : "s-maxage=600, stale-while-revalidate=1800",
      },
    },
  );
}
