"use client";

import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";

export type CgsRole = "owner" | "admin" | "member";

export type CgsGroupMembership = {
  groupDid: string;
  role: CgsRole;
  joinedAt?: string | null;
  displayName?: string | null;
  description?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
};

export type CgsGroupsResponse = {
  groups: CgsGroupMembership[];
  cursor?: string;
};

export type CgsMember = {
  did: string;
  role: CgsRole;
  addedBy?: string | null;
  addedAt?: string | null;
};

export type CgsMemberIdentity = {
  did: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
};

export type CgsMembersResponse = {
  members: CgsMember[];
  cursor?: string;
};

export type CgsPendingInvitation = {
  id: string;
  email: string;
  role: "member" | "admin";
  status: "pending" | "accepted" | "canceled" | "expired";
  createdAt?: string | null;
};

type RawCgsMember = {
  did?: unknown;
  memberDid?: unknown;
  role?: unknown;
  addedBy?: unknown;
  addedAt?: unknown;
};

export type RegisterCgsGroupResponse = {
  groupDid: string;
  handle?: string | null;
  accountPassword?: string | null;
};

const CGS_HANDLE_MIN_LEN = 3;
const CGS_HANDLE_NAME_MAX_LEN = 18;
const MAX_HANDLE_RETRIES = 6;

function sanitizeCgsHandleName(name: string, maxLen: number): string {
  const label = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return label;
}

export function buildCgsGroupHandleCandidate(name: string, attempt = 0): string {
  if (attempt === 0) {
    const clean = sanitizeCgsHandleName(name, CGS_HANDLE_NAME_MAX_LEN);
    if (clean.length >= CGS_HANDLE_MIN_LEN) return clean;
  }

  const suffix = Math.random().toString(36).slice(2, 6);
  const maxNameLen = Math.max(1, 13 - Math.max(0, attempt - 1) * 2);
  const base = sanitizeCgsHandleName(name, maxNameLen) || "org";
  return `${base}-${suffix}`;
}

function isRetryableHandleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("handle too long") ||
    message.includes("handle too short") ||
    message.includes("handle already taken") ||
    message.includes("handle not available") ||
    message.includes("invalid handle")
  );
}

type CgsMutationPayload =
  | {
      operation: "registerGroup";
      handle: string;
      ownerDid: string;
      email?: string;
      displayName?: string;
      description?: string;
      website?: string;
    }
  | { operation: "listMembers"; repo: string; cursor?: string; limit?: number }
  | { operation: "addMember"; repo: string; memberDid: string; role: "member" | "admin" }
  | { operation: "removeMember"; repo: string; memberDid: string }
  | { operation: "setRole"; repo: string; memberDid: string; role: "member" | "admin" }
  | { operation: "createRecord"; repo: string; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; repo: string; collection: string; rkey: string; record: Record<string, unknown>; swapRecord?: string }
  | { operation: "deleteRecord"; repo: string; collection: string; rkey: string }
  | { operation: "uploadBlob"; repo: string; blobData: string; blobMimeType: string };

async function parseJsonResponse<T>(res: Response, fallback: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok || data.error) {
    throw new Error(formatCgsErrorMessage(data.message ?? data.error, fallback));
  }
  return data;
}

export async function fetchCgsGroups(): Promise<CgsGroupsResponse> {
  const res = await fetch("/api/cgs/groups", { cache: "no-store" });
  return parseJsonResponse<CgsGroupsResponse>(res, "Could not load organizations.");
}

export async function callCgs<T>(payload: CgsMutationPayload): Promise<T> {
  const res = await fetch("/api/cgs/mutation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<T>(res, "Organization request failed.");
}

export async function registerCgsGroup(input: {
  handle?: string;
  ownerDid: string;
  email?: string;
  displayName?: string;
  description?: string;
  website?: string;
}): Promise<RegisterCgsGroupResponse> {
  const { handle: explicitHandle, ...rest } = input;
  const seed = explicitHandle?.trim() || input.displayName?.trim() || "organization";
  const attempted = new Set<string>();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_HANDLE_RETRIES; attempt++) {
    const handle = buildCgsGroupHandleCandidate(seed, attempt);
    if (attempted.has(handle)) continue;
    attempted.add(handle);

    try {
      return await callCgs<RegisterCgsGroupResponse>({
        operation: "registerGroup",
        ...rest,
        handle,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableHandleError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not register organization handle.");
}

function normalizeCgsMembers(value: unknown): CgsMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const member = entry as RawCgsMember;
    const did = typeof member.did === "string" ? member.did : typeof member.memberDid === "string" ? member.memberDid : null;
    if (!did) return [];
    return [{
      did,
      role: member.role === "owner" || member.role === "admin" ? member.role : "member",
      addedBy: typeof member.addedBy === "string" ? member.addedBy : null,
      addedAt: typeof member.addedAt === "string" ? member.addedAt : null,
    }];
  });
}

export async function listCgsMembers(repo: string): Promise<CgsMembersResponse> {
  const params = new URLSearchParams({ repo, limit: "100" });
  const res = await fetch(`/api/cgs/members?${params.toString()}`, { cache: "no-store" });
  const data = await parseJsonResponse<CgsMembersResponse>(res, "Could not load members.");
  return { ...data, members: normalizeCgsMembers(data.members) };
}

export async function resolveCgsMemberIdentity(identifier: string): Promise<CgsMemberIdentity> {
  const params = new URLSearchParams({ identifier });
  const res = await fetch(`/api/cgs/member-identity?${params.toString()}`, { cache: "no-store" });
  return parseJsonResponse<CgsMemberIdentity>(res, "Could not find that member.");
}

export async function addCgsMember(repo: string, memberDid: string, role: "member" | "admin") {
  return callCgs({ operation: "addMember", repo, memberDid, role });
}

export async function inviteCgsMember(repo: string, email: string, role: "member" | "admin") {
  const res = await fetch("/api/cgs/invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, email, role }),
  });
  return parseJsonResponse<{ invitation: CgsPendingInvitation }>(res, "Could not send invitation.");
}

export async function removeCgsMember(repo: string, memberDid: string) {
  return callCgs({ operation: "removeMember", repo, memberDid });
}

export async function setCgsMemberRole(repo: string, memberDid: string, role: "member" | "admin") {
  return callCgs({ operation: "setRole", repo, memberDid, role });
}
