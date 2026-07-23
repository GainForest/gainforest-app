import { describe, expect, it, vi } from "vitest";
import { fetchOwnedGroupsForDeletion } from "./account-deletion-safety";

function response(ok: boolean, payload: unknown): Response {
  return { ok, json: vi.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe("account deletion ownership safety", () => {
  it("fails closed when memberships cannot be loaded", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(false, {}));
    await expect(fetchOwnedGroupsForDeletion(fetcher)).rejects.toThrow("owned_groups_unavailable");
  });

  it("fails closed when the membership response is malformed", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(true, {}));
    await expect(fetchOwnedGroupsForDeletion(fetcher)).rejects.toThrow("owned_groups_invalid");
  });

  it("returns only valid organizations owned by the viewer", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(true, {
      groups: [
        { groupDid: "did:plc:owned", role: "OWNER", displayName: " Forest Team ", handle: "forest.example" },
        { groupDid: "did:plc:member", role: "member", displayName: "Member Team" },
        { groupDid: "invalid", role: "owner", displayName: "Invalid" },
      ],
    }));

    await expect(fetchOwnedGroupsForDeletion(fetcher)).resolves.toEqual([
      { did: "did:plc:owned", displayName: "Forest Team", handle: "forest.example" },
    ]);
  });
});
