import type { ManageTarget } from "@/lib/links";
import type { CgsRole } from "./cgs";

export type ManageMutationPermission = {
  allowed: boolean;
  reason: string | null;
};

const UNKNOWN_ROLE_REASON = "Your organization role does not allow this action. Ask an organization owner or admin for access.";

/**
 * Keep role parsing fail-closed. Membership roles come from a remote service and
 * may gain new values; treating an unfamiliar value as `member` would silently
 * grant that value the member create policy.
 */
export function recognizedCgsRole(role: ManageTarget["role"]): CgsRole | null {
  return role === "owner" || role === "admin" || role === "member" ? role : null;
}

type GroupRoleResult =
  | { kind: "personal" }
  | { kind: "recognized"; role: CgsRole }
  | { kind: "unknown" };

function groupRole(target: Pick<ManageTarget, "kind" | "role">): GroupRoleResult {
  if (target.kind !== "group") return { kind: "personal" };
  const role = recognizedCgsRole(target.role);
  return role ? { kind: "recognized", role } : { kind: "unknown" };
}

export function canEditGroupProfile(target: Pick<ManageTarget, "kind" | "role">): ManageMutationPermission {
  const result = groupRole(target);
  if (result.kind === "unknown") return { allowed: false, reason: UNKNOWN_ROLE_REASON };
  if (result.kind === "personal" || result.role === "owner" || result.role === "admin") {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: "Only organization owners and admins can edit this profile.",
  };
}

export function canCreateRecord(target: Pick<ManageTarget, "kind" | "role">): ManageMutationPermission {
  const result = groupRole(target);
  if (result.kind === "unknown") return { allowed: false, reason: UNKNOWN_ROLE_REASON };
  if (result.kind === "personal" || result.role === "owner" || result.role === "admin" || result.role === "member") {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: UNKNOWN_ROLE_REASON };
}

export function canUpdateRecord(target: Pick<ManageTarget, "kind" | "role">, options?: { ownRecord?: boolean }): ManageMutationPermission {
  const result = groupRole(target);
  if (result.kind === "unknown") return { allowed: false, reason: UNKNOWN_ROLE_REASON };
  if (result.kind === "personal" || result.role === "owner" || result.role === "admin" || options?.ownRecord) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: "Members can only edit records they created. Ask an organization admin to change existing records.",
  };
}

export function canDeleteRecord(target: Pick<ManageTarget, "kind" | "role">, options?: { ownRecord?: boolean }): ManageMutationPermission {
  const result = groupRole(target);
  if (result.kind === "unknown") return { allowed: false, reason: UNKNOWN_ROLE_REASON };
  if (result.kind === "personal" || result.role === "owner" || result.role === "admin" || options?.ownRecord) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: "Members can only delete records they created. Ask an organization admin to remove existing records.",
  };
}
