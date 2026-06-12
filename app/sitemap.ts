import type { MetadataRoute } from "next";
import { INDEXER_URL, SITE_URL } from "./_lib/urls";

export const revalidate = 3600;

// Section pages plus every Bumicert detail page: each project page is a
// crawlable marketplace landing page (server-rendered title, description,
// OpenGraph, and JSON-LD). DID-based URLs redirect (308) to the handle-based
// canonical, which also carries the canonical <link>.
const ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/observations", priority: 0.8, changeFrequency: "daily" },
  { path: "/bumicerts", priority: 0.8, changeFrequency: "daily" },
  { path: "/organizations", priority: 0.8, changeFrequency: "weekly" },
  { path: "/leaderboard", priority: 0.7, changeFrequency: "weekly" },
  { path: "/donations", priority: 0.7, changeFrequency: "daily" },
  { path: "/devices", priority: 0.5, changeFrequency: "hourly" },
  { path: "/status", priority: 0.5, changeFrequency: "hourly" },
];

const BUMICERT_URIS_QUERY = `
  query SitemapBumicerts($first: Int!, $after: String) {
    orgHypercertsClaimActivity(first: $first, after: $after, sortBy: createdAt, sortDirection: DESC) {
      pageInfo { hasNextPage endCursor }
      edges { node { did rkey createdAt } }
    }
  }
`;

type SitemapBumicertNode = { did?: string | null; rkey?: string | null; createdAt?: string | null };

async function fetchBumicertEntries(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  let after: string | null = null;

  try {
    for (let page = 0; page < 5; page += 1) {
      const response: Response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: BUMICERT_URIS_QUERY, variables: { first: 1000, after } }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await response.json()) as {
        data?: {
          orgHypercertsClaimActivity?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: SitemapBumicertNode | null }>;
          } | null;
        };
      };
      const connection = json.data?.orgHypercertsClaimActivity;
      if (!connection) break;

      for (const edge of connection.edges ?? []) {
        const node = edge.node;
        if (!node?.did || !node.rkey) continue;
        entries.push({
          url: `${SITE_URL}/bumicert/${encodeURIComponent(node.did)}/${encodeURIComponent(node.rkey)}`,
          lastModified: node.createdAt ? new Date(node.createdAt) : undefined,
          changeFrequency: "weekly",
          priority: 0.6,
        });
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
  const lastModified = new Date();
  const sections: MetadataRoute.Sitemap = ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
  const bumicerts = await fetchBumicertEntries();
  return [...sections, ...bumicerts];
}
