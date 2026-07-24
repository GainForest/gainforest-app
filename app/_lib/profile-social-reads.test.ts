import { beforeEach, describe, expect, it, vi } from "vitest";

const { indexerQuery } = vi.hoisted(() => ({ indexerQuery: vi.fn() }));

vi.mock("./indexer", () => ({ indexerQuery }));
vi.mock("./auth-client", () => ({ redirectToLogin: vi.fn() }));
vi.mock("./viewer", () => ({ useViewer: vi.fn() }));
vi.mock("@/app/(manage)/manage/_lib/mutations", () => ({
  createFollow: vi.fn(),
  deleteFollow: vi.fn(),
}));

import { fetchProfileLikes, fetchProfilePosts } from "./profile-activity";
import { fetchFollowConnections, fetchFollowStats } from "./follows";

describe("profile social reads", () => {
  beforeEach(() => indexerQuery.mockReset());

  it.each([
    ["posts", () => fetchProfilePosts("did:example:alice", false)],
    ["replies", () => fetchProfilePosts("did:example:alice", true)],
    ["likes", () => fetchProfileLikes("did:example:alice")],
    ["followers", () => fetchFollowConnections("did:example:alice", "followers")],
    ["following", () => fetchFollowConnections("did:example:alice", "following")],
    ["follow stats", () => fetchFollowStats("did:example:alice", null)],
  ])("propagates %s load failures instead of returning an empty result", async (_label, read) => {
    indexerQuery.mockRejectedValueOnce(new Error("indexer unavailable"));
    await expect(read()).rejects.toThrow("indexer unavailable");
  });

  it("preserves the successful posts page contract", async () => {
    indexerQuery.mockResolvedValueOnce({
      appGainforestFeedPost: {
        pageInfo: { hasNextPage: true, endCursor: "next" },
        edges: [{ node: { uri: "at://did:example:alice/app.gainforest.feed.post/1", text: "Hello", createdAt: "2026-01-01T00:00:00Z" } }],
      },
    });

    await expect(fetchProfilePosts("did:example:alice", false)).resolves.toEqual({
      items: [{ uri: "at://did:example:alice/app.gainforest.feed.post/1", text: "Hello", createdAt: "2026-01-01T00:00:00Z", parentUri: null }],
      nextCursor: "next",
    });
  });

  it("preserves the successful follower page contract", async () => {
    indexerQuery.mockResolvedValueOnce({
      appCertifiedGraphFollow: {
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [{ node: { did: "did:example:bob", createdAt: null } }],
      },
    });

    await expect(fetchFollowConnections("did:example:alice", "followers")).resolves.toEqual({
      items: [{ did: "did:example:bob", createdAt: null }],
      nextCursor: null,
    });
  });
});
