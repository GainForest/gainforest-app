/**
 * Rewilding the Web grant applications.
 *
 * Applying is a feed post (app.gainforest.feed.post) carrying the
 * `rewilding-grant` tag plus the project the applicant chose (named in the post
 * text). The tag makes applications queryable, so a steward can review who
 * applied — the same lightweight, opt-in model as BioBlitz registration.
 */

import { indexerQuery } from "./indexer";
import { resolveBlobUrl } from "./pds";

/** Tag every Rewilding grant application post carries, so applicants are
 *  queryable from the admin review surface. */
export const REWILDING_GRANT_TAG = "rewilding-grant";

/** Public applications are paused while the current submissions are reviewed. */
export const REWILDING_GRANT_APPLICATIONS_OPEN = false;

export type GrantApplicant = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** The application post text — names the project the applicant applied with. */
  applicationText: string;
  postUri: string;
  createdAt: string;
};

type RawApplicantNode = {
  did?: string | null;
  uri?: string | null;
  createdAt?: string | null;
  text?: string | null;
  certifiedProfileData?: {
    displayName?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
  } | null;
};

type GrantApplicantsResponse = {
  appGainforestFeedPost?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: RawApplicantNode | null } | null> | null;
  } | null;
};

const GRANT_APPLICANTS_QUERY = `
  query GrantApplicants($first: Int!, $after: String, $tag: String!) {
    appGainforestFeedPost(
      first: $first
      after: $after
      where: { tags: { any: { eq: $tag } } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri createdAt text
          certifiedProfileData {
            displayName
            avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
          }
        }
      }
    }
  }
`;

/**
 * Every account that applied for the Rewilding grant, newest application first,
 * de-duplicated to one row per applicant (their most recent application). Names
 * + avatars come straight from the indexer; the project they applied with is in
 * `applicationText`. Returns an empty list on any error.
 */
export async function fetchGrantApplicants(signal?: AbortSignal): Promise<GrantApplicant[]> {
  const nodes: RawApplicantNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const data: GrantApplicantsResponse | null = await indexerQuery<GrantApplicantsResponse>(
      GRANT_APPLICANTS_QUERY,
      { first: 100, after, tag: REWILDING_GRANT_TAG },
      signal,
    ).catch(() => null);

    const connection: GrantApplicantsResponse["appGainforestFeedPost"] = data?.appGainforestFeedPost;
    nodes.push(...((connection?.edges ?? []).flatMap((edge: { node?: RawApplicantNode | null } | null) => (edge?.node ? [edge.node] : []))));
    after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor ?? null : null;
    if (!after) break;
  }

  // Sorted newest-first by the query, so the first row per DID is their latest.
  const seen = new Set<string>();
  const deduped: RawApplicantNode[] = [];
  for (const node of nodes) {
    const did = node.did?.trim();
    if (!did || seen.has(did)) continue;
    seen.add(did);
    deduped.push(node);
  }

  return Promise.all(
    deduped.map(async (node): Promise<GrantApplicant> => {
      const did = node.did!.trim();
      const ref = node.certifiedProfileData?.avatar?.image?.ref ?? null;
      return {
        did,
        displayName: node.certifiedProfileData?.displayName?.trim() || null,
        avatarUrl: ref ? await resolveBlobUrl(did, ref).catch(() => null) : null,
        applicationText: typeof node.text === "string" ? node.text.trim() : "",
        postUri: node.uri ?? "",
        createdAt: node.createdAt ?? "",
      };
    }),
  );
}
