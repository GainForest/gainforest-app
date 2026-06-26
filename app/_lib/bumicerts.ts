/**
 * Live Bumicerts fetcher for the landing page.
 *
 * Matches certs.gainforest.app/bumicerts's exact filter logic:
 *   labelTier = "high-quality" (from the hyperlabel service)
 *
 * That's how Bumicerts itself decides "what's a real, fundable project" —
 * the hyperlabel scorer (see /tmp/bumicerts-monorepo/apps/bumicerts/graphql/
 * indexer/queries/_hyperlabel.ts + _labeller-scorer.ts) tags every claim
 * activity with one of five tiers based on signal density (title/desc
 * quality, image present, locations linked, work scope, contributors, etc.)
 * and only `high-quality` shows on the landing.
 *
 * Pipeline, mirroring fetchTierMatchedActivityNodes() in the monorepo:
 *   1. GET https://hyperlabel-production.up.railway.app/api/recent?tier=high-quality
 *      → list of URIs that pass the bar
 *   2. For each URI, query the indexer's
 *      orgHypercertsClaimActivityByUri to get title, image blob ref, etc.
 *   3. Resolve image blob refs to public PDS sync URLs via plc.directory
 *   4. Sort by createdAt DESC
 *
 * - Server-only; revalidates every 15 minutes.
 * - Safe: any network/schema hiccup falls back to a curated static set.
 */

import { BUMICERTS_URL as BUMICERTS_BASE } from "./urls";

// Dev indexer. We default to the dev host (dev.hi.gainforest.app) and
// let an env override (NEXT_PUBLIC_INDEXER_URL) point at the production
// host (hi.gainforest.app) when needed.
const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL?.trim() ||
  "https://dev.hi.gainforest.app/graphql";

const HYPERLABEL_URL =
  process.env.NEXT_PUBLIC_HYPERLABEL_URL?.trim() ||
  "https://hyperlabel-production.up.railway.app";

/** Revalidate live data every 15 minutes. */
const REVALIDATE_SECONDS = 60 * 15;

export type LiveBumicert = {
  id: string;
  did: string;
  rkey: string;
  title: string;
  shortDescription: string;
  /** Resolved CDN-style URL or null. */
  imageUrl: string | null;
  href: string;
  createdAt: string;
};

export type LiveBumicertsSnapshot = {
  /** Total high-quality projects according to the hyperlabel scorer. */
  total: number;
  /**
   * Total org projects in the GainForest data commons; counted from the
   * indexer's `orgHypercertsCollection.totalCount`. This is the honest
   * "how big is the commons?" number and is much larger than `total`
   * (which only counts the high-quality tier). Use this for KPI cards
   * and "X projects" footers; use `total` only when you specifically
   * mean "high-quality bumicerts shown in the carousel".
   */
  orgsTotal: number;
  /**
   * Total individual Bumicerts (claim activities) signed on ATProto;
   * counted from `orgHypercertsClaimActivity.totalCount`. A "Bumicert" is
   * an `org.hypercerts.claim.activity` record — the thing each
   * `/bumicert/<did>-<rkey>` page renders — so this is the right number
   * whenever the label literally says "Bumicerts". It differs from
   * `orgsTotal`, which counts org PROJECTS (`orgHypercertsCollection`) and
   * backs the landing card's "X projects found" footer.
   */
  bumicertsTotal: number;
  bumicerts: LiveBumicert[];
  /** True when we served the static fallback because the upstream was unreachable. */
  fromFallback: boolean;
};

// ── Hyperlabel ───────────────────────────────────────────────────────────────

type HyperlabelActivity = {
  did: string;
  rkey: string;
  uri: string;
  title: string;
  tier: string;
  labeledAt: string | null;
};

type HyperlabelRecentResponse = {
  activities: Array<{
    did?: string;
    rkey?: string | null;
    uri?: string | null;
    title?: string | null;
    tier?: string;
    labeledAt?: string | null;
  }>;
  total?: number;
};

async function fetchHighQualityHyperlabels(): Promise<{
  activities: HyperlabelActivity[];
  total: number;
}> {
  const url = `${HYPERLABEL_URL}/api/recent?limit=2000&offset=0&tier=high-quality`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`Hyperlabel ${res.status}`);
  const json = (await res.json()) as HyperlabelRecentResponse;
  const activities: HyperlabelActivity[] = [];
  for (const raw of json.activities ?? []) {
    if (!raw.did) continue;
    const rkey = raw.rkey ?? null;
    const uri =
      raw.uri ??
      (rkey ? `at://${raw.did}/org.hypercerts.claim.activity/${rkey}` : null);
    if (!uri) continue;
    activities.push({
      did: raw.did,
      rkey: rkey ?? extractRkey(uri),
      uri,
      title: raw.title ?? "",
      tier: raw.tier ?? "high-quality",
      labeledAt: raw.labeledAt ?? null,
    });
  }
  return { activities, total: json.total ?? activities.length };
}

