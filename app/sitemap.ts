import type { MetadataRoute } from "next";
import { fetchPubliclyListedDids } from "./_lib/indexer";
import { INDEXER_URL } from "./_lib/urls";
import { getRequestOrigin } from "./_lib/request-origin";
import { SUPPORTED_LOCALES, type SupportedLanguageCode } from "@/lib/i18n/languages";
import { getCanonicalPathname, getSeoLocalizedPathnames } from "@/lib/i18n/routing";

export const revalidate = 3600;

type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFrequency = NonNullable<SitemapEntry["changeFrequency"]>;

// Section pages plus the detail pages of accounts that put themselves on the
// public explore pages. Each of those project pages is a crawlable marketplace
// landing page (server-rendered title, description, OpenGraph, and JSON-LD)
// carrying the full impact-certificate experience. DID-based URLs redirect
// (308) to the handle-based canonical, which also carries the canonical <link>.
//
// Work belonging to an account that hasn't listed itself is left out entirely,
// and its pages carry a noindex of their own — it stays reachable by link
// without being offered to search engines. Nature sightings are the exception:
// they are browsable on /observations no matter who recorded them, so they are
// public by design and stay in the sitemap.
const ROUTES: Array<{ path: string; priority: number; changeFrequency: ChangeFrequency }> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/observations", priority: 0.8, changeFrequency: "daily" },
  { path: "/projects", priority: 0.8, changeFrequency: "daily" },
  { path: "/feed", priority: 0.65, changeFrequency: "daily" },
  { path: "/organizations", priority: 0.8, changeFrequency: "weekly" },
  { path: "/bioblitz", priority: 0.7, changeFrequency: "weekly" },
  { path: "/bioblitz/terms", priority: 0.35, changeFrequency: "yearly" },
  { path: "/bioblitz/privacy", priority: 0.35, changeFrequency: "yearly" },
  { path: "/grants", priority: 0.6, changeFrequency: "weekly" },
  { path: "/soundscape", priority: 0.5, changeFrequency: "monthly" },
  { path: "/shop", priority: 0.55, changeFrequency: "weekly" },
  { path: "/submit-data", priority: 0.55, changeFrequency: "weekly" },
  { path: "/labeler", priority: 0.6, changeFrequency: "daily" },
  { path: "/taina", priority: 0.55, changeFrequency: "weekly" },
  { path: "/devices", priority: 0.5, changeFrequency: "hourly" },
  { path: "/status", priority: 0.5, changeFrequency: "hourly" },
  { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
  { path: "/docs/data-model", priority: 0.45, changeFrequency: "monthly" },
  { path: "/docs/lexicons", priority: 0.4, changeFrequency: "monthly" },
  { path: "/docs/hypercerts", priority: 0.4, changeFrequency: "monthly" },
  { path: "/docs/atproto", priority: 0.4, changeFrequency: "monthly" },
  { path: "/docs/ePDS", priority: 0.4, changeFrequency: "monthly" },
  { path: "/docs/ePDS-router", priority: 0.4, changeFrequency: "monthly" },
  { path: "/docs/wallet-service", priority: 0.4, changeFrequency: "monthly" },
  { path: "/docs/cgs", priority: 0.4, changeFrequency: "monthly" },
  { path: "/docs/audiomoth", priority: 0.5, changeFrequency: "monthly" },
];

const ORGANIZATION_PROFILES_QUERY = `
  query SitemapOrganizations($first: Int!, $after: String) {
    appCertifiedActorOrganization(
      first: $first
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did createdAt visibility certifiedProfileData { displayName } } }
    }
  }
`;

const PROJECT_URIS_QUERY = `
  query SitemapProjects($first: Int!, $after: String) {
    orgHypercertsCollection(
      first: $first
      after: $after
      where: { type: { in: ["project", "Project"] } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did rkey createdAt } }
    }
  }
`;

const OBSERVATION_URIS_QUERY = `
  query SitemapObservations($first: Int!, $after: String) {
    appGainforestDwcOccurrence(
      first: $first
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did
          rkey
          createdAt
          thumbnailUrl
          speciesImageUrl
          imageEvidence { file { ref } }
        }
      }
    }
  }
`;

type SitemapOrganizationNode = {
  did?: string | null;
  createdAt?: string | null;
  visibility?: string | null;
  certifiedProfileData?: { displayName?: string | null } | null;
};

type SitemapProjectNode = { did?: string | null; rkey?: string | null; createdAt?: string | null };

type SitemapObservationNode = {
  did?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  thumbnailUrl?: string | null;
  speciesImageUrl?: string | null;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
};

function buildAbsoluteUrl(pathname: string, origin: string): string {
  return new URL(pathname, origin).toString();
}

function buildAlternates(pathname: string, origin: string): Record<SupportedLanguageCode, string> {
  const localizedPathnames = getSeoLocalizedPathnames(pathname);
  return Object.fromEntries(
    Object.entries(localizedPathnames).map(([locale, path]) => [
      locale,
      buildAbsoluteUrl(path, origin),
    ]),
  ) as Record<SupportedLanguageCode, string>;
}

function buildLocalizedEntries(options: {
  origin: string;
  pathname: string;
  lastModified?: string | Date;
  changeFrequency: ChangeFrequency;
  priority: number;
}): MetadataRoute.Sitemap {
  const alternates = buildAlternates(options.pathname, options.origin);

  return SUPPORTED_LOCALES.map((locale) => ({
    url: buildAbsoluteUrl(getCanonicalPathname(options.pathname, locale), options.origin),
    lastModified: options.lastModified,
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: {
      languages: alternates,
    },
  }));
}

