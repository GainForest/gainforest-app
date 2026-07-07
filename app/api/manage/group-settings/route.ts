import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchCgsMembersWithCookie, type CgsServerMember, type CgsServerRole } from "@/app/_lib/cgs-server";
import { fetchIndexedCertifiedProfileCards, type IndexedCertifiedProfileCard } from "@/app/_lib/indexer";
import { fetchBlueskyProfileCard } from "@/app/_lib/bluesky-profile";
import { loadFastDataCouncilState, type DataCouncilState } from "@/app/_lib/data-council";
import {
  listAcceptedGroupInvitationEmailsForRepo,
  listPendingGroupInvitationsForRepo,
  type GroupInvitation,
} from "@/app/_lib/cgs-invitations";
import { isEpdsIdentity, resolveDidIdentity, type DidIdentity } from "@/app/_lib/did-identity";

export const runtime = "nodejs";

type AccountCardProfile = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
};

type GroupSettingsResponse = {
  members: CgsServerMember[];
  profiles: AccountCardProfile[];
  /**
   * Member DID → email for ePDS accounts. Only present when the requesting
   * user is a member of the organization — emails are never public info.
   */
  memberEmails: Record<string, string>;
  invitations: GroupInvitation[];
  dataCouncil: DataCouncilState | null;
  dataCouncilError: string | null;
};

const BADGE_MANAGER_ROLES = new Set<CgsServerRole>(["owner", "admin"]);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

async function resolveMemberIdentities(members: CgsServerMember[]): Promise<Map<string, DidIdentity>> {
  const entries = await Promise.all(
    members.map(async (member) =>
      [member.did, await resolveDidIdentity(member.did).catch((): DidIdentity => ({ handle: null, pdsHost: null }))] as const,
    ),
  );
  return new Map(entries);
}

async function buildMemberProfiles(
  members: CgsServerMember[],
  cards: Map<string, IndexedCertifiedProfileCard>,
  identities: Map<string, DidIdentity>,
): Promise<AccountCardProfile[]> {
  // Members without an indexed Certified profile may be external Bluesky
  // accounts; look those up on the Bluesky appview so they render with a name
  // and avatar instead of an anonymous placeholder.
  const missing = members.filter((member) => {
    const indexed = cards.get(member.did);
    return !indexed?.displayName?.trim() && !indexed?.avatarUrl?.trim();
  });
  const blueskyEntries = await Promise.all(
    missing.map(async (member) => [member.did, await fetchBlueskyProfileCard(member.did).catch(() => null)] as const),
  );
  const blueskyByDid = new Map(blueskyEntries);

  return members.flatMap((member) => {
    const indexed = cards.get(member.did);
    const bluesky = blueskyByDid.get(member.did) ?? null;
    const displayName = indexed?.displayName?.trim() || bluesky?.displayName?.trim() || null;
    const avatar = indexed?.avatarUrl?.trim() || bluesky?.avatarUrl?.trim() || null;
    const handle = identities.get(member.did)?.handle?.trim() || bluesky?.handle?.trim() || null;
    if (!displayName && !avatar && !handle) return [];
    return [{ did: member.did, handle, displayName, avatar }];
  });
}

/**
 * Email per ePDS member, sourced from accepted email invitations (plus the
 * viewer's own session email). Only built for verified members — the caller
 * must pass `isMember` computed from the CGS member list.
 */
function buildMemberEmails({
  members,
  identities,
  acceptedEmails,
  userDid,
  userEmail,
}: {
  members: CgsServerMember[];
  identities: Map<string, DidIdentity>;
  acceptedEmails: Map<string, string>;
  userDid: string | null;
  userEmail: string | null;
}): Record<string, string> {
  const memberEmails: Record<string, string> = {};
  for (const member of members) {
    const identity = identities.get(member.did);
    if (!identity || !isEpdsIdentity(identity)) continue;
    const email = (member.did === userDid ? userEmail : null) ?? acceptedEmails.get(member.did) ?? null;
    if (email) memberEmails[member.did] = email;
  }
  return memberEmails;
}

function canWriteDataCouncil(members: CgsServerMember[], userDid: string | null): boolean {
  const role = userDid ? members.find((member) => member.did === userDid)?.role ?? null : null;
  return Boolean(role && BADGE_MANAGER_ROLES.has(role));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo")?.trim() ?? "";
  const includeDataCouncil = url.searchParams.get("dataCouncil") === "1";
  if (!repo) return jsonError("Choose an organization first.", 400);

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  if (!cookie) return jsonError("Sign in to continue.", 401);

  const sessionPromise = fetchAuthSession();
  const membersPromise = fetchCgsMembersWithCookie({ repo, cookie, limit: 100 });

  try {
    const [session, memberResult] = await Promise.all([sessionPromise, membersPromise]);
    const members = memberResult.members;
    const userDid = session.isLoggedIn ? session.did : null;
    const memberDids = members.map((member) => member.did);

    const isMember = Boolean(userDid && members.some((member) => member.did === userDid));

    const profilesPromise = fetchIndexedCertifiedProfileCards(memberDids).catch(() => new Map<string, IndexedCertifiedProfileCard>());
    const identitiesPromise = resolveMemberIdentities(members);
    // Emails are private: only look them up when the requester is a verified
    // member of this organization.
    const acceptedEmailsPromise = isMember
      ? listAcceptedGroupInvitationEmailsForRepo(repo).catch(() => new Map<string, string>())
      : Promise.resolve(new Map<string, string>());
    const canWrite = canWriteDataCouncil(members, userDid);
    const invitationsPromise = canWrite
      ? listPendingGroupInvitationsForRepo(repo).catch(() => [])
      : Promise.resolve([] as GroupInvitation[]);
    const dataCouncilPromise = includeDataCouncil
      ? loadFastDataCouncilState(repo, members, canWrite).then(
          (state): { state: DataCouncilState | null; error: string | null } => ({
            state,
            error: null,
          }),
          (error): { state: DataCouncilState | null; error: string | null } => ({
            state: null,
            error: error instanceof Error ? error.message : "Could not load Data Council members.",
          }),
        )
      : Promise.resolve({ state: null, error: null });

    const [profilesByDid, identities, acceptedEmails, invitations, dataCouncilResult] = await Promise.all([
      profilesPromise,
      identitiesPromise,
      acceptedEmailsPromise,
      invitationsPromise,
      dataCouncilPromise,
    ]);
    const body: GroupSettingsResponse = {
      members,
      profiles: await buildMemberProfiles(members, profilesByDid, identities),
      memberEmails: isMember
        ? buildMemberEmails({
            members,
            identities,
            acceptedEmails,
            userDid,
            userEmail: session.isLoggedIn ? session.email?.trim() || null : null,
          })
        : {},
      invitations,
      dataCouncil: dataCouncilResult.state,
      dataCouncilError: dataCouncilResult.error,
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load members.";
    return jsonError(message, 502);
  }
}