function extractRkey(uri: string): string {
  // at://did/collection/rkey → rkey
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? "";
}

// ── Indexer commons total ─────────────────────────────────

/**
 * Honest commons-scale count: every org project registered as a Hypercert
 * via GainForest, regardless of hyperlabel tier. Used for the
 * "X projects found" KPIs across the landing, About, and Explorer.
 */
async function fetchOrgsTotal(): Promise<number | null> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        operationName: "LandingOrgsTotal",
        query: `query LandingOrgsTotal { orgHypercertsCollection { totalCount } }`,
      }),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { orgHypercertsCollection?: { totalCount?: number | null } | null };
    };
    const n = json.data?.orgHypercertsCollection?.totalCount;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

/**
 * Honest count of individual Bumicerts (claim activities) signed on ATProto.
 * A Bumicert is an `org.hypercerts.claim.activity` record (what each
 * `/bumicert/<did>-<rkey>` page renders), NOT an `org.hypercerts.collection`
 * (which counts org projects and backs `fetchOrgsTotal`). This connection's
 * `totalCount` is uncapped, so it is the truthful "Bumicerts signed on
 * ATProto" number for the /about stat.
 */
async function fetchBumicertsTotal(): Promise<number | null> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        operationName: "LandingBumicertsTotal",
        query: `query LandingBumicertsTotal { orgHypercertsClaimActivity { totalCount } }`,
      }),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        orgHypercertsClaimActivity?: { totalCount?: number | null } | null;
      };
    };
    const n = json.data?.orgHypercertsClaimActivity?.totalCount;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

// ── Indexer per-URI fetch ────────────────────────────────────────────────────

type SmallImageBlob = {
  ref?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

type ActivityImage =
  | { __typename: "OrgHypercertsDefsUri"; uri: string | null }
  | { __typename: "OrgHypercertsDefsSmallImage"; image: SmallImageBlob | null }
  | null;

type ActivityNode = {
  did: string;
  rkey: string;
  uri: string;
  createdAt: string;
  title: string | null;
  shortDescription: string | null;
  image: ActivityImage;
};

type ActivityByUriResponse = {
  data?: {
    orgHypercertsClaimActivityByUri?: ActivityNode | null;
  };
  errors?: Array<{ message: string }>;
};

const ACTIVITY_BY_URI_QUERY = `
  query LandingActivityByUri($uri: String!) {
    orgHypercertsClaimActivityByUri(uri: $uri) {
      did
      rkey
      uri
      createdAt
      title
      shortDescription
      image {
        __typename
        ... on OrgHypercertsDefsUri { uri }
        ... on OrgHypercertsDefsSmallImage {
          image { ref mimeType size }
        }
      }
    }
  }
`;

async function fetchActivityByUri(uri: string): Promise<ActivityNode | null> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        operationName: "LandingActivityByUri",
        query: ACTIVITY_BY_URI_QUERY,
        variables: { uri },
      }),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ActivityByUriResponse;
    return json.data?.orgHypercertsClaimActivityByUri ?? null;
  } catch {
    return null;
  }
}

// ── PDS resolution (module-scoped cache) ─────────────────────────────────────

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

