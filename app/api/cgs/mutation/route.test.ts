import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { scheduleOrganizationRosterSync, getAuthForwardCookie, fetchMock } = vi.hoisted(() => ({
  scheduleOrganizationRosterSync: vi.fn(),
  getAuthForwardCookie: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "session=cookie" }),
}));
vi.mock("@/app/_lib/auth", () => ({
  getAuthBaseUrl: () => "https://auth.example.test",
  getAuthForwardCookie,
}));
vi.mock("@/app/_lib/organization-memberships", () => ({ scheduleOrganizationRosterSync }));

beforeEach(() => {
  scheduleOrganizationRosterSync.mockReset();
  getAuthForwardCookie.mockReset();
  getAuthForwardCookie.mockReturnValue("forwarded=session");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function request(body: Record<string, unknown>) {
  return new Request("https://gainforest.app/api/cgs/mutation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cgs/mutation", () => {
  it("schedules a forced roster refresh after CGS adds a member", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    const { POST } = await import("./route");

    const response = await POST(request({
      operation: "addMember",
      repo: "did:plc:forest",
      memberDid: "did:plc:river",
      role: "member",
    }));

    expect(response.status).toBe(200);
    expect(scheduleOrganizationRosterSync).toHaveBeenCalledWith("did:plc:forest", "session=cookie");
  });

  it("schedules a forced roster refresh for the group returned by registration", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ groupDid: "did:plc:new-forest" }));
    const { POST } = await import("./route");

    const response = await POST(request({
      operation: "registerGroup",
      handle: "new-forest",
      ownerDid: "did:plc:owner",
    }));

    expect(response.status).toBe(200);
    expect(scheduleOrganizationRosterSync).toHaveBeenCalledWith("did:plc:new-forest", "session=cookie");
  });

  it("does not schedule a refresh when CGS rejects a membership mutation", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Forbidden" }, { status: 403 }));
    const { POST } = await import("./route");

    const response = await POST(request({
      operation: "removeMember",
      repo: "did:plc:forest",
      memberDid: "did:plc:river",
    }));

    expect(response.status).toBe(403);
    expect(scheduleOrganizationRosterSync).not.toHaveBeenCalled();
  });
});
