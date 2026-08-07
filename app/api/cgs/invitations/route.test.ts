import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createGroupInvitation, fetchAuthSession, processNotification, fetchCgsMemberRoleWithCookie } = vi.hoisted(() => ({
  createGroupInvitation: vi.fn(),
  fetchAuthSession: vi.fn(),
  processNotification: vi.fn(),
  fetchCgsMemberRoleWithCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "session=cookie", "accept-language": "en" }),
}));
vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/auth", () => ({ getAuthForwardCookie: (cookie: string | null) => cookie }));
vi.mock("@/app/_lib/cgs-server", () => ({ fetchCgsMemberRoleWithCookie }));
vi.mock("@/app/_lib/cgs-invitations", async importOriginal => {
  const actual = await importOriginal<typeof import("@/app/_lib/cgs-invitations")>();
  return { ...actual, createGroupInvitation };
});
vi.mock("@/lib/email-notifications/invitation-runtime", () => ({
  createInvitationRuntime: () => ({ process: processNotification }),
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
  processNotification.mockReset();
  processNotification.mockResolvedValue({ kind: "processed", result: { kind: "sent" } });
  fetchCgsMemberRoleWithCookie.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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
    expect(processNotification).toHaveBeenCalledWith(invitation.notification.outboxId, expect.any(Date));
  });

  it("reserves 55 seconds for immediate invitation delivery", async () => {
    const { POST, maxDuration } = await import("./route");
    const before = Date.now();
    const response = await POST(request());
    const after = Date.now();

    expect(response.status).toBe(200);
    const invocationDeadline = processNotification.mock.calls[0]?.[1] as Date | undefined;
    expect(invocationDeadline).toBeInstanceOf(Date);
    expect(invocationDeadline!.getTime()).toBeGreaterThanOrEqual(before + 55_000);
    expect(invocationDeadline!.getTime()).toBeLessThanOrEqual(after + 55_000);
    expect(maxDuration).toBe(60);
  });

  it("still creates the invitation without delivery when notification email is disabled", async () => {
    vi.stubEnv("EMAIL_DISABLED", "true");
    createGroupInvitation.mockResolvedValueOnce({ ...invitation, notification: null });
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(createGroupInvitation).toHaveBeenCalledWith(expect.objectContaining({ enqueueNotification: false }));
    expect(processNotification).not.toHaveBeenCalled();
  });

  it("returns success and logs a redacted event when immediate processing cannot start", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    processNotification.mockRejectedValueOnce(new Error("invitee@example.com provider-secret"));
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"status":"queued"');
    expect(body).not.toContain("provider-secret");
    expect(warn).toHaveBeenCalledWith("[invitation-notifications] Inline processing deferred", {
      outboxId: invitation.notification.outboxId,
      reason: "inline_processing_failed",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("provider-secret");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("invitee@example.com");
  });
});
