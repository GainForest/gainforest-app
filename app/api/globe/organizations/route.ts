import { NextResponse } from "next/server";
import { GLOBE_URL } from "../../../_lib/urls";
import { fetchMaEarthOrganizationDids, indexerQuery } from "../../../_lib/indexer";
import { resolvePdsHost } from "../../../_lib/pds";
import { geojsonBounds } from "../../../globe/_lib/data";

// Organization roster for the native globe view.
//
// Two sources are merged server-side (and cached via ISR):
//   1. Green Globe's curated `list-organizations` index (name/country/mapPoint)
//      — the same roster data.gainforest.app plots. Proxied because the
//      upstream does not serve CORS headers.
//   2. Every Ma Earth–badged organization from the shared indexer. Many of
//      these are not in the Green Globe index (or lack a curated pin), so we
//      derive a pin from their certified-location records: inline "lat,lon" /
//      GeoJSON strings first, then (bounded) one boundary blob per org.
//
// Caching: an in-process memo (plus the s-maxage response header for the CDN)
// instead of route-level ISR — the enrichment step mixes cached fetches with
// PDS blob reads, and ISR's params-blind route cache made staleness opaque.
export const dynamic = "force-dynamic";
// The cold build resolves one boundary blob per pin-less org; give the
// function room beyond the platform default.
export const maxDuration = 60;

const ROSTER_TTL_MS = 600_000;
/** A build that lost the badge index is served briefly, then rebuilt. */
const DEGRADED_ROSTER_TTL_MS = 30_000;
const UPSTREAM_REVALIDATE_SECONDS = 600;

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

type RawOrg = {
  did?: string;
  info?: { name?: string | null; country?: string | null } | null;
  mapPoint?: { lat?: number | null; lon?: number | null } | null;
};

async function fetchGreenGlobeRoster(): Promise<Map<string, GlobeOrgOut>> {
  const roster = new Map<string, GlobeOrgOut>();
  try {
    const res = await fetch(`${GLOBE_URL}/api/list-organizations?info=true&mapPoint=true`, {
      next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
    });
    if (res.ok) {
      const orgs = (await res.json()) as RawOrg[];
      for (const org of orgs) {
        const did = org.did?.trim();
        const name = org.info?.name?.trim();
        if (!did || !name) continue;
        const lat = org.mapPoint?.lat;
        const lon = org.mapPoint?.lon;
        roster.set(did, {
          did,
          name,
          country: org.info?.country?.trim() || null,
          lat: typeof lat === "number" ? lat : null,
          lon: typeof lon === "number" ? lon : null,
          maEarth: false,
          droneLayers: 0,
          dataLayers: 0,
        });
      }
    }
  } catch {
    /* fall through with whatever we have */
  }
  return roster;
}

// ── Ma Earth enrichment ─────────────────────────────────────────────────────

type Point = { lat: number; lon: number };

/** Parse an inline location value: "lat,lon" text or inline GeoJSON. */
function parseInlineLocation(text: string): Point | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (match) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    return null;
  }
  try {
    const bounds = geojsonBounds(JSON.parse(trimmed) as GeoJSON.GeoJSON);
    if (bounds) return { lat: (bounds[1] + bounds[3]) / 2, lon: (bounds[0] + bounds[2]) / 2 };
  } catch {
    /* not JSON */
  }
  return null;
}

type EnrichLocation = {
  did?: string;
  location?: {
    __typename?: string;
    string?: string | null;
    blob?: { ref?: string | null } | null;
  } | null;
};

type EnrichData = {
  profiles?: { edges?: Array<{ node?: { did?: string; displayName?: string | null } | null } | null> | null };
  locations?: { edges?: Array<{ node?: EnrichLocation | null } | null> | null };
};

const ENRICH_QUERY = `
  query GlobeMaEarthEnrich($dids: [String!]!) {
    profiles: appCertifiedActorProfile(where: { did: { in: $dids } }, first: 400) {
      edges { node { did displayName } }
    }
    locations: appCertifiedLocation(where: { did: { in: $dids } }, first: 1000) {
      edges {
        node {
          did
          location {
            __typename
            ... on AppCertifiedLocationString { string }
            ... on OrgHypercertsDefsSmallBlob { blob { ref } }
          }
        }
      }
    }
  }
`;

