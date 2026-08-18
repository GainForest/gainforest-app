import { fetchIndexedCertifiedProfileCards, indexerQuery } from "./indexer";
import { PUBLIC_EXPLORE_CACHE_TTL_MS, publicExploreCache } from "./public-explore-cache";

/**
 * "Endorsements given" by an organization.
 *
 * An endorsement is an `app.certified.badge.award` record an org signs *in its
 * own repo* against a badge whose *definition* is typed `endorsement` (the
 * "Organization Endorsement" badge). The award's subject is the endorsed org —
 * either a bare DID or a StrongRef into that org's repo.
 *
 * We read the awards straight from the org's repo, resolve each referenced
 * badge definition's `badgeType`, and keep only the endorsement-typed ones.
 * This deliberately excludes an org's other awards (e.g. Data Council
 * membership badges, which are written into the org's own repo too but are
 * governance, not an endorsement of another organization).
 *
 * Mirrors the inverse of the "Trusted by" signal: "Trusted by X" means X
 * endorsed this org; "Endorsements given" lists everyone this org endorsed.
 */

const ENDORSEMENT_BADGE_TYPE = "endorsement";
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const DEFINITION_REPO_IN_LIMIT = 100;

type Connection<T> = {
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  edges?: Array<{ node?: T | null } | null> | null;
};

type AwardNode = {
  createdAt?: string | null;
  badge?: { uri?: string | null } | null;
  subject?: { __typename?: string; did?: string | null; uri?: string | null } | null;
};

type DefinitionNode = {
  uri?: string | null;
  badgeType?: string | null;
};

type AwardsPayload = { appCertifiedBadgeAward?: Connection<AwardNode> | null };
type DefinitionsPayload = { appCertifiedBadgeDefinition?: Connection<DefinitionNode> | null };

const AWARDS_QUERY = `
  query EndorsementsGivenAwards($repo: String!, $first: Int!, $after: String) {
    appCertifiedBadgeAward(
      first: $first
      after: $after
      where: { did: { eq: $repo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          createdAt
          badge { uri }
          subject {
            __typename
            ... on AppCertifiedDefsDid { did }
            ... on ComAtprotoRepoStrongRef { uri }
          }
        }
      }
    }
  }
`;

const DEFINITIONS_QUERY = `
  query EndorsementDefinitions($repos: [String!]!, $first: Int!, $after: String) {
    appCertifiedBadgeDefinition(
      first: $first
      after: $after
      where: { did: { in: $repos } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri badgeType } }
    }
  }
`;

/** A resolved organization this org has endorsed, for card rendering. */
export type EndorsedOrganization = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
};

function nodes<T>(connection: Connection<T> | null | undefined): T[] {
  return (connection?.edges ?? []).flatMap((edge) => (edge?.node ? [edge.node] : []));
}

/** The repo DID that owns an `at://did:.../collection/rkey` record. */
function didFromAtUri(uri: string): string | null {
  const match = uri.trim().match(/^at:\/\/(did:[^/]+)\//);
  return match ? match[1] : null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

/** Of the given candidate badge-definition URIs, the subset typed `endorsement`. */
async function fetchEndorsementBadgeUris(
  candidateUris: Set<string>,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const result = new Set<string>();
  const repos = new Set<string>();
  for (const uri of candidateUris) {
    const repo = didFromAtUri(uri);
    if (repo) repos.add(repo);
  }
  if (repos.size === 0) return result;

  for (const repoChunk of chunk([...repos], DEFINITION_REPO_IN_LIMIT)) {
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const payload: DefinitionsPayload | null = await indexerQuery<DefinitionsPayload>(
        DEFINITIONS_QUERY,
        { repos: repoChunk, first: PAGE_SIZE, after },
        signal,
      );
      const connection: Connection<DefinitionNode> | null | undefined = payload?.appCertifiedBadgeDefinition;
      for (const definition of nodes(connection)) {
        const uri = definition.uri?.trim();
        if (uri && candidateUris.has(uri) && definition.badgeType?.trim().toLowerCase() === ENDORSEMENT_BADGE_TYPE) {
          result.add(uri);
        }
      }
      after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor ?? null : null;
      if (!after) break;
    }
  }

  return result;
}

async function fetchEndorsedDidsUncached(orgDid: string, signal?: AbortSignal): Promise<string[]> {
  const awards: AwardNode[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const payload: AwardsPayload | null = await indexerQuery<AwardsPayload>(
      AWARDS_QUERY,
      { repo: orgDid, first: PAGE_SIZE, after },
      signal,
    );
    const connection: Connection<AwardNode> | null | undefined = payload?.appCertifiedBadgeAward;
    awards.push(...nodes(connection));
    after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor ?? null : null;
    if (!after) break;
  }
  if (awards.length === 0) return [];

  const badgeUris = new Set<string>();
  for (const award of awards) {
    const uri = award.badge?.uri?.trim();
    if (uri) badgeUris.add(uri);
  }
  const endorsementBadgeUris = await fetchEndorsementBadgeUris(badgeUris, signal);
  if (endorsementBadgeUris.size === 0) return [];

  // Awards come back newest-first; keep that order for the endorsed orgs.
  const seen = new Set<string>();
  const dids: string[] = [];
  for (const award of awards) {
    const badgeUri = award.badge?.uri?.trim();
    if (!badgeUri || !endorsementBadgeUris.has(badgeUri)) continue;
    const subject = award.subject;
    let did: string | null = null;
    if (subject?.__typename === "AppCertifiedDefsDid" && subject.did?.startsWith("did:")) {
      did = subject.did;
    } else if (subject?.__typename === "ComAtprotoRepoStrongRef" && subject.uri) {
      did = didFromAtUri(subject.uri);
    }
    if (!did || did === orgDid || seen.has(did)) continue;
    seen.add(did);
    dids.push(did);
  }
  return dids;
}

/** DIDs this org has endorsed, newest-first. Cached per org. */
function fetchEndorsedDidsByDid(orgDid: string, signal?: AbortSignal): Promise<string[]> {
  if (!orgDid.startsWith("did:")) return Promise.resolve([]);
  return publicExploreCache(
    "endorsements-given",
    { orgDid, ttl: PUBLIC_EXPLORE_CACHE_TTL_MS },
    () => fetchEndorsedDidsUncached(orgDid),
    signal,
  );
}

/** How many organizations this org has endorsed. Drives the profile tab's
 *  visibility, so it swallows errors and returns 0. */
export async function fetchEndorsementsGivenCount(orgDid: string, signal?: AbortSignal): Promise<number> {
  const dids = await fetchEndorsedDidsByDid(orgDid, signal).catch(() => []);
  return dids.length;
}

/** The organizations this org has endorsed, resolved to profile cards
 *  (name + avatar), newest-first. */
export async function fetchEndorsementsGiven(orgDid: string, signal?: AbortSignal): Promise<EndorsedOrganization[]> {
  const dids = await fetchEndorsedDidsByDid(orgDid, signal);
  if (dids.length === 0) return [];
  const cards = await fetchIndexedCertifiedProfileCards(dids, signal).catch(() => new Map());
  return dids.map((did) => {
    const card = cards.get(did);
    return {
      did,
      displayName: card?.displayName?.trim() || null,
      avatarUrl: card?.avatarUrl ?? null,
    };
  });
}
