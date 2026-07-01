import type { MetadataRoute } from "next";
import { INDEXER_URL } from "./_lib/urls";
import { getRequestOrigin } from "./_lib/request-origin";
import { SUPPORTED_LOCALES, type SupportedLanguageCode } from "@/lib/i18n/languages";
import { getLocalizedPathnames, withLocalePrefix } from "@/lib/i18n/routing";

export const revalidate = 3600;

type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFrequency = NonNullable<SitemapEntry["changeFrequency"]>;

// Section pages plus every project detail page: each project page is a
// crawlable marketplace landing page (server-rendered title, description,
// OpenGraph, and JSON-LD) carrying the full impact-certificate experience.
// DID-based URLs redirect (308) to the handle-based canonical, which also
// carries the canonical <link>.
const ROUTES: Array<{ path: string; priority: number; changeFrequency: ChangeFrequency }> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/observations", priority: 0.8, changeFrequency: "daily" },
  { path: "/projects", priority: 0.8, changeFrequency: "daily" },
  { path: "/organizations", priority: 0.8, changeFrequency: "weekly" },
  { path: "/leaderboard", priority: 0.7, changeFrequency: "weekly" },
  { path: "/bioblitz", priority: 0.7, changeFrequency: "weekly" },
  { path: "/donations", priority: 0.7, changeFrequency: "daily" },
  { path: "/grants", priority: 0.6, changeFrequency: "weekly" },
  { path: "/devices", priority: 0.5, changeFrequency: "hourly" },
  { path: "/status", priority: 0.5, changeFrequency: "hourly" },
  { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
  { path: "/docs/lexicons", priority: 0.4, changeFrequency: "monthly" },
];

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

type SitemapProjectNode = { did?: string | null; rkey?: string | null; createdAt?: string | null };

function buildAbsoluteUrl(pathname: string, origin: string): string {
  return new URL(pathname, origin).toString();
}

function buildAlternates(pathname: string, origin: string): Record<SupportedLanguageCode, string> {
  const localizedPathnames = getLocalizedPathnames(pathname);
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
    url: buildAbsoluteUrl(withLocalePrefix(options.pathname, locale), options.origin),
    lastModified: options.lastModified,
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: {
      languages: alternates,
    },
  }));
}

async function fetchProjectEntries(origin: string): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  let after: string | null = null;

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
  const projects = await fetchProjectEntries(origin);
  return [...sections, ...projects];
}
