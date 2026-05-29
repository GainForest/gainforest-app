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
  "https://hi.gainforest.app/graphql";

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
    // on every record (a regression in green_globe's defaultSite →
    // certified-location → centroid pipeline). When that happens the
    // try-block doesn't throw — we just end up with an empty pins array.
    // Fall back so the globe is never completely empty even when the
    // upstream is "reachable but broken".
    if (pins.length === 0) {
      console.warn(
        "[landing] /api/list-organizations returned 0 valid pins (likely the",
        "upstream mapPoint join is broken); using fallback pins instead.",
        "Raw org count was",
        data.length,
      );
      return FALLBACK_PINS;
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
