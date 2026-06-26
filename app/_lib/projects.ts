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
 * the pins shown on data.gainforest.app's deployed Mapbox globe. (The S3
 * `gainforest-all-shapefiles.geojson` file is *not* used by the main
 * green_globe map — it's only wired into the separate "shapefile-related"
 * route, and would skip real ATProto orgs.)
 */

import { GLOBE_URL as GLOBE_ORIGIN } from "./urls";

const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL?.trim() ||
  "https://dev.hi.gainforest.app/graphql";

export type ProjectPin = {
  did: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Real app.gainforest.organization.info ATProto record, if indexed. */
  atUri: string | null;
  /** Real org cover/logo image resolved from Hyperindex → PDS blob, if present. */
  imageUrl: string | null;
};

type RawOrg = {
  did?: string;
  info?: { name?: string | null; country?: string | null } | null;
  mapPoint?: { lat?: number | null; lon?: number | null } | null;
};

type IndexedBlob = {
  ref?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

type IndexedSmallImage = {
  image?: IndexedBlob | null;
} | null;

type OrganizationInfoNode = {
  did: string;
  uri: string;
  displayName?: string | null;
  country?: string | null;
  coverImage?: IndexedSmallImage;
  logo?: IndexedSmallImage;
};

type OrganizationRecordMeta = {
  atUri: string | null;
  imageUrl: string | null;
};

type OrganizationInfoResponse = {
  data?: {
    appGainforestOrganizationInfo?: {
      edges?: Array<{ node?: OrganizationInfoNode | null }> | null;
    } | null;
  };
};

const ORG_IMAGES_QUERY = `
  query LandingOrganizationImages {
    appGainforestOrganizationInfo(first: 200) {
      edges {
        node {
          did
          uri
          displayName
          country
          coverImage { image { ref mimeType size } }
          logo { image { ref mimeType size } }
        }
      }
    }
  }
`;

const pdsHostCache = new Map<string, string | null>();

async function resolvePdsHost(did: string): Promise<string | null> {
  if (pdsHostCache.has(did)) return pdsHostCache.get(did) ?? null;
  try {
    const res = await fetch(`https://plc.directory/${did}`, {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      pdsHostCache.set(did, null);
      return null;
    }
    const doc: { service?: Array<{ type?: string; serviceEndpoint?: string }> } =
      await res.json();
    const endpoint = doc.service?.find(
      (s) => s.type === "AtprotoPersonalDataServer",
    )?.serviceEndpoint;
    const host = endpoint ? new URL(endpoint).host : null;
    pdsHostCache.set(did, host);
    return host;
  } catch {
    pdsHostCache.set(did, null);
    return null;
  }
}

async function resolveBlobUrl(
  did: string,
  image: IndexedSmallImage,
): Promise<string | null> {
  const ref = image?.image?.ref?.trim();
  if (!ref) return null;
  const host = await resolvePdsHost(did);
  if (!host) return null;
  return `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(ref)}`;
}

function imageLookupKey(name: string, country: string): string {
  return `${name.trim().toLocaleLowerCase()}|${country.trim().toLocaleLowerCase()}`;
}

async function fetchOrganizationRecordMeta(): Promise<
  Map<string, OrganizationRecordMeta>
> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        operationName: "LandingOrganizationImages",
        query: ORG_IMAGES_QUERY,
      }),
      next: { revalidate: 60 * 15 },
    });
    // Hyperindex can return partial data with HTTP 400 when one optional
    // blob subfield violates a non-null schema constraint. We still use
    // the successful edges rather than discarding every org record.
    const json = (await res.json()) as OrganizationInfoResponse;
    const nodes =
      json.data?.appGainforestOrganizationInfo?.edges
        ?.map((edge) => edge.node)
        .filter((node): node is OrganizationInfoNode => Boolean(node?.did)) ?? [];

    const entries = await Promise.all(
      nodes.map(async (node) => {
        // Prefer the editorial cover image; logo is a useful real-data
        // fallback when an org has not uploaded a cover yet.
        const imageUrl =
          (await resolveBlobUrl(node.did, node.coverImage ?? null)) ??
          (await resolveBlobUrl(node.did, node.logo ?? null));
        const meta = { atUri: node.uri?.trim() || null, imageUrl };
        const keys: Array<readonly [string, OrganizationRecordMeta]> = [
          [node.did, meta],
        ];
        if (node.displayName) {
          keys.push([imageLookupKey(node.displayName, node.country ?? ""), meta]);
        }
        return keys;
      }),
    );

    return new Map(entries.flat());
  } catch {
    return new Map();
  }
}

