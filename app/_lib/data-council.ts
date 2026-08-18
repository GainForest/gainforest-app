import { fetchIndexedCertifiedProfileCards, indexerQuery } from "./indexer";
import { resolveInternalBadgeRepoDid } from "@/app/internal/badges/_lib/access";
import { BADGE_AWARD_COLLECTION } from "@/app/internal/badges/_lib/badge-records";
import type { CgsServerMember } from "./cgs-server";

const DATA_COUNCIL_BADGE_RKEY = process.env.DATA_COUNCIL_BADGE_RKEY?.trim() || "3monk2b3xak2i";
const DATA_COUNCIL_INDEXER_LIMIT = 1000;

type DataCouncilBadge = {
  rkey: string;
  uri: string;
  cid: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
};

type DataCouncilAward = {
  rkey: string;
  uri: string;
  cid: string;
  subjectDid: string | null;
  createdAt: string;
};

export type DataCouncilState = {
  repo: string;
  members: CgsServerMember[];
  badge: DataCouncilBadge;
  awards: DataCouncilAward[];
  awardedDids: string[];
  canWriteBadges: boolean;
};

export type PublicDataCouncilMember = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type Connection<T> = {
  edges?: Array<{ node?: T | null } | null> | null;
};

type BadgeDefinitionNode = {
  uri?: string | null;
  cid?: string | null;
  rkey?: string | null;
  title?: string | null;
  description?: string | null;
};

type BadgeAwardNode = {
  uri?: string | null;
  cid?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  badge?: { uri?: string | null; cid?: string | null } | null;
  subject?: { did?: string | null } | null;
};

type DataCouncilIndexerPayload = {
  appCertifiedBadgeDefinition?: Connection<BadgeDefinitionNode> | null;
  appCertifiedBadgeAward?: Connection<BadgeAwardNode> | null;
};

const DATA_COUNCIL_QUERY = `
  query DataCouncilState($badgeRepo: String!, $awardRepo: String!, $first: Int!) {
    appCertifiedBadgeDefinition(
      first: $first
      where: { did: { eq: $badgeRepo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node { uri cid rkey title description } }
    }
    appCertifiedBadgeAward(
      first: $first
      where: { did: { eq: $awardRepo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges {
        node {
          uri cid rkey createdAt
          badge { uri cid }
          subject { __typename ... on AppCertifiedDefsDid { did } }
        }
      }
    }
  }
`;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function nodes<T>(connection: Connection<T> | null | undefined): T[] {
  return (connection?.edges ?? []).flatMap((edge) => edge?.node ? [edge.node] : []);
}

function normalizeAward(node: BadgeAwardNode, badgeUri: string, memberDids?: Set<string>): DataCouncilAward | null {
  const uri = stringValue(node.uri);
  const cid = stringValue(node.cid);
  if (!uri || !cid || stringValue(node.badge?.uri) !== badgeUri) return null;
  const subjectDid = stringValue(node.subject?.did);
  if (!subjectDid || (memberDids && !memberDids.has(subjectDid))) return null;
  return {
    rkey: stringValue(node.rkey) ?? rkeyFromUri(uri),
    uri,
    cid,
    subjectDid,
    createdAt: stringValue(node.createdAt) ?? "",
  };
}

async function loadDataCouncilPayload(awardRepo: string): Promise<{ badge: DataCouncilBadge; awards: DataCouncilAward[] }> {
  const badgeRepoDid = await resolveInternalBadgeRepoDid();
  if (!badgeRepoDid) throw new Error("The Data Council badge is not configured yet.");

  const payload = await indexerQuery<DataCouncilIndexerPayload>(
    DATA_COUNCIL_QUERY,
    { badgeRepo: badgeRepoDid, awardRepo, first: DATA_COUNCIL_INDEXER_LIMIT },
    AbortSignal.timeout(5000),
  );
  if (!payload) throw new Error("Could not load Data Council badge records.");

  const definition = nodes(payload.appCertifiedBadgeDefinition)
    .find((node) => stringValue(node.rkey) === DATA_COUNCIL_BADGE_RKEY);
  const badgeUri = stringValue(definition?.uri);
  const badgeCid = stringValue(definition?.cid);
  if (!definition || !badgeUri || !badgeCid) throw new Error("The Data Council badge could not be found.");

  const seenAwards = new Set<string>();
  const awards = nodes(payload.appCertifiedBadgeAward)
    .flatMap((node) => {
      const award = normalizeAward(node, badgeUri);
      if (!award || seenAwards.has(award.uri)) return [];
      seenAwards.add(award.uri);
      return [award];
    });

  return {
    badge: {
      rkey: DATA_COUNCIL_BADGE_RKEY,
      uri: badgeUri,
      cid: badgeCid,
      title: stringValue(definition.title) ?? "Data Council",
      description: stringValue(definition.description),
      iconUrl: null,
    },
    awards,
  };
}

export async function loadFastDataCouncilState(
  repo: string,
  members: CgsServerMember[],
  canWriteBadges: boolean,
): Promise<DataCouncilState> {
  const { badge, awards: allAwards } = await loadDataCouncilPayload(repo);
  const memberDids = new Set(members.map((member) => member.did));
  const awards = allAwards.filter((award) => award.subjectDid && memberDids.has(award.subjectDid));
  const awardedDids = Array.from(new Set(awards.flatMap((award) => award.subjectDid ? [award.subjectDid] : [])));

  return { repo, members, badge, awards, awardedDids, canWriteBadges };
}

export async function fetchPublicDataCouncilMembers(orgDid: string): Promise<PublicDataCouncilMember[]> {
  const { awards } = await loadDataCouncilPayload(orgDid);
  const dids = Array.from(new Set(awards.flatMap((award) => award.subjectDid ? [award.subjectDid] : [])));
  if (dids.length === 0) return [];
  const profiles = await fetchIndexedCertifiedProfileCards(dids).catch(() => new Map());
  return dids.map((did) => {
    const profile = profiles.get(did);
    return {
      did,
      displayName: profile?.displayName?.trim() || null,
      avatarUrl: profile?.avatarUrl?.trim() || null,
    };
  });
}

export function applyOptimisticDataCouncilSelection(
  state: DataCouncilState,
  memberDid: string,
  selected: boolean,
): DataCouncilState {
  const nextAwarded = new Set(state.awardedDids);
  if (selected) nextAwarded.add(memberDid);
  else nextAwarded.delete(memberDid);

  return {
    ...state,
    awards: selected ? state.awards : state.awards.filter((award) => award.subjectDid !== memberDid),
    awardedDids: Array.from(nextAwarded),
  };
}

export { BADGE_AWARD_COLLECTION };
