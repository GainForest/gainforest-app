import type { ManageTarget } from "@/lib/links";

type ProjectOwnershipInput = Pick<ManageTarget, "kind" | "did" | "currentUserDid"> & {
  recordDid: string;
};

/**
 * Returns true only when the record repository itself proves personal ownership.
 *
 * Organization repositories do not currently expose per-record authorship, so a
 * group record must not be treated as a member's own record from client data.
 * Owner/admin permissions continue to be resolved separately by the shared role
 * policy and every mutation remains server-authorized.
 */
export function isReliablyOwnProjectRecord(input: ProjectOwnershipInput): boolean {
  if (input.kind !== "personal") return false;
  return input.recordDid === input.did;
}
