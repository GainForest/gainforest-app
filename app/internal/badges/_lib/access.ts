import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchCgsMembersForRequest, type CgsServerRole } from "@/app/_lib/cgs-server";
import { resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import { fetchUserCgsGroups } from "@/app/_lib/manage-server";
import { GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/indexer";
import type { AuthSession } from "@/app/_lib/auth";

export type InternalBadgeAccess = {
  isLoggedIn: boolean;
  allowed: boolean;
  configured: boolean;
  session: AuthSession;
  repoDid: string | null;
  writeRepo: string | null;
  role: CgsServerRole | null;
};

const GAINFOREST_CGS_ACCOUNT_ENV = "NEXT_PUBLIC_GAINFOREST_CGS_ACCOUNT";
const PRIVILEGED_ROLES = new Set<CgsServerRole>(["owner", "admin"]);

function gainForestCgsAccountIdentifier(): string | null {
  const value = process.env[GAINFOREST_CGS_ACCOUNT_ENV]?.trim().replace(/^@+/, "") ?? "";
  return value || null;
}

export async function resolveInternalBadgeRepoDid(): Promise<string | null> {
  const configured = gainForestCgsAccountIdentifier();
  if (!configured) return null;
  if (configured.startsWith("did:")) return configured;
  return resolveIdentifierToDid(configured).catch(() => null);
}

async function getSessionRoleForGainForestOrg(session: AuthSession, repo: string): Promise<CgsServerRole | null> {
  if (!session.isLoggedIn) return null;
  const result = await fetchCgsMembersForRequest(repo).catch(() => null);
  const member = result?.members.find((entry) => entry.did === session.did);
  return member?.role ?? null;
}

function normalizeCgsRole(value: string | null | undefined): CgsServerRole {
  return value === "owner" || value === "admin" ? value : "member";
}

/**
 * The signed-in user's role in a group, read from their own membership list.
 * The group service lets a member read the groups they belong to (via
 * /api/cgs/groups), whereas listMembers is restricted to owners/admins — so
 * this is the reliable way to detect a plain member.
 */
async function getSelfRoleInGroup(session: AuthSession, repoDid: string): Promise<CgsServerRole | null> {
  if (!session.isLoggedIn) return null;
  const groups = await fetchUserCgsGroups().catch(() => []);
  const membership = groups.find((group) => group.groupDid === repoDid);
  return membership ? normalizeCgsRole(membership.role) : null;
}

export type GainForestModeratorAccess = {
  isLoggedIn: boolean;
  /** True when the signed-in user belongs to the GainForest group (any role). */
  isModerator: boolean;
  configured: boolean;
  session: AuthSession;
  /** DID of the GainForest group repo the moderation badges are written to. */
  repoDid: string | null;
  role: CgsServerRole | null;
};

/**
 * Access for GainForest stewardship actions that any admin-group member may
 * perform — notably flagging an account as a test account. Unlike the badge
 * dashboard (owner/admin only), this allows every member of the admin account.
 *
 * The repo is pinned to the admin group account (admins-gxlw.certified.one) —
 * the same repo the public hiding read scans — so a flag written here is always
 * read back when filtering the explore surfaces.
 */
export async function getGainForestModeratorAccess(): Promise<GainForestModeratorAccess> {
  const session = await fetchAuthSession();
  const repoDid = GAINFOREST_MODERATION_REPO_DID;
  const role = await getSelfRoleInGroup(session, repoDid);

  return {
    isLoggedIn: session.isLoggedIn,
    isModerator: Boolean(role),
    configured: true,
    session,
    repoDid,
    role,
  };
}

export async function getInternalBadgeAccess(): Promise<InternalBadgeAccess> {
  const session = await fetchAuthSession();
  const configuredRepo = gainForestCgsAccountIdentifier();
  const configured = Boolean(configuredRepo);

  const repoDid = configuredRepo ? await resolveInternalBadgeRepoDid() : null;
  const role = repoDid ? await getSessionRoleForGainForestOrg(session, repoDid) : null;
  const allowed = Boolean(repoDid && role && PRIVILEGED_ROLES.has(role));

  return {
    isLoggedIn: session.isLoggedIn,
    allowed,
    configured,
    session,
    repoDid,
    writeRepo: allowed ? repoDid : null,
    role,
  };
}