async function resolveImageUrl(
  did: string,
  image: ActivityImage,
): Promise<string | null> {
  if (!image) return null;
  if (image.__typename === "OrgHypercertsDefsUri") {
    return typeof image.uri === "string" ? image.uri : null;
  }
  const ref = image.image?.ref;
  if (!ref) return null;
  const host = await resolvePdsHost(did);
  if (!host) return null;
  return `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(ref)}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchLiveBumicerts(
  count = 12,
): Promise<LiveBumicertsSnapshot> {
  try {
    // Hyperlabel + orgs-total run in parallel — they hit different upstreams
    // (hyperlabel-production vs hi.gainforest.app) and the orgs-total query
    // is small so it never holds up the carousel render.
    const [{ activities: hq, total }, orgsTotalRaw, bumicertsTotalRaw] =
      await Promise.all([
        fetchHighQualityHyperlabels(),
        fetchOrgsTotal(),
        fetchBumicertsTotal(),
      ]);
    const orgsTotal = orgsTotalRaw ?? FALLBACK_SNAPSHOT.orgsTotal;
    const bumicertsTotal = bumicertsTotalRaw ?? FALLBACK_SNAPSHOT.bumicertsTotal;
    // Take a slightly larger window than `count` so we can drop any URIs the
    // indexer no longer resolves without coming up short.
    const window = hq.slice(0, Math.max(count * 2, 24));

    const nodes = await Promise.all(
      window.map((h) => fetchActivityByUri(h.uri)),
    );

    type Resolved = { node: ActivityNode; hyperlabel: HyperlabelActivity };
    const resolved: Resolved[] = [];
    nodes.forEach((node, i) => {
      const hyperlabel = window[i];
      if (node && hyperlabel) resolved.push({ node, hyperlabel });
    });

    // Sort by createdAt DESC, matching fetchTierMatchedActivityNodes().
    resolved.sort((a, b) =>
      (b.node.createdAt ?? "").localeCompare(a.node.createdAt ?? ""),
    );

    const bumicerts: LiveBumicert[] = await Promise.all(
      resolved.slice(0, count).map(async ({ node, hyperlabel }) => ({
        id: `${node.did}-${node.rkey}`,
        did: node.did,
        rkey: node.rkey,
        // Prefer the indexer's title (canonical), fall back to the hyperlabel
        // record's title which is always populated.
        title: (node.title ?? hyperlabel.title ?? "Untitled bumicert").trim(),
        shortDescription: node.shortDescription ?? "",
        imageUrl: await resolveImageUrl(node.did, node.image),
        href: `${BUMICERTS_BASE}/bumicert/${encodeURIComponent(node.did)}-${encodeURIComponent(node.rkey)}`,
        createdAt: node.createdAt,
      })),
    );

    // Defensive: if every indexer call failed silently (e.g. indexer 502),
    // bumicerts is empty but no exception was thrown. Fall back to the
    // static snapshot in that case rather than rendering a blank card.
    // Hyperlabel's `total` is still meaningful (it's the actual count of
    // high-quality projects) so we preserve it on the way out.
    if (bumicerts.length === 0) {
      console.warn(
        "[landing] hyperlabel ok but indexer returned no nodes; using fallback bumicerts list",
      );
      return {
        ...FALLBACK_SNAPSHOT,
        total: total || FALLBACK_SNAPSHOT.total,
        orgsTotal,
        bumicertsTotal,
        fromFallback: true,
      };
    }

    return {
      total,
      orgsTotal,
      bumicertsTotal,
      bumicerts,
      fromFallback: false,
    };
  } catch (err) {
    console.warn("[landing] hyperlabel/indexer fetch failed, using fallback", err);
    return { ...FALLBACK_SNAPSHOT, fromFallback: true };
  }
}

// ── Static fallback ──────────────────────────────────────────────────────────

const FALLBACK_SNAPSHOT: LiveBumicertsSnapshot = {
  // Most recent observed values, used only when the upstream is unreachable.
  // `total` = hyperlabel's high-quality count; `orgsTotal` = indexer's
  // commons-wide count from `orgHypercertsCollection.totalCount`.
  total: 157,
  orgsTotal: 315,
  // `bumicertsTotal` = individual claim activities (org.hypercerts.claim.activity);
  // last observed ~1544 and always larger than `orgsTotal` (projects).
  bumicertsTotal: 1544,
  fromFallback: true,
  bumicerts: [
    {
      id: "did:plc:23xqsqgi7itr7mh5ep3sokrz-3mm2ndaqq2c2x",
      did: "did:plc:23xqsqgi7itr7mh5ep3sokrz",
      rkey: "3mm2ndaqq2c2x",
      title: "Restoring Lobongia rangelands in Kaabong, Uganda",
      shortDescription: "Lobongia Rangelands Restoration",
      imageUrl:
        "https://certified.one/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3A23xqsqgi7itr7mh5ep3sokrz&cid=bafkreibq2b6nqpsrs6xydzdx6ruejkgvghjzjrtkwgni2jvokuhb4iwo3y",
      href: `${BUMICERTS_BASE}/bumicert/did%3Aplc%3A23xqsqgi7itr7mh5ep3sokrz-3mm2ndaqq2c2x`,
      createdAt: "2026-05-17T13:30:10.076Z",
    },
    {
      id: "did:plc:snx6vj6r6odaaq54kda3vpnv-3mm2yqzj6r22x",
      did: "did:plc:snx6vj6r6odaaq54kda3vpnv",
      rkey: "3mm2yqzj6r22x",
      title: "Marina Gardens community restoration in Singapore",
      shortDescription: "Community-led mangrove restoration",
      imageUrl: null,
      href: `${BUMICERTS_BASE}/bumicerts`,
      createdAt: "2026-05-17T18:29:16.070Z",
    },
    {
      id: "did:plc:fallback-uganda-forest",
      did: "did:plc:fallback",
      rkey: "uganda-forest",
      title: "Community-led forest conservation in Uganda's Madi region",
      shortDescription: "Madi region forest stewardship",
      imageUrl: null,
      href: `${BUMICERTS_BASE}/bumicerts`,
      createdAt: "2026-05-16T00:00:00.000Z",
    },
  ],
};
