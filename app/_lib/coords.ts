/**
 * Coordinate resolution for the map view.
 *
 * Occurrences carry decimalLatitude/Longitude directly. Sites and Bumicerts
 * reference `app.certified.location` records instead, so their coordinates are
 * resolved here — a client-side port of gainforest-app's
 * `resolveCertifiedLocationCoords` (app/_lib/projects.ts):
 *
 *   - inline string  → parse "lat,lon" or inline GeoJSON
 *   - blob           → download the GeoJSON from the owner's PDS, take a centroid
 *
 * Sites map their DID → default-site AT-URI via
 * `appGainforestOrganizationDefaultSite`; Bumicerts use the activity's own
 * `locations[]` AT-URIs. Everything runs in the browser (indexer + plc +
 * PDS are CORS-open) and is bounded by a per-blob timeout + concurrency cap so
 * a slow community PDS never hangs the map.
 */

import { INDEXER_URL } from "./urls";
import { resolvePdsHost } from "./pds";
import type { ExplorerRecord, RecordKind } from "./indexer";

export type MapPoint = {
  lat: number;
  lon: number;
  label: string;
  did: string;
  /** Set when a loaded record backs this point (so a click opens its drawer).
   *  Unset for site pins that are not in the current loaded page. */
  recordId?: string;
};

// ── GeoJSON centroid + inline string parsing (ported) ──────────────────────

function centroidFromGeoJson(g: unknown): { lat: number; lon: number } | null {
  if (!g || typeof g !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON is deeply variadic
  const geo = g as any;
  if (geo.type === "Feature") return centroidFromGeoJson(geo.geometry);
  if (geo.type === "FeatureCollection") {
    for (const f of geo.features ?? []) {
      const c = centroidFromGeoJson(f?.geometry);
      if (c) return c;
    }
    return null;
  }
  if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
    const [lon, lat] = geo.coordinates;
    return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;
  }
  let ring: unknown[] | undefined;
  if (geo.type === "Polygon") ring = geo.coordinates?.[0];
  else if (geo.type === "MultiPolygon") ring = geo.coordinates?.[0]?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of ring) {
    if (Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      sx += p[0] as number;
      sy += p[1] as number;
      n++;
    }
  }
  return n ? { lon: sx / n, lat: sy / n } : null;
}

function parseInlineLocationString(str: string): { lat: number; lon: number } | null {
  const trimmed = str.trim();
  const m = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (m) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  try {
    return centroidFromGeoJson(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

// ── Certified-location → coordinates ───────────────────────────────────────

const CERT_LOC_QUERY = `
  query MapCertifiedLocByUri($uri: String!) {
    appCertifiedLocationByUri(uri: $uri) {
      did
      location {
        __typename
        ... on AppCertifiedLocationString { string }
        ... on OrgHypercertsDefsSmallBlob { blob { ref } }
      }
    }
  }
`;

const locCache = new Map<string, { lat: number; lon: number } | null>();

export async function resolveCertifiedLocationCoords(
  uri: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lon: number } | null> {
  if (locCache.has(uri)) return locCache.get(uri) ?? null;
  let result: { lat: number; lon: number } | null = null;
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: CERT_LOC_QUERY, variables: { uri } }),
      signal,
    });
    const json = (await res.json()) as {
      data?: {
        appCertifiedLocationByUri?: {
          did?: string;
          location?:
            | { __typename: "AppCertifiedLocationString"; string?: string | null }
            | { __typename: "OrgHypercertsDefsSmallBlob"; blob?: { ref?: string | null } | null }
            | null;
        } | null;
      };
    };
    const node = json.data?.appCertifiedLocationByUri;
    const loc = node?.location;
    if (loc?.__typename === "AppCertifiedLocationString" && loc.string) {
      result = parseInlineLocationString(loc.string);
    } else if (loc?.__typename === "OrgHypercertsDefsSmallBlob" && loc.blob?.ref && node?.did) {
      const host = await resolvePdsHost(node.did, signal);
      if (host) {
        const r = await fetch(
          `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
            node.did,
          )}&cid=${encodeURIComponent(loc.blob.ref)}`,
          { signal: signal ?? AbortSignal.timeout(5000) },
        );
        if (r.ok) result = centroidFromGeoJson(await r.json());
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    result = null;
  }
  locCache.set(uri, result);
  return result;
}

