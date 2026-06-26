import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchCgsMembersWithCookie, type CgsServerMember, type CgsServerRole } from "@/app/_lib/cgs-server";
import { fetchIndexedCertifiedProfileCards, type IndexedCertifiedProfileCard } from "@/app/_lib/indexer";
import { loadFastDataCouncilState, type DataCouncilState } from "@/app/_lib/data-council";
import { listPendingGroupInvitationsForRepo, type GroupInvitation } from "@/app/_lib/cgs-invitations";

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
  invitations: GroupInvitation[];
  dataCouncil: DataCouncilState | null;
  dataCouncilError: string | null;
};

const BADGE_MANAGER_ROLES = new Set<CgsServerRole>(["owner", "admin"]);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function profilesFromIndex(members: CgsServerMember[], cards: Map<string, IndexedCertifiedProfileCard>): AccountCardProfile[] {
  return members.flatMap((member) => {
    const indexed = cards.get(member.did);
    const displayName = indexed?.displayName?.trim() || null;
    const avatar = indexed?.avatarUrl?.trim() || null;
    if (!displayName && !avatar) return [];
    return [{ did: member.did, handle: null, displayName, avatar }];
  });
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

    const profilesPromise = fetchIndexedCertifiedProfileCards(memberDids).catch(() => new Map<string, IndexedCertifiedProfileCard>());
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

    const [profilesByDid, invitations, dataCouncilResult] = await Promise.all([profilesPromise, invitationsPromise, dataCouncilPromise]);
    const body: GroupSettingsResponse = {
      members,
      profiles: profilesFromIndex(members, profilesByDid),
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
