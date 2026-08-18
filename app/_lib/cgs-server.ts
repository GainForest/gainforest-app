import { headers } from "next/headers";
import { formatCgsErrorMessage } from "./cgs-errors";
import { getAuthBaseUrl, getAuthForwardCookie } from "./auth";

export type CgsServerRole = "owner" | "admin" | "member";

export type CgsServerMember = {
  did: string;
  role: CgsServerRole;
  addedBy?: string | null;
  addedAt?: string | null;
};

export type CgsMembersResponse = {
  members: CgsServerMember[];
  cursor?: string;
};

export type CgsServerGroupMembership = {
  groupDid: string;
  role: CgsServerRole;
};

export class CgsRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CgsRequestError";
    this.status = status;
  }
}

type RawMember = {
  did?: unknown;
  memberDid?: unknown;
  role?: unknown;
  addedBy?: unknown;
  addedAt?: unknown;
};

type RawMembersResponse = {
  members?: unknown;
  cursor?: unknown;
  error?: unknown;
  message?: unknown;
};

type RawGroupsResponse = {
  groups?: unknown;
  cursor?: unknown;
  error?: unknown;
  message?: unknown;
};

function isCgsRole(value: unknown): value is CgsServerRole {
  return value === "owner" || value === "admin" || value === "member";
}

function normalizeRole(value: unknown): CgsServerRole {
  return value === "owner" || value === "admin" ? value : "member";
}

function normalizeMembers(value: unknown): CgsServerMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const member = entry as RawMember;
    const did = typeof member.did === "string" ? member.did : typeof member.memberDid === "string" ? member.memberDid : null;
    if (!did) return [];
    return [{
      did,
      role: normalizeRole(member.role),
      addedBy: typeof member.addedBy === "string" ? member.addedBy : null,
      addedAt: typeof member.addedAt === "string" ? member.addedAt : null,
    }];
  });
}

function normalizeGroupMemberships(value: unknown): CgsServerGroupMembership[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const group = entry as { groupDid?: unknown; role?: unknown };
    if (typeof group.groupDid !== "string" || !group.groupDid.startsWith("did:") || !isCgsRole(group.role)) return [];
    return [{ groupDid: group.groupDid, role: group.role }];
  });
}

function errorMessage(payload: RawMembersResponse | RawGroupsResponse | null, fallback: string): string {
  const raw = typeof payload?.message === "string"
    ? payload.message
    : typeof payload?.error === "string"
      ? payload.error
      : fallback;
  return formatCgsErrorMessage(raw, fallback);
}

async function resolveCgsRepoIdentifier(repo: string): Promise<string> {
  const trimmed = repo.trim();
  if (trimmed.startsWith("did:")) return trimmed;

  const params = new URLSearchParams({ handle: trimmed });
  const response = await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?${params.toString()}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return trimmed;

  const payload = (await response.json().catch(() => null)) as { did?: unknown } | null;
  return typeof payload?.did === "string" && payload.did.startsWith("did:") ? payload.did : trimmed;
}

export async function fetchAllCgsGroupMembershipsWithCookie(cookie: string | null): Promise<CgsServerGroupMembership[]> {
  const authCookie = getAuthForwardCookie(cookie);
  if (!authCookie) throw new CgsRequestError("Please sign in and try again.", 401);

  const groups: CgsServerGroupMembership[] = [];
  const seenGroupDids = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const upstreamUrl = new URL("/api/cgs/groups", getAuthBaseUrl());
    upstreamUrl.searchParams.set("limit", "100");
    if (cursor) upstreamUrl.searchParams.set("cursor", cursor);

    const upstream = await fetch(upstreamUrl, {
      headers: { cookie: authCookie },
      cache: "no-store",
    });
    const payload = (await upstream.json().catch(() => null)) as RawGroupsResponse | null;
    if (!upstream.ok || payload?.error) {
      throw new CgsRequestError(errorMessage(payload, "Could not load organizations."), upstream.status || 502);
    }
    if (!Array.isArray(payload?.groups)) {
      throw new CgsRequestError("The group service returned invalid organization membership data. Try again later.", 502);
    }
    if (payload !== null && Object.prototype.hasOwnProperty.call(payload, "cursor") && typeof payload.cursor !== "string") {
      throw new CgsRequestError(
        "The group service returned an invalid organization pagination cursor. Nothing was stored; try again later.",
        502,
      );
    }

    const pageGroups = normalizeGroupMemberships(payload.groups);
    if (pageGroups.length !== payload.groups.length) {
      throw new CgsRequestError("The group service returned invalid organization membership data. Try again later.", 502);
    }
    for (const group of pageGroups) {
      if (seenGroupDids.has(group.groupDid)) {
        throw new CgsRequestError("The group service repeated an organization across pages. Nothing was stored; try again later.", 502);
      }
      seenGroupDids.add(group.groupDid);
      groups.push(group);
    }

    const next = typeof payload.cursor === "string" && payload.cursor ? payload.cursor : null;
    if (next && seenCursors.has(next)) {
      throw new CgsRequestError(
        "Could not completely load organizations because the group service repeated a pagination cursor. Try again later.",
        502,
      );
    }
    if (next) seenCursors.add(next);
    cursor = next;
  } while (cursor);

  return groups;
}