// ── Org DID → coordinates (Green Globe via our /api/site-points proxy) ──────
//
// The indexer's certified-location records for orgs are mostly geojson-URI
// stubs with a null uri, so we use Green Globe's curated mapPoints instead —
// the same did → {lat,lon} data data.gainforest.app plots.

type SitePoint = { lat: number; lon: number; name: string | null };
let sitePointPromise: Promise<Map<string, SitePoint>> | null = null;

// Note: deliberately NOT abortable. The site-point map is a global, cached
// fetch; tying it to a render's AbortSignal lets StrictMode's double-invoke
// cancel the first request and poison the cache with an empty result.
async function loadSitePointMap(): Promise<Map<string, SitePoint>> {
  if (sitePointPromise) return sitePointPromise;
  const p = (async () => {
    const map = new Map<string, SitePoint>();
    const res = await fetch("/api/site-points");
    if (!res.ok) throw new Error(`site-points ${res.status}`);
    const json = (await res.json()) as {
      points?: Record<string, { lat: number; lon: number; name?: string | null }>;
    };
    for (const [did, pt] of Object.entries(json.points ?? {})) {
      if (typeof pt?.lat === "number" && typeof pt?.lon === "number") {
        map.set(did, { lat: pt.lat, lon: pt.lon, name: pt.name ?? null });
      }
    }
    return map;
  })();
  sitePointPromise = p;
  // Don't cache a failure: allow a later retry to repopulate the map.
  p.catch(() => {
    if (sitePointPromise === p) sitePointPromise = null;
  });
  return p;
}

// ── Public: resolve points for a batch of records ──────────────────────────

const CONCURRENCY = 6;

async function runLimited(tasks: Array<() => Promise<void>>, signal?: AbortSignal) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      if (signal?.aborted) return;
      await tasks[i++]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
}

/**
 * Resolve map points for a set of records, emitting via `onProgress` as they
 * land. Occurrences resolve instantly from their own coordinates; sites and
 * bumicerts resolve their certified locations in the background.
 */
export async function resolvePointsFor(
  records: ExplorerRecord[],
  kind: RecordKind,
  opts: { onProgress?: (points: MapPoint[]) => void; signal?: AbortSignal } = {},
): Promise<MapPoint[]> {
  const { onProgress, signal } = opts;
  const points: MapPoint[] = [];

  if (kind === "occurrence") {
    for (const r of records) {
      if (r.kind === "occurrence" && r.lat != null && r.lon != null) {
        points.push({
          lat: r.lat,
          lon: r.lon,
          label: r.scientificName || r.vernacularName || "Unidentified",
          did: r.did,
          recordId: r.id,
        });
      }
    }
    onProgress?.([...points]);
    return points;
  }

  if (kind === "bumicert") {
    const targets = records.filter(
      (r): r is Extract<ExplorerRecord, { kind: "bumicert" }> =>
        r.kind === "bumicert" && r.locationUris.length > 0,
    );
    const tasks = targets.map((r) => async () => {
      const coords = await resolveCertifiedLocationCoords(r.locationUris[0], signal);
      if (coords) {
        points.push({ ...coords, label: r.title, did: r.did, recordId: r.id });
        onProgress?.([...points]);
      }
    });
    await runLimited(tasks, signal);
    return points;
  }

  // Sites: plot every project-site pin (the full geographic picture, like the
  // globe), not just the loaded page. Pins backed by a loaded record open its
  // drawer; the rest link out to the org on Bumicerts.
  const siteMap = await loadSitePointMap();
  const loadedByDid = new Map(
    records.filter((r) => r.kind === "site").map((r) => [r.did, r.id]),
  );
  for (const [did, pt] of siteMap) {
    points.push({
      lat: pt.lat,
      lon: pt.lon,
      label: pt.name || did,
      did,
      recordId: loadedByDid.get(did),
    });
  }
  onProgress?.([...points]);
  return points;
}
