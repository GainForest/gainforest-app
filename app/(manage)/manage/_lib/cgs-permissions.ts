import type { ManageTarget } from "@/lib/links";
import type { CgsRole } from "./cgs";

export type ManageMutationPermission = {
  allowed: boolean;
  reason: string | null;
};

export function normalizeCgsRole(role: ManageTarget["role"]): CgsRole {
  return role === "owner" || role === "admin" ? role : "member";
}

export function groupRole(target: Pick<ManageTarget, "kind" | "role">): CgsRole | null {
  return target.kind === "group" ? normalizeCgsRole(target.role) : null;
}

export function canEditGroupProfile(target: Pick<ManageTarget, "kind" | "role">): ManageMutationPermission {
  const role = groupRole(target);
  if (!role || role === "owner" || role === "admin") return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: "Only organization owners and admins can edit this profile.",
  };
}

export function canCreateRecord(target: Pick<ManageTarget, "kind" | "role">): ManageMutationPermission {
  const role = groupRole(target);
  if (!role || role === "owner" || role === "admin" || role === "member") return { allowed: true, reason: null };
  return { allowed: false, reason: "You cannot create records in this organization." };
}

export function canUpdateRecord(target: Pick<ManageTarget, "kind" | "role">, options?: { ownRecord?: boolean }): ManageMutationPermission {
  const role = groupRole(target);
  if (!role || role === "owner" || role === "admin" || options?.ownRecord) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: "Members can only edit records they created. Ask an organization admin to change existing records.",
  };
}

export function canDeleteRecord(target: Pick<ManageTarget, "kind" | "role">, options?: { ownRecord?: boolean }): ManageMutationPermission {
  const role = groupRole(target);
  if (!role || role === "owner" || role === "admin" || options?.ownRecord) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: "Members can only delete records they created. Ask an organization admin to remove existing records.",
  };
}

export function canManageMembers(role: CgsRole): ManageMutationPermission {
  if (role === "owner" || role === "admin") return { allowed: true, reason: null };
  return { allowed: false, reason: "Only organization owners and admins can add or remove members." };
}

export function canSetMemberRoles(role: CgsRole): ManageMutationPermission {
  if (role === "owner") return { allowed: true, reason: null };
  return { allowed: false, reason: "Only organization owners can change member roles." };
}
