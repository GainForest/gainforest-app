import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchCgsMemberRoleWithCookie", () => {
  it("finds an actor on a later member page", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({
        members: [{ did: "did:plc:first", role: "member" }],
        cursor: "page-2",
      }))
      .mockResolvedValueOnce(Response.json({
        members: [{ did: "did:plc:actor", role: "admin" }],
      }));

    const { fetchCgsMemberRoleWithCookie } = await import("./cgs-server");
    await expect(fetchCgsMemberRoleWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
      did: "did:plc:actor",
    })).resolves.toBe("admin");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty("cursor");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ cursor: "page-2", limit: 100 });
  });

  it("stops safely when the group service repeats a cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ members: [], cursor: "repeated" }))
      .mockResolvedValueOnce(Response.json({ members: [], cursor: "repeated" }));

    const { fetchCgsMemberRoleWithCookie } = await import("./cgs-server");
    await expect(fetchCgsMemberRoleWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
      did: "did:plc:missing",
    })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