function shouldIncludeOrganizationProfile(node: SitemapOrganizationNode): node is SitemapOrganizationNode & { did: string } {
  if (!node.did) return false;
  const visibility = node.visibility?.trim().toLowerCase();
  if (visibility === "private" || visibility === "hidden") return false;
  const displayName = node.certifiedProfileData?.displayName?.trim().toLowerCase() ?? "";
  return !/(^|\b)(test|demo|sample)(\b|$)/.test(displayName);
}

function shouldIncludeObservationDetail(node: SitemapObservationNode): node is SitemapObservationNode & { did: string; rkey: string } {
  if (!node.did || !node.rkey) return false;
  return Boolean(node.thumbnailUrl || node.speciesImageUrl || node.imageEvidence?.file?.ref);
}

/**
 * Accounts that put themselves on the public explore pages. Only their work is
 * offered to search engines: everything else stays reachable by link but out of
 * the sitemap (and carries a noindex on its own page). A failed lookup returns
 * an empty set, so a bad answer withholds pages rather than exposing them.
 */
async function listedDids(): Promise<Set<string>> {
  return fetchPubliclyListedDids().catch(() => new Set<string>());
}

async function fetchOrganizationEntries(origin: string): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  let after: string | null = null;
  const listed = await listedDids();
  if (listed.size === 0) return entries;

  try {
    for (let page = 0; page < 5; page += 1) {
      const response: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: ORGANIZATION_PROFILES_QUERY, variables: { first: 1000, after } }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await response.json()) as {
        data?: {
          appCertifiedActorOrganization?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: SitemapOrganizationNode | null }>;
          } | null;
        };
      };
      const connection = json.data?.appCertifiedActorOrganization;
      if (!connection) break;

      for (const edge of connection.edges ?? []) {
        const node = edge.node;
        if (!node || !shouldIncludeOrganizationProfile(node)) continue;
        if (!listed.has(node.did)) continue;
        entries.push(
          ...buildLocalizedEntries({
            origin,
            pathname: `/account/${encodeURIComponent(node.did)}`,
            lastModified: node.createdAt ? new Date(node.createdAt) : undefined,
            changeFrequency: "weekly",
            priority: 0.55,
          }),
        );
      }

      if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  } catch {
    // Best effort — fall back to the static section and project routes.
  }

  return entries;
}

async function fetchProjectEntries(origin: string): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  let after: string | null = null;
  const listed = await listedDids();
  if (listed.size === 0) return entries;

  try {
    for (let page = 0; page < 5; page += 1) {
      const response: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: PROJECT_URIS_QUERY, variables: { first: 1000, after } }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await response.json()) as {
        data?: {
          orgHypercertsCollection?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: SitemapProjectNode | null }>;
          } | null;
        };
      };
      const connection = json.data?.orgHypercertsCollection;
      if (!connection) break;

      for (const edge of connection.edges ?? []) {
        const node = edge.node;
        if (!node?.did || !node.rkey) continue;
        if (!listed.has(node.did)) continue;
        entries.push(
          ...buildLocalizedEntries({
            origin,
            pathname: `/projects/${encodeURIComponent(node.did)}/${encodeURIComponent(node.rkey)}`,
            lastModified: node.createdAt ? new Date(node.createdAt) : undefined,
            changeFrequency: "weekly",
            priority: 0.6,
          }),
        );
      }

      if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  } catch {
    // Best effort — fall back to the static section routes.
  }

  return entries;
}

async function fetchObservationEntries(origin: string): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  let after: string | null = null;

  try {
    // Bound this to recent, image-backed sightings: these now have complete
    // metadata and media-rich detail pages, while avoiding an unbounded sitemap.
    for (let page = 0; page < 2; page += 1) {
      const response: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: OBSERVATION_URIS_QUERY, variables: { first: 1000, after } }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await response.json()) as {
        data?: {
          appGainforestDwcOccurrence?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: SitemapObservationNode | null }>;
          } | null;
        };
      };
      const connection = json.data?.appGainforestDwcOccurrence;
      if (!connection) break;

      for (const edge of connection.edges ?? []) {
        const node = edge.node;
        if (!node || !shouldIncludeObservationDetail(node)) continue;
        entries.push(
          ...buildLocalizedEntries({
            origin,
            pathname: `/observations/${encodeURIComponent(node.did)}/${encodeURIComponent(node.rkey)}`,
            lastModified: node.createdAt ? new Date(node.createdAt) : undefined,
            changeFrequency: "weekly",
            priority: 0.45,
          }),
        );
      }

      if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  } catch {
    // Best effort — fall back to the static section, organization, and project routes.
  }

  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getRequestOrigin();
  const lastModified = new Date();
  const sections = ROUTES.flatMap(({ path, priority, changeFrequency }) =>
    buildLocalizedEntries({
      origin,
      pathname: path || "/",
      lastModified,
      changeFrequency,
      priority,
    }),
  );
  const [organizations, projects, observations] = await Promise.all([
    fetchOrganizationEntries(origin),
    fetchProjectEntries(origin),
    fetchObservationEntries(origin),
  ]);
  return [...sections, ...organizations, ...projects, ...observations];
}