export async function fetchCgsMembersWithCookie({
  repo,
  cookie,
  cursor,
  limit = 100,
}: {
  repo: string;
  cookie: string | null;
  cursor?: string | null;
  limit?: number;
}): Promise<CgsMembersResponse> {
  if (!repo.trim()) throw new CgsRequestError("Missing organization identifier.", 400);
  const authCookie = getAuthForwardCookie(cookie);
  if (!authCookie) throw new CgsRequestError("Please sign in and try again.", 401);

  const resolvedRepo = await resolveCgsRepoIdentifier(repo);

  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: authCookie,
    },
    body: JSON.stringify({
      operation: "listMembers",
      repo: resolvedRepo,
      limit: Math.min(Math.max(Math.trunc(limit) || 100, 1), 100),
      ...(cursor ? { cursor } : {}),
    }),
    cache: "no-store",
  });

  const payload = (await upstream.json().catch(() => null)) as RawMembersResponse | null;
  if (!upstream.ok || payload?.error) {
    throw new CgsRequestError(errorMessage(payload, "Could not load members."), upstream.status || 502);
  }
  if (!Array.isArray(payload?.members) || payload.members.some((entry) => {
    if (typeof entry !== "object" || entry === null) return true;
    const member = entry as RawMember;
    const did = typeof member.did === "string" ? member.did : member.memberDid;
    return typeof did !== "string" || !did.startsWith("did:") || !isCgsRole(member.role);
  })) {
    throw new CgsRequestError(
      "The group service returned invalid organization member data. Nothing was stored; try again later.",
      502,
    );
  }
  if (payload !== null && Object.prototype.hasOwnProperty.call(payload, "cursor") && typeof payload.cursor !== "string") {
    throw new CgsRequestError(
      "The group service returned an invalid organization member pagination cursor. Nothing was stored; try again later.",
      502,
    );
  }

  return {
    members: normalizeMembers(payload.members),
    cursor: typeof payload.cursor === "string" ? payload.cursor : undefined,
  };
}

/** Resolve one member's current role across every group-service page. */
export async function fetchAllCgsMembersWithCookie({
  repo,
  cookie,
}: {
  repo: string;
  cookie: string | null;
}): Promise<CgsServerMember[]> {
  const members: CgsServerMember[] = [];
  const seenMemberDids = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const page = await fetchCgsMembersWithCookie({ repo, cookie, cursor, limit: 100 });
    for (const member of page.members) {
      if (seenMemberDids.has(member.did)) {
        throw new CgsRequestError(
          "The group service repeated an organization member across pages. Nothing was stored; try again later.",
          502,
        );
      }
      seenMemberDids.add(member.did);
      members.push(member);
    }

    const next = page.cursor ?? null;
    if (next && seenCursors.has(next)) {
      throw new CgsRequestError(
        "Could not completely load organization members because the group service repeated a pagination cursor. Try again later.",
        502,
      );
    }
    if (next) seenCursors.add(next);
    cursor = next;
  } while (cursor);

  if (members.length === 0) {
    throw new CgsRequestError(
      "The group service returned an empty organization roster. Nothing was stored; try again later.",
      502,
    );
  }
  return members;
}

export async function fetchCgsMemberRoleWithCookie({
  repo,
  cookie,
  did,
}: {
  repo: string;
  cookie: string | null;
  did: string;
}): Promise<CgsServerRole | null> {
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  do {
    const page = await fetchCgsMembersWithCookie({ repo, cookie, cursor, limit: 100 });
    const role = page.members.find(member => member.did === did)?.role;
    if (role) return role;

    const next = page.cursor ?? null;
    if (!next || seenCursors.has(next)) return null;
    seenCursors.add(next);
    cursor = next;
  } while (cursor);
  return null;
}

export async function fetchCgsMembersForRequest(repo: string): Promise<CgsMembersResponse> {
  const headerList = await headers();
  return fetchCgsMembersWithCookie({ repo, cookie: headerList.get("cookie") });
}
