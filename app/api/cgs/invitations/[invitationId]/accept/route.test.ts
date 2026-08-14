import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { acceptGroupInvitation, deliver, fetchAuthSession } = vi.hoisted(() => ({
  acceptGroupInvitation: vi.fn(),
  deliver: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/cgs-invitations", async () => {
  const actual = await vi.importActual<typeof import("@/app/_lib/cgs-invitations")>("@/app/_lib/cgs-invitations");
  return { ...actual, acceptGroupInvitation };
});
vi.mock("@/lib/email-notifications/welcome-runtime", () => ({
  createWelcomeRuntime: () => ({ deliver }),
}));

const invitationId = "81000000-0000-4000-8000-000000000001";
const acceptedInvitation = {
  id: invitationId,
  repo: "did:plc:forest",
  email: "invitee@example.com",
  role: "member",
  status: "accepted",
  groupName: "Forest Circle",
  acceptedAt: "2026-08-06T01:05:00.000Z",
  acceptedByDid: "did:plc:member",
  acceptedByEmail: "invitee@example.com",
  notification: null,
};

beforeEach(() => {
  fetchAuthSession.mockReset();
  fetchAuthSession.mockResolvedValue({
    isLoggedIn: true,
    did: "did:plc:member",
    handle: "member.example.com",
    email: "invitee@example.com",
  });
  acceptGroupInvitation.mockReset();
  acceptGroupInvitation.mockResolvedValue(acceptedInvitation);
  deliver.mockReset();
  deliver.mockResolvedValue({
    kind: "durable",
    outboxId: "10000000-0000-4000-8000-000000000002",
    status: "sent",
    duplicate: false,
    retryable: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST invitation acceptance", () => {
  it("accepts membership, then delivers through the existing welcome runtime", async () => {
    const { POST } = await import("./route");
    const before = Date.now();
    const response = await POST(new Request("https://example.test"), {
      params: Promise.resolve({ invitationId }),
    });

    expect(response.status).toBe(200);
    expect(acceptGroupInvitation).toHaveBeenCalledWith({
      invitationId,
      session: expect.objectContaining({ did: "did:plc:member" }),
    });
    expect(deliver).toHaveBeenCalledWith({
      type: "membership_joined",
      authEventId: `invitation.accepted.v1:${invitationId}`,
      userDid: "did:plc:member",
      email: "invitee@example.com",
      createdAt: "2026-08-06T01:05:00.000Z",
      organizationDid: "did:plc:forest",
      organizationName: "Forest Circle",
    }, expect.any(Date));
    expect(deliver.mock.calls[0]![1].getTime()).toBeGreaterThanOrEqual(before + 55_000);
    await expect(response.json()).resolves.toMatchObject({
      invitation: { status: "accepted" },
      notification: { kind: "durable", status: "sent" },
    });
  });

  it("accepts without email work when the shared runtime is disabled", async () => {
    deliver.mockResolvedValueOnce({ kind: "disabled" });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test"), {
      params: Promise.resolve({ invitationId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ notification: { kind: "disabled" } });
  });

  it("returns an error after durable acceptance so retry can enqueue with the same stable ID", async () => {
    deliver.mockRejectedValueOnce(new Error("invitee@example.com provider-secret"));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test"), {
      params: Promise.resolve({ invitationId }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "You joined the organization, but we couldn’t queue the joined email. Please try again.",
      code: "invitation_acceptance_incomplete",
    });
    expect(acceptGroupInvitation).toHaveBeenCalledOnce();
  });
});
