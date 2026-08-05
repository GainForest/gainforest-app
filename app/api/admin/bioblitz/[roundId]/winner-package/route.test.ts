import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGainForestModeratorAccess, createBioblitzWinnerPackage } = vi.hoisted(() => ({
  getGainForestModeratorAccess: vi.fn(),
  createBioblitzWinnerPackage: vi.fn(),
}));

vi.mock("@/app/internal/badges/_lib/access", () => ({ getGainForestModeratorAccess }));
vi.mock("@/app/admin/_lib/bioblitz-winner-package", () => ({
  BioblitzWinnerPackageError: class BioblitzWinnerPackageError extends Error {},
  createBioblitzWinnerPackage,
}));

import { GET } from "./route";

function context(roundId: string) {
  return { params: Promise.resolve({ roundId }) };
}

describe("GET /api/admin/bioblitz/[roundId]/winner-package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createBioblitzWinnerPackage.mockResolvedValue({
      filename: "Round 3 Best Picture Winner.zip",
      body: new Blob(["zip-bytes"], { type: "application/zip" }),
    });
  });

  it("rejects an unsigned request before generating an archive", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: false, isModerator: false, repoDid: null });

    const response = await GET(
      new Request("https://example.test/api/admin/bioblitz/3/winner-package?prize=best-picture"),
      context("3"),
    );

    expect(response.status).toBe(401);
    expect(createBioblitzWinnerPackage).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-moderator before generating an archive", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: true, isModerator: false, repoDid: "did:plc:gainforest" });

    const response = await GET(
      new Request("https://example.test/api/admin/bioblitz/3/winner-package?prize=best-picture"),
      context("3"),
    );

    expect(response.status).toBe(403);
    expect(createBioblitzWinnerPackage).not.toHaveBeenCalled();
  });

  it("rejects a moderator without the moderation repository before generating an archive", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: true, isModerator: true, repoDid: null });

    const response = await GET(
      new Request("https://example.test/api/admin/bioblitz/3/winner-package?prize=best-picture"),
      context("3"),
    );

    expect(response.status).toBe(403);
    expect(createBioblitzWinnerPackage).not.toHaveBeenCalled();
  });

  it("rejects an unknown prize before generating an archive", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: true, isModerator: true, repoDid: "did:plc:gainforest" });

    const response = await GET(
      new Request("https://example.test/api/admin/bioblitz/3/winner-package?prize=everything"),
      context("3"),
    );

    expect(response.status).toBe(400);
    expect(createBioblitzWinnerPackage).not.toHaveBeenCalled();
  });

  it("passes only the validated round, prize, and moderator-owned repo to package generation", async () => {
    getGainForestModeratorAccess.mockResolvedValue({ isLoggedIn: true, isModerator: true, repoDid: "did:plc:gainforest" });

    const response = await GET(
      new Request("https://example.test/api/admin/bioblitz/3/winner-package?prize=best-picture"),
      context("3"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain('filename="Round 3 Best Picture Winner.zip"');
    expect(createBioblitzWinnerPackage).toHaveBeenCalledWith(3, "best-picture", "did:plc:gainforest");
    await expect(response.text()).resolves.toBe("zip-bytes");
  });
});
