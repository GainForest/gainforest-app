"use client";

export type CgsRole = "owner" | "admin" | "member";

export type CgsGroupMembership = {
  groupDid: string;
  role: CgsRole;
  joinedAt?: string | null;
  displayName?: string | null;
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

export type CgsMembersResponse = {
  members: CgsMember[];
  cursor?: string;
};

export type RegisterCgsGroupResponse = {
  groupDid: string;
  handle?: string | null;
  accountPassword?: string | null;
};

type CgsMutationPayload =
  | {
      operation: "registerGroup";
      handle: string;
      ownerDid: string;
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
    throw new Error(data.message ?? data.error ?? fallback);
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
  return parseJsonResponse<T>(res, "Group request failed.");
}

export async function registerCgsGroup(input: {
  handle: string;
  ownerDid: string;
  displayName?: string;
  description?: string;
  website?: string;
}): Promise<RegisterCgsGroupResponse> {
  return callCgs<RegisterCgsGroupResponse>({ operation: "registerGroup", ...input });
}

export async function listCgsMembers(repo: string): Promise<CgsMembersResponse> {
  return callCgs<CgsMembersResponse>({ operation: "listMembers", repo, limit: 100 });
}

export async function addCgsMember(repo: string, memberDid: string, role: "member" | "admin") {
  return callCgs({ operation: "addMember", repo, memberDid, role });
}

export async function removeCgsMember(repo: string, memberDid: string) {
  return callCgs({ operation: "removeMember", repo, memberDid });
}

export async function setCgsMemberRole(repo: string, memberDid: string, role: "member" | "admin") {
  return callCgs({ operation: "setRole", repo, memberDid, role });
}
