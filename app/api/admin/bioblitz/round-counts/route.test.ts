import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getGainForestModeratorAccess,
  bioblitzRounds,
  loadBioblitzAdminRoundCounts,
} = vi.hoisted(() => ({
  getGainForestModeratorAccess: vi.fn(),
  bioblitzRounds: vi.fn(),
  loadBioblitzAdminRoundCounts: vi.fn(),
}));

vi.mock("@/app/internal/badges/_lib/access", () => ({ getGainForestModeratorAccess }));
vi.mock("@/app/_lib/bioblitz", () => ({ bioblitzRounds }));
vi.mock("@/app/admin/_lib/bioblitz-dashboard", () => ({ loadBioblitzAdminRoundCounts }));

import { GET } from "./route";

describe("GET /api/admin/bioblitz/round-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bioblitzRounds.mockReturnValue([{ id: 5 }]);
    loadBioblitzAdminRoundCounts.mockResolvedValue([{ roundId: 5, totalObservations: 486 }]);
  });

  it("rejects an unsigned request before reading round totals", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: false, isModerator: false });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(loadBioblitzAdminRoundCounts).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-moderator before reading round totals", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: true, isModerator: false });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(loadBioblitzAdminRoundCounts).not.toHaveBeenCalled();
  });

  it("returns totals only to a moderator", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: true, isModerator: true });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      counts: [{ roundId: 5, totalObservations: 486 }],
    });
    expect(loadBioblitzAdminRoundCounts).toHaveBeenCalledWith([{ id: 5 }]);
  });
});