/** Fetch one boundary blob and derive a centroid-ish point (bounds center). */
async function pinFromBlob(did: string, ref: string): Promise<Point | null> {
  try {
    const host = await resolvePdsHost(did);
    if (!host) return null;
    const url = `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return parseInlineLocation(await res.text());
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    }),
  );
  return results;
}

/** The indexer caps `in` filter lists; stay under it. */
const IN_FILTER_CHUNK = 100;

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/** Names + derived pins for Ma Earth orgs the curated roster doesn't cover. */
async function enrichMaEarthOrgs(dids: string[]): Promise<{
  names: Map<string, string>;
  pins: Map<string, Point>;
}> {
  const names = new Map<string, string>();
  const pins = new Map<string, Point>();
  if (dids.length === 0) return { names, pins };

  const blobCandidates = new Map<string, string>();

  await mapWithConcurrency(chunk(dids, IN_FILTER_CHUNK), 4, async (batch) => {
    const data = await indexerQuery<EnrichData>(ENRICH_QUERY, { dids: batch }).catch((error) => {
      console.warn("[globe/organizations] enrich batch failed", error);
      return null;
    });
    if (!data) return;

    for (const edge of data.profiles?.edges ?? []) {
      const node = edge?.node;
      if (node?.did && node.displayName?.trim()) names.set(node.did, node.displayName.trim());
    }

    // Group locations per org; prefer cheap inline strings for the pin.
    for (const edge of data.locations?.edges ?? []) {
      const node = edge?.node;
      if (!node?.did || pins.has(node.did)) continue;
      const loc = node.location;
      if (loc?.__typename === "AppCertifiedLocationString" && loc.string) {
        const point = parseInlineLocation(loc.string);
        if (point) {
          pins.set(node.did, point);
          blobCandidates.delete(node.did);
          continue;
        }
      }
      if (loc?.__typename === "OrgHypercertsDefsSmallBlob" && loc.blob?.ref && !blobCandidates.has(node.did)) {
        blobCandidates.set(node.did, loc.blob.ref);
      }
    }
  });

  // One bounded blob fetch per org still missing a pin.
  const pending = [...blobCandidates.entries()].filter(([did]) => !pins.has(did));
  await mapWithConcurrency(pending, 16, async ([did, ref]) => {
    const point = await pinFromBlob(did, ref);
    if (point) pins.set(did, point);
  });

  return { names, pins };
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

async function fetchMaEarthDidsWithRetry(): Promise<string[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchMaEarthOrganizationDids();
    } catch (error) {
      console.warn(`[globe/organizations] Ma Earth badge index failed (attempt ${attempt + 1})`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return null;
}

type RosterBuild = { organizations: GlobeOrgOut[]; degraded: boolean };

async function buildRoster(): Promise<RosterBuild> {
  const [roster, maEarthDidsOrNull, layerStats] = await Promise.all([
    fetchGreenGlobeRoster(),
    fetchMaEarthDidsWithRetry(),
    fetchLayerStats(),
  ]);
  const maEarthDids = maEarthDidsOrNull ?? [];

  const maEarthSet = new Set(maEarthDids);
  for (const org of roster.values()) {
    org.maEarth = maEarthSet.has(org.did);
  }

  // Ma Earth orgs missing from the curated roster, or listed without a pin.
  const enrichDids = maEarthDids.filter((did) => {
    const existing = roster.get(did);
    return !existing || existing.lat === null;
  });

  try {
    const { names, pins } = await enrichMaEarthOrgs(enrichDids);
    for (const did of enrichDids) {
      const pin = pins.get(did) ?? null;
      const existing = roster.get(did);
      if (existing) {
        if (existing.lat === null && pin) {
          existing.lat = pin.lat;
          existing.lon = pin.lon;
        }
        continue;
      }
      const name = names.get(did);
      if (!name) continue; // no certified profile — nothing presentable to show
      roster.set(did, {
        did,
        name,
        country: null,
        lat: pin?.lat ?? null,
        lon: pin?.lon ?? null,
        maEarth: true,
        droneLayers: 0,
        dataLayers: 0,
      });
    }
  } catch {
    /* enrichment is best-effort; the curated roster still renders */
  }

  for (const org of roster.values()) {
    const layerStat = layerStats.get(org.did);
    org.dataLayers = layerStat?.total ?? 0;
    org.droneLayers = layerStat?.drone ?? 0;
  }

  return { organizations: [...roster.values()], degraded: maEarthDidsOrNull === null };
}

let rosterMemo: { at: number; ttl: number; promise: Promise<RosterBuild> } | null = null;

export async function GET() {
  if (!rosterMemo || Date.now() - rosterMemo.at > rosterMemo.ttl) {
    const promise = buildRoster();
    const memo = { at: Date.now(), ttl: ROSTER_TTL_MS, promise };
    rosterMemo = memo;
    promise.then(
      (build) => {
        // A build without the badge index only lives briefly.
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
