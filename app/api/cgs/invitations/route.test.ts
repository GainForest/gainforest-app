import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createGroupInvitation, fetchAuthSession, process, fetchCgsMembersWithCookie } = vi.hoisted(() => ({
  createGroupInvitation: vi.fn(),
  fetchAuthSession: vi.fn(),
  process: vi.fn(),
  fetchCgsMembersWithCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "session=cookie", "accept-language": "en" }),
}));
vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/auth", () => ({ getAuthForwardCookie: (cookie: string | null) => cookie }));
vi.mock("@/app/_lib/cgs-server", () => ({ fetchCgsMembersWithCookie }));
vi.mock("@/app/_lib/cgs-invitations", async importOriginal => {
  const actual = await importOriginal<typeof import("@/app/_lib/cgs-invitations")>();
  return { ...actual, createGroupInvitation };
});
vi.mock("@/lib/notifications/invitation-runtime", () => ({
  createInvitationRuntime: () => ({ process }),
}));

const invitation = {
  id: "81000000-0000-4000-8000-000000000001",
  repo: "did:plc:forest",
  email: "invitee@example.com",
  role: "member" as const,
  status: "pending" as const,
  inviterDid: "did:plc:owner",
  inviterHandle: "owner.example.com",
  inviterEmail: "owner@example.com",
  groupName: "Forest Circle",
  groupHandle: "forest.example.com",
  createdAt: "2026-08-06T01:00:00.000Z",
  expiresAt: "2026-08-13T01:00:00.000Z",
  acceptedAt: null,
  acceptedByDid: null,
  acceptedByEmail: null,
  emailSentAt: null,
  lastEmailError: null,
  notification: {
    outboxId: "10000000-0000-4000-8000-000000000001",
    status: "queued" as const,
    retryable: true,
  },
};

beforeEach(() => {
  vi.stubEnv("EMAIL_DISABLED", "false");
  fetchAuthSession.mockReset();
  fetchAuthSession.mockResolvedValue({ isLoggedIn: true, did: "did:plc:owner", handle: "owner.example.com", email: "owner@example.com" });
  createGroupInvitation.mockReset();
  createGroupInvitation.mockResolvedValue(structuredClone(invitation));
  process.mockReset();
  process.mockResolvedValue({ kind: "processed", result: { kind: "sent" } });
  fetchCgsMembersWithCookie.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

function request() {
  return new Request("https://example.test/api/cgs/invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: "did:plc:forest", email: "invitee@example.com", role: "member" }),
  });
}

describe("POST /api/cgs/invitations", () => {
  it("creates atomically then awaits one bounded processing run", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      invitation: { id: invitation.id, notification: { status: "sent", retryable: false } },
    });
    expect(createGroupInvitation).toHaveBeenCalledWith(expect.objectContaining({ enqueueNotification: true }));
    expect(process).toHaveBeenCalledWith(invitation.notification.outboxId, expect.any(Date));
  });

  it("still creates the invitation without delivery when notification email is disabled", async () => {
    vi.stubEnv("EMAIL_DISABLED", "true");
    createGroupInvitation.mockResolvedValueOnce({ ...invitation, notification: null });
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(createGroupInvitation).toHaveBeenCalledWith(expect.objectContaining({ enqueueNotification: false }));
    expect(process).not.toHaveBeenCalled();
  });

  it("returns success with queued delivery when immediate processing cannot start", async () => {
    process.mockRejectedValueOnce(new Error("invitee@example.com provider-secret"));
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"status":"queued"');
    expect(body).not.toContain("provider-secret");
  });
});
