import { cache } from "react";
import { headers } from "next/headers";
import { fetchAuthSession } from "./auth-server";
import { getAuthBaseUrl, getAuthForwardCookie } from "./auth";
import { getAccountRouteData, resolveIdentifierToDid, type AccountRouteData } from "@/app/account/_lib/account-route";
import {
  groupManageTarget,
  personalManageTarget,
  type ManageTarget,
} from "@/lib/links";

type CgsGroupMembership = {
  groupDid: string;
  role: "owner" | "admin" | "member" | string;
  displayName?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
};

type CgsGroupsResponse = {
  groups?: CgsGroupMembership[];
};

type GroupManageAccessResult =
  | { status: "allowed"; target: ManageTarget }
  | {
      status: "not-member";
      group: {
        did: string;
        identifier: string;
        displayName: string;
        avatarUrl: string | null;
        handle: string | null;
      };
    }
  | { status: "not-found" }
  | { status: "signed-out" };

function normalizeDid(value: string): string {
  let current = value.trim();
  for (let i = 0; i < 3; i++) {
    if (current.startsWith("did:")) return current;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function sameIdentifier(group: CgsGroupMembership, identifier: string, did: string): boolean {
  const normalized = normalizeDid(identifier);
  if (normalized.startsWith("did:")) return group.groupDid === normalized || did === normalized;
  return Boolean(group.handle && group.handle.toLowerCase() === normalized.toLowerCase());
}

export const fetchUserCgsGroups = cache(async (): Promise<CgsGroupMembership[]> => {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  if (!cookie) return [];

  const upstream = await fetch(new URL("/api/cgs/groups", getAuthBaseUrl()), {
    headers: { cookie },
    cache: "no-store",
  });
  if (!upstream.ok) return [];

  const payload = (await upstream.json().catch(() => null)) as CgsGroupsResponse | null;
  return Array.isArray(payload?.groups) ? payload.groups : [];
});

export async function resolvePersonalManageTarget(): Promise<ManageTarget | null> {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;
  const account = await getAccountRouteData(session.did, session.did);
  return personalManageTarget({
    did: account.did,
    accountKind: account.kind,
    identifier: account.urlIdentifier,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
  });
}

async function resolveGroupManageAccess(identifier: string): Promise<GroupManageAccessResult> {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return { status: "signed-out" };

  const normalizedIdentifier = normalizeDid(identifier);
  const did = normalizedIdentifier.startsWith("did:")
    ? normalizedIdentifier
    : await resolveIdentifierToDid(normalizedIdentifier).catch(() => null);
  if (!did?.startsWith("did:")) return { status: "not-found" };

  const [groups, account] = await Promise.all([
    fetchUserCgsGroups(),
    getAccountRouteData(did, identifier).catch(() => null),
  ]);
  if (!account) return { status: "not-found" };

  const membership = groups.find((group) => group.groupDid === did || sameIdentifier(group, identifier, did));
  const routeIdentifier = normalizedIdentifier || identifier || account.handle || did;

  if (!membership) {
    return {
      status: "not-member",
      group: {
        did,
        identifier: routeIdentifier,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        handle: account.handle,
      },
    };
  }

  return {
    status: "allowed",
    target: groupManageTarget({
      did,
      accountKind: account.kind,
      // Keep the dashboard anchored to the route segment that was requested.
      // ManageDashboardClient uses target.basePath to decide whether it should
      // render the hero; switching to a canonical handle here can make valid
      // aliases like /manage/groups/group render only the child overview.
      identifier: routeIdentifier || membership.handle?.trim() || did,
      role: membership.role,
      displayName: account.displayName || membership.displayName || null,
      avatarUrl: account.avatarUrl || membership.avatarUrl || null,
      currentUserDid: session.did,
    }),
  };
}

export async function resolveGroupManageTarget(identifier: string): Promise<ManageTarget | null> {
  const access = await resolveGroupManageAccess(identifier);
  return access.status === "allowed" ? access.target : null;
}

export type AccountManageAccessResult =
  | { status: "allowed"; target: ManageTarget; account: AccountRouteData }
  | {
      status: "not-member";
      group: {
        did: string;
        identifier: string;
        displayName: string;
        avatarUrl: string | null;
        handle: string | null;
      };
    }
  // Trying to manage another user's personal account.
  | { status: "forbidden"; identifier: string }
  | { status: "not-found" }
  | { status: "signed-out" };

/**
 * Resolves manage access for a unified /account/<identifier>/manage route.
 * The account may be the signed-in user's own personal account (personal
 * target) or an organization they belong to (group target). Anyone else's
 * personal account is forbidden; an organization the user isn't a member of is
 * surfaced as `not-member` so the UI can explain.
 */
export const resolveAccountManageAccess = cache(async (identifier: string): Promise<AccountManageAccessResult> => {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return { status: "signed-out" };

  const normalizedIdentifier = normalizeDid(identifier);
  const did = normalizedIdentifier.startsWith("did:")
    ? normalizedIdentifier
    : await resolveIdentifierToDid(normalizedIdentifier).catch(() => null);
  if (!did?.startsWith("did:")) return { status: "not-found" };

  const account = await getAccountRouteData(did, identifier).catch(() => null);
  if (!account) return { status: "not-found" };

  // Anchor the dashboard basePath to the requested route segment so manage-home
  // detection (canonicalPathname === basePath) keeps working for did/handle
  // aliases, mirroring resolveGroupManageAccess.
  const routeIdentifier = normalizedIdentifier || identifier || account.handle || did;

  // The user's own personal account.
  if (did === session.did) {
    return {
      status: "allowed",
      account,
      target: personalManageTarget({
        did: account.did,
        accountKind: account.kind,
        identifier: routeIdentifier,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
      }),
    };
  }

  // An organization the user belongs to.
  const groups = await fetchUserCgsGroups();
  const membership = groups.find((group) => group.groupDid === did || sameIdentifier(group, identifier, did));
  if (membership) {
    return {
      status: "allowed",
      account,
      target: groupManageTarget({
        did,
        accountKind: account.kind,
        identifier: routeIdentifier || membership.handle?.trim() || did,
        role: membership.role,
        displayName: account.displayName || membership.displayName || null,
        avatarUrl: account.avatarUrl || membership.avatarUrl || null,
        currentUserDid: session.did,
      }),
    };
  }

  if (account.kind === "organization") {
    return {
      status: "not-member",
      group: {
        did,
        identifier: routeIdentifier,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        handle: account.handle,
      },
    };
  }

  return { status: "forbidden", identifier: account.urlIdentifier };
});
