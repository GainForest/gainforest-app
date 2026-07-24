import { describe, expect, it } from "vitest";
import { accountPathMatches } from "./AccountTabBar";
import { profileListIdentity, takeFreshProfileItems } from "./ProfileListSkeleton";

describe("profile social state identity", () => {
  it("changes when navigating to another DID on the same view", () => {
    expect(profileListIdentity("did:example:alice", "posts")).not.toBe(
      profileListIdentity("did:example:bob", "posts"),
    );
  });

  it("changes when switching views on the same DID", () => {
    expect(profileListIdentity("did:example:alice", "followers")).not.toBe(
      profileListIdentity("did:example:alice", "following"),
    );
  });
});

describe("profile page deduplication", () => {
  it("returns each row once and updates the shared seen set before enrichment", () => {
    const seen = new Set(["existing"]);
    const page = [{ id: "existing" }, { id: "new" }, { id: "new" }];

    expect(takeFreshProfileItems(page, seen, (item) => item.id)).toEqual([{ id: "new" }]);
    expect([...seen]).toEqual(["existing", "new"]);
    expect(takeFreshProfileItems(page, seen, (item) => item.id)).toEqual([]);
  });
});

describe("account tab path boundaries", () => {
  it("matches the exact route and descendants", () => {
    expect(accountPathMatches("/account/alice/posts", "/account/alice/posts")).toBe(true);
    expect(accountPathMatches("/account/alice/posts/thread", "/account/alice/posts")).toBe(true);
  });

  it("does not match routes that only share a prefix", () => {
    expect(accountPathMatches("/account/alice/posts-archive", "/account/alice/posts")).toBe(false);
    expect(accountPathMatches("/account/alice", "/account/al")).toBe(false);
  });
});
