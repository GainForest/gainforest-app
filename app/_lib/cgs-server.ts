import { headers } from "next/headers";
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

function errorMessage(payload: RawMembersResponse | null, fallback: string): string {
  return typeof payload?.message === "string"
    ? payload.message
    : typeof payload?.error === "string"
      ? payload.error
      : fallback;
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

  return {
    members: normalizeMembers(payload?.members),
    cursor: typeof payload?.cursor === "string" ? payload.cursor : undefined,
  };
}

export async function fetchCgsMembersForRequest(repo: string): Promise<CgsMembersResponse> {
  const headerList = await headers();
  return fetchCgsMembersWithCookie({ repo, cookie: headerList.get("cookie") });
}
