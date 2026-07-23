import { describe, expect, it } from "vitest";
import { canViewLeaderboardRoute } from "./route-access";

describe("leaderboard route access", () => {
  it("allows moderators and denies other viewers", () => {
    expect(canViewLeaderboardRoute(true)).toBe(true);
    expect(canViewLeaderboardRoute(false)).toBe(false);
  });
});
