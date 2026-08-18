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

describe("complete CGS membership reads", () => {
  it("loads every organization membership page", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({
        groups: [{ groupDid: "did:plc:forest", role: "owner" }],
        cursor: "page-2",
      }))
      .mockResolvedValueOnce(Response.json({
        groups: [{ groupDid: "did:plc:river", role: "member" }],
      }));

    const { fetchAllCgsGroupMembershipsWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsGroupMembershipsWithCookie("session=cookie")).resolves.toEqual([
      { groupDid: "did:plc:forest", role: "owner" },
      { groupDid: "did:plc:river", role: "member" },
    ]);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://auth.example.test/api/cgs/groups?limit=100",
      "https://auth.example.test/api/cgs/groups?limit=100&cursor=page-2",
    ]);
  });

  it("rejects a present non-string organization-list cursor instead of treating it as terminal", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      groups: [{ groupDid: "did:plc:forest", role: "owner" }],
      cursor: 42,
    }));

    const { fetchAllCgsGroupMembershipsWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsGroupMembershipsWithCookie("session=cookie")).rejects.toThrow(
      "The group service returned an invalid organization pagination cursor. Nothing was stored; try again later.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a repeated organization-list cursor instead of returning a partial list", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ groups: [], cursor: "repeated" }))
      .mockResolvedValueOnce(Response.json({ groups: [], cursor: "repeated" }));

    const { fetchAllCgsGroupMembershipsWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsGroupMembershipsWithCookie("session=cookie")).rejects.toThrow(
      "Could not completely load organizations because the group service repeated a pagination cursor. Try again later.",
    );
  });

  it("loads every member page for an organization", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({
        members: [{ did: "did:plc:alice", role: "owner" }],
        cursor: "page-2",
      }))
      .mockResolvedValueOnce(Response.json({
        members: [{ did: "did:plc:bob", role: "admin" }],
      }));

    const { fetchAllCgsMembersWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsMembersWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
    })).resolves.toEqual([
      { did: "did:plc:alice", role: "owner", addedBy: null, addedAt: null },
      { did: "did:plc:bob", role: "admin", addedBy: null, addedAt: null },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ cursor: "page-2", limit: 100 });
  });

  it("rejects a present non-string member-list cursor instead of treating it as terminal", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      members: [{ did: "did:plc:alice", role: "owner" }],
      cursor: 42,
    }));

    const { fetchAllCgsMembersWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsMembersWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
    })).rejects.toThrow(
      "The group service returned an invalid organization member pagination cursor. Nothing was stored; try again later.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a repeated member-list cursor instead of returning a partial roster", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ members: [], cursor: "repeated" }))
      .mockResolvedValueOnce(Response.json({ members: [], cursor: "repeated" }));

    const { fetchAllCgsMembersWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsMembersWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
    })).rejects.toThrow(
      "Could not completely load organization members because the group service repeated a pagination cursor. Try again later.",
    );
  });

  it("rejects an empty complete roster because every CGS organization has an owner", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ members: [] }));

    const { fetchAllCgsMembersWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsMembersWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
    })).rejects.toThrow(
      "The group service returned an empty organization roster. Nothing was stored; try again later.",
    );
  });

  it("rejects an unknown member role instead of silently storing it as member", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      members: [{ did: "did:plc:alice", role: "superadmin" }],
    }));

    const { fetchAllCgsMembersWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsMembersWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
    })).rejects.toThrow(
      "The group service returned invalid organization member data. Nothing was stored; try again later.",
    );
  });

  it("rejects a member repeated across pages instead of choosing an arbitrary role", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({
        members: [{ did: "did:plc:alice", role: "owner" }],
        cursor: "page-2",
      }))
      .mockResolvedValueOnce(Response.json({
        members: [{ did: "did:plc:alice", role: "admin" }],
      }));

    const { fetchAllCgsMembersWithCookie } = await import("./cgs-server");
    await expect(fetchAllCgsMembersWithCookie({
      repo: "did:plc:forest",
      cookie: "session=cookie",
    })).rejects.toThrow(
      "The group service repeated an organization member across pages. Nothing was stored; try again later.",
    );
  });
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