// Last-known community total, used only when the indexer is unreachable.
const FALLBACK_COMMUNITIES_TOTAL = 79;

/**
 * Honest count of GainForest communities/organisations indexed on ATProto.
 *
 * This is intentionally NOT `fetchProjectPins().length`. That array is only
 * the subset of orgs Green Globe can place on the map — each pin needs a
 * resolvable centroid, and the upstream mapPoint join frequently drops orgs
 * whose PDS isn't climateai.org (see the long note inside `fetchProjectPins`),
 * so it routinely undercounts (e.g. 20 mappable pins out of ~79 real orgs).
 *
 * The "how many frontline communities exist" stat on /about should reflect
 * every indexed org, not just the mappable ones, so we read the connection's
 * `totalCount` directly. Unlike `orgHypercertsCollection`, this count is not a
 * paginated subset — it's the true total of `app.gainforest.organization.info`
 * records.
 */
export async function fetchCommunitiesTotal(): Promise<number> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        operationName: "LandingCommunitiesTotal",
        query: `query LandingCommunitiesTotal { appGainforestOrganizationInfo { totalCount } }`,
      }),
      next: { revalidate: 60 * 15 },
    });
    if (!res.ok) throw new Error(`indexer ${res.status}`);
    const json = (await res.json()) as {
      data?: {
        appGainforestOrganizationInfo?: { totalCount?: number | null } | null;
      };
    };
    const n = json.data?.appGainforestOrganizationInfo?.totalCount;
    if (typeof n !== "number" || n <= 0) throw new Error("no totalCount");
    return n;
  } catch (err) {
    console.warn("[about] communities total fetch failed, using fallback", err);
    return FALLBACK_COMMUNITIES_TOTAL;
  }
}

export async function fetchProjectPins(): Promise<ProjectPin[]> {
  try {
    const url = `${GLOBE_ORIGIN}/api/list-organizations?info=true&mapPoint=true`;
    const res = await fetch(url, {
      // Match green_globe's ISR cadence (route.ts → revalidate = 300).
      next: { revalidate: 60 * 5 },
    });
    if (!res.ok) throw new Error(`green_globe ${res.status}`);
    const data = (await res.json()) as RawOrg[];
    const recordMeta = await fetchOrganizationRecordMeta();
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
      const country = org.info?.country?.trim() || "";
      const meta =
        recordMeta.get(did) ?? recordMeta.get(imageLookupKey(name, country));
      pins.push({
        did,
        name,
        country,
        lat,
        lon,
        atUri: meta?.atUri ?? null,
        imageUrl: meta?.imageUrl ?? null,
      });
    }
    // Upstream sometimes returns the full org list but with mapPoint: null
    // on every record. Root cause is in green_globe's listAllOrganizations
    // (src/lib/atproto/list-all-organizations.ts) — it hardcodes
    // PDS_ENDPOINT = "https://climateai.org" and tries to download every
    // org's GeoJSON blob from that single host, so non-climateai DIDs all
    // 404. When that happens green_globe's response carries names but
    // no mapPoints; the try-block never throws and we end up with [].
    //
    // We try our own indexer-based resolver as a second source before
    // giving up. It does what green_globe SHOULD do: resolve each DID's
    // PDS via plc.directory and fetch the blob from the actual home host.
    if (pins.length === 0) {
      console.warn(
        "[landing] /api/list-organizations returned 0 valid pins;",
        "falling back to indexer-direct pin resolution",
      );
      const indexerPins = await fetchPinsFromIndexer(recordMeta);
      if (indexerPins.length > 0) return indexerPins;
      console.warn(
        "[landing] indexer-direct resolution also yielded 0 pins;",
        "using static FALLBACK_PINS",
      );
      return FALLBACK_PINS;
    }
    return pins;
  } catch (err) {
    console.warn("[landing] project pins fetch failed, using fallback", err);
    return FALLBACK_PINS;
  }
}

