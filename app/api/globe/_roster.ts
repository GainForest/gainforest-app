/**
 * The globe's organization roster, resolved entirely from the shared indexer
 * (api.hi.gainforest.app).
 *
 * Membership is every `app.certified.actor.organization` record, plus any
 * Ma Earth–badged DID that has a certified profile but no organization record
 * yet. Hidden (steward-flagged) accounts and obvious E2E test orgs are dropped
 * so the globe matches the other public explore surfaces.
 *
 * Shared by `/api/globe/organizations` (full roster) and `/api/globe/trees`
 * (DIDs only) so both routes plot exactly the same set of organizations.
 */

import {
  fetchHiddenAccountDids,
  fetchMaEarthOrganizationDids,
  indexerQuery,
  isLikelyTestRecordName,
} from "../../_lib/indexer";

/** One roster organization as the indexer knows it. */
export type RosterOrg = {
  did: string;
  /** Certified profile display name. */
  name: string;
  /** AT-URI of the org's own declared location (`app.certified.location`). */
  locationUri: string | null;
};

const ROSTER_QUERY = `
  query GlobeOrgRoster($first: Int!, $after: String) {
    appCertifiedActorOrganization(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did
          certifiedProfileData { displayName }
          location { uri }
        }
      }
    }
  }
`;

type RosterNode = {
  did?: string | null;
  certifiedProfileData?: { displayName?: string | null } | null;
  location?: { uri?: string | null } | null;
};

type RosterData = {
  appCertifiedActorOrganization?: {
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
    edges?: Array<{ node?: RosterNode | null } | null> | null;
  } | null;
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

/** Every certified organization the indexer knows about. */
async function fetchCertifiedOrgs(): Promise<RosterOrg[] | null> {
  const orgs: RosterOrg[] = [];
  let after: string | null = null;
  let sawPage = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: RosterData | null = await indexerQuery<RosterData>(ROSTER_QUERY, {
      first: PAGE_SIZE,
      after,
    }).catch((error) => {
      console.warn("[globe/roster] certified org page failed", error);
      return null;
    });
    const conn: RosterData["appCertifiedActorOrganization"] = data?.appCertifiedActorOrganization;
    if (!conn) break;
    sawPage = true;
    for (const edge of conn.edges ?? []) {
      const node = edge?.node;
      const did = node?.did?.trim();
      const name = node?.certifiedProfileData?.displayName?.trim();
      // No certified profile name — nothing presentable to put on the globe.
      if (!did || !name) continue;
      orgs.push({ did, name, locationUri: node?.location?.uri?.trim() || null });
    }
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }

  return sawPage ? orgs : null;
}

const MA_EARTH_FALLBACK_QUERY = `
  query GlobeMaEarthFallback($dids: [String!]!) {
    profiles: appCertifiedActorProfile(where: { did: { in: $dids } }, first: 400) {
      edges { node { did displayName } }
    }
  }
`;

type MaEarthFallbackData = {
  profiles?: {
    edges?: Array<{ node?: { did?: string | null; displayName?: string | null } | null } | null> | null;
  } | null;
};

/** The indexer caps `in` filter lists; stay under it. */
const IN_FILTER_CHUNK = 100;

export function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/** Ma Earth–badged DIDs with a certified profile but no organization record —
 *  they'd otherwise drop off the globe entirely. Name only; an org without an
 *  organization record has no declared location to pin. */
async function fetchProfileOnlyOrgs(dids: string[]): Promise<RosterOrg[]> {
  if (dids.length === 0) return [];
  const orgs: RosterOrg[] = [];
  await Promise.all(
    chunk(dids, IN_FILTER_CHUNK).map(async (batch) => {
      const data = await indexerQuery<MaEarthFallbackData>(MA_EARTH_FALLBACK_QUERY, {
        dids: batch,
      }).catch((error) => {
        console.warn("[globe/roster] Ma Earth fallback batch failed", error);
        return null;
      });
      for (const edge of data?.profiles?.edges ?? []) {
        const did = edge?.node?.did?.trim();
        const name = edge?.node?.displayName?.trim();
        if (did && name) orgs.push({ did, name, locationUri: null });
      }
    }),
  );
  return orgs;
}

async function fetchMaEarthDidsWithRetry(): Promise<string[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchMaEarthOrganizationDids();
    } catch (error) {
      console.warn(`[globe/roster] Ma Earth badge index failed (attempt ${attempt + 1})`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return null;
}

export type GlobeRoster = {
  orgs: RosterOrg[];
  /** DIDs carrying a Ma Earth badge — a display flag, not a data source. */
  maEarth: Set<string>;
  /** True when the certified-org listing or the badge index came back empty. */
  degraded: boolean;
};

/** The globe's roster: every certified organization, plus Ma Earth–badged
 *  accounts that only have a profile, minus hidden and test accounts. */
export async function fetchGlobeRoster(): Promise<GlobeRoster> {
  const [certifiedOrgs, maEarthDids, hidden] = await Promise.all([
    fetchCertifiedOrgs(),
    fetchMaEarthDidsWithRetry(),
    fetchHiddenAccountDids().catch(() => new Set<string>()),
  ]);

  const orgs = certifiedOrgs ?? [];
  const seen = new Set(orgs.map((org) => org.did));
  const maEarth = new Set(maEarthDids ?? []);

  const profileOnly = await fetchProfileOnlyOrgs([...maEarth].filter((did) => !seen.has(did)));
  for (const org of profileOnly) {
    if (seen.has(org.did)) continue;
    seen.add(org.did);
    orgs.push(org);
  }

  return {
    orgs: orgs.filter((org) => !hidden.has(org.did) && !isLikelyTestRecordName(org.name)),
    maEarth,
    degraded: certifiedOrgs === null || maEarthDids === null,
  };
}
