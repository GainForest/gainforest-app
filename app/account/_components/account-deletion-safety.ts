export type OwnedGroup = {
  did: string;
  displayName: string | null;
  handle: string | null;
};

/**
 * Resolve organizations that would be left without an owner by account deletion.
 * Failure is deliberately fail-closed: the deletion confirmation must not unlock
 * when membership safety cannot be checked.
 */
export async function fetchOwnedGroupsForDeletion(
  fetcher: typeof fetch = fetch,
): Promise<OwnedGroup[]> {
  const response = await fetcher("/api/cgs/groups", { cache: "no-store" });
  if (!response.ok) throw new Error("owned_groups_unavailable");

  const payload = (await response.json().catch(() => null)) as {
    groups?: Array<{ groupDid?: unknown; role?: unknown; displayName?: unknown; handle?: unknown }>;
  } | null;
  if (!Array.isArray(payload?.groups)) throw new Error("owned_groups_invalid");

  return payload.groups
    .filter((group) => typeof group?.role === "string" && group.role.toLowerCase() === "owner")
    .map((group) => ({
      did: typeof group.groupDid === "string" ? group.groupDid : "",
      displayName: typeof group.displayName === "string" && group.displayName.trim() ? group.displayName.trim() : null,
      handle: typeof group.handle === "string" && group.handle.trim() ? group.handle.trim() : null,
    }))
    .filter((group) => group.did.startsWith("did:"));
}