// ── Indexer-direct pin resolution ───────────────────────────────
//
// Bypass green_globe's /api/list-organizations when its mapPoint join is
// broken, by walking the same source data ourselves: paginate org infos +
// default sites from the indexer, resolve certified-location records to
// coordinates (parsing inline GeoJSON, or downloading the blob from the
// DID's actual PDS for binary GeoJSON). Self-heals: as soon as upstream
// is fixed this code path is bypassed by the primary fetch above.

type DefaultSiteNode = { did: string; site: string };

type CertifiedLocationByUriNode = {
  did: string;
  name: string | null;
  locationType: string | null;
  location:
    | { __typename: "AppCertifiedLocationString"; string: string | null }
    | {
        __typename: "OrgHypercertsDefsSmallBlob";
        blob: { ref?: string | null; mimeType?: string | null; size?: number | null } | null;
      }
    | null;
} | null;

async function indexerGql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 60 * 15 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function fetchAllDefaultSites(): Promise<DefaultSiteNode[]> {
  const all: DefaultSiteNode[] = [];
  let after: string | null = null;
  const QUERY = `
    query LandingAllDefaultSites($after: String) {
      appGainforestOrganizationDefaultSite(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { did site } }
      }
    }
  `;
  type Page = {
    appGainforestOrganizationDefaultSite: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{ node: DefaultSiteNode | null }>;
    };
  };
  for (let i = 0; i < 20; i++) {
    const data: Page | null = await indexerGql<Page>(QUERY, { after });
    const conn: Page["appGainforestOrganizationDefaultSite"] | undefined =
      data?.appGainforestOrganizationDefaultSite;
    if (!conn) break;
    for (const e of conn.edges) {
      if (e.node?.did && e.node.site) all.push({ did: e.node.did, site: e.node.site });
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return all;
}

function centroidFromGeoJson(g: unknown): { lat: number; lon: number } | null {
  if (!g || typeof g !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON has a deeply variadic shape
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
  let sx = 0, sy = 0, n = 0;
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
  // Common shape on simple certified locations: "lat,lon" as a bare string.
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

async function resolveCertifiedLocationCoords(
  siteUri: string,
): Promise<{ lat: number; lon: number } | null> {
  const QUERY = `
    query LandingCertifiedLocByUri($uri: String!) {
      appCertifiedLocationByUri(uri: $uri) {
        did name locationType
        location {
          __typename
          ... on AppCertifiedLocationString { string }
          ... on OrgHypercertsDefsSmallBlob {
            blob { ref mimeType size }
          }
        }
      }
    }
  `;
  const data = await indexerGql<{ appCertifiedLocationByUri: CertifiedLocationByUriNode }>(
    QUERY,
    { uri: siteUri },
  );
  const node = data?.appCertifiedLocationByUri;
  if (!node?.location) return null;
  // Inline string — zero PDS round-trips, always works.
  if (node.location.__typename === "AppCertifiedLocationString") {
    const s = node.location.string;
    if (typeof s === "string" && s.length > 0) {
      const c = parseInlineLocationString(s);
      if (c) return c;
    }
    return null;
  }
  // Blob — needs to be downloaded from the DID's actual PDS. This is the
  // step green_globe gets wrong (hardcoded climateai.org). We resolve
  // plc.directory per DID instead so any community PDS works.
  if (node.location.__typename === "OrgHypercertsDefsSmallBlob") {
    const ref = node.location.blob?.ref?.trim();
    if (!ref || !node.did) return null;
    const host = await resolvePdsHost(node.did);
    if (!host) return null;
    try {
      // Hard per-blob timeout. Community PDSes can be very slow or
      // unreachable; we must not let a single hang block the whole page
      // render. 4s is enough for healthy hosts and short enough that 12
      // parallel workers stay well within the Vercel function budget.
      const r = await fetch(
        `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
          node.did,
        )}&cid=${encodeURIComponent(ref)}`,
        {
          next: { revalidate: 60 * 60 },
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (!r.ok) return null;
      const geo = (await r.json()) as unknown;
      return centroidFromGeoJson(geo);
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchPinsFromIndexer(
  recordMeta: Map<string, OrganizationRecordMeta>,
): Promise<ProjectPin[]> {
  // We already have org names + countries from the same
  // appGainforestOrganizationInfo query that fetchOrganizationRecordMeta
  // runs; query it again here in a shape that includes the displayName /
  // country so we don't depend on green_globe's response at all.
  const ORGS_QUERY = `
    query LandingOrgsForIndexerPins {
      appGainforestOrganizationInfo(first: 500) {
        edges { node { did uri displayName country } }
      }
    }
  `;
  const [orgsData, defaultSites] = await Promise.all([
    indexerGql<{
      appGainforestOrganizationInfo: {
        edges: Array<{
          node: { did: string; uri?: string | null; displayName?: string | null; country?: string | null } | null;
        }>;
      };
    }>(ORGS_QUERY),
    fetchAllDefaultSites(),
  ]);
  if (!orgsData || defaultSites.length === 0) return [];
  const orgsByDid = new Map<string, { name: string; country: string; uri: string | null }>();
  for (const e of orgsData.appGainforestOrganizationInfo.edges) {
    const n = e.node;
    if (!n?.did || !n.displayName) continue;
    orgsByDid.set(n.did, {
      name: n.displayName.trim(),
      country: n.country?.trim() ?? "",
      uri: n.uri?.trim() || null,
    });
  }

  // Resolve coords for each default site in parallel (capped at 12 to keep
  // upstream pressure low — typical site count is ~50).
  const results: ProjectPin[] = [];
  const queue = [...defaultSites];
  const workers = Array.from({ length: 12 }, async () => {
    while (queue.length > 0) {
      const ds = queue.shift();
      if (!ds) break;
      // We only support app.certified.location here; the legacy
      // app.gainforest.organization.site lexicon is intentionally skipped
      // (rare; green_globe will resume serving those once their endpoint
      // is fixed).
      if (!ds.site.includes("/app.certified.location/")) continue;
      const org = orgsByDid.get(ds.did);
      if (!org) continue;
      const coords = await resolveCertifiedLocationCoords(ds.site);
      if (!coords) continue;
      const meta = recordMeta.get(ds.did);
      results.push({
        did: ds.did,
        name: org.name,
        country: org.country,
        lat: Number(coords.lat.toFixed(5)),
        lon: Number(coords.lon.toFixed(5)),
        atUri: meta?.atUri ?? org.uri,
        imageUrl: meta?.imageUrl ?? null,
      });
    }
  });
  await Promise.all(workers);
  return results;
}

// Tiny fallback so the globe is never completely empty if the upstream
// endpoint is unreachable.
const FALLBACK_PINS: ProjectPin[] = [
  {
    did: "fallback-agape",
    name: "Agape Hand",
    country: "PE",
    lat: -11.26,
    lon: -75.64,
    atUri: null,
    imageUrl: null,
  },
  {
    did: "fallback-bula",
    name: "Bula Garden Tanzania",
    country: "TZ",
    lat: -4.8,
    lon: 38.29,
    atUri: null,
    imageUrl: null,
  },
  {
    did: "fallback-lobongia",
    name: "Restoring Lobongia rangelands",
    country: "UG",
    lat: 3.51,
    lon: 34.13,
    atUri: null,
    imageUrl: null,
  },
  {
    did: "fallback-marina-gardens",
    name: "Marina Gardens",
    country: "SG",
    lat: 1.28,
    lon: 103.86,
    atUri: null,
    imageUrl: null,
  },
  {
    did: "fallback-precious",
    name: "Precious Forests",
    country: "BR",
    lat: -3.47,
    lon: -62.21,
    atUri: null,
    imageUrl: null,
  },
];
