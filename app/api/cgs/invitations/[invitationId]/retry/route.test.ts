import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getGroupInvitation, retryGroupInvitation, fetchAuthSession, fetchCgsMembersWithCookie, process, GroupInvitationError } = vi.hoisted(() => {
  class HoistedGroupInvitationError extends Error {
    constructor(message: string, readonly status = 400, readonly code?: string) {
      super(message);
      this.name = "GroupInvitationError";
    }
  }
  return {
    getGroupInvitation: vi.fn(),
    retryGroupInvitation: vi.fn(),
    fetchAuthSession: vi.fn(),
    fetchCgsMembersWithCookie: vi.fn(),
    process: vi.fn(),
    GroupInvitationError: HoistedGroupInvitationError,
  };
});

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=cookie" }) }));
vi.mock("@/app/_lib/auth", () => ({ getAuthForwardCookie: (value: string | null) => value }));
vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/cgs-server", () => ({ fetchCgsMembersWithCookie }));
vi.mock("@/app/_lib/cgs-invitations", () => ({
  getGroupInvitation,
  retryGroupInvitation,
  GroupInvitationError,
  invitationNotificationAfterProcess: (notification: object, result: { kind: string; result?: { kind: string } }) => (
    result.kind === "processed" && result.result?.kind === "sent"
      ? { ...notification, status: "sent", retryable: false }
      : notification
  ),
}));
vi.mock("@/lib/email-notifications/delivery", () => ({ createNotificationDelivery: () => ({ process }) }));

const invitationId = "81000000-0000-4000-8000-000000000001";
const invitation = { id: invitationId, repo: "did:plc:forest", role: "member", status: "pending" };
const queued = { outboxId: "10000000-0000-4000-8000-000000000001", status: "queued", retryable: true };

beforeEach(() => {
  fetchAuthSession.mockReset();
  fetchAuthSession.mockResolvedValue({ isLoggedIn: true, did: "did:plc:admin", handle: "admin.example.com" });
  getGroupInvitation.mockReset();
  getGroupInvitation.mockResolvedValue(invitation);
  fetchCgsMembersWithCookie.mockReset();
  fetchCgsMembersWithCookie.mockResolvedValue({ members: [{ did: "did:plc:admin", role: "admin" }] });
  retryGroupInvitation.mockReset();
  retryGroupInvitation.mockResolvedValue(queued);
  process.mockReset();
  process.mockResolvedValue({ kind: "processed", result: { kind: "sent" } });
});

describe("POST invitation email retry", () => {
  it("passes the current server-resolved role and processes the durable retry", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test"), { params: Promise.resolve({ invitationId }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ notification: { ...queued, status: "sent", retryable: false } });
    expect(retryGroupInvitation).toHaveBeenCalledWith({ invitationId, actorRole: "admin" });
    expect(process).toHaveBeenCalledWith(queued.outboxId, expect.any(Date));
  });

  it("returns a stable not-found code when the route preflight cannot find the invitation", async () => {
    getGroupInvitation.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test"), { params: Promise.resolve({ invitationId }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Invitation not found.",
      code: "invitation_not_found",
    });
    expect(retryGroupInvitation).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
  });

  it("returns a stable error code for localized retry feedback", async () => {
    retryGroupInvitation.mockRejectedValueOnce(new GroupInvitationError(
      "Please wait a minute before trying to send this email again.",
      429,
      "invitation_retry_cooldown",
    ));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test"), { params: Promise.resolve({ invitationId }) });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Please wait a minute before trying to send this email again.",
      code: "invitation_retry_cooldown",
    });
    expect(process).not.toHaveBeenCalled();
  });

  it("reserves 55 seconds for immediate retry delivery", async () => {
    const { POST, maxDuration } = await import("./route");
    const before = Date.now();
    const response = await POST(
      new Request("https://example.test"),
      { params: Promise.resolve({ invitationId }) },
    );
    const after = Date.now();

    expect(response.status).toBe(200);
    const invocationDeadline = process.mock.calls[0]?.[1] as Date | undefined;
    expect(invocationDeadline).toBeInstanceOf(Date);
    expect(invocationDeadline!.getTime()).toBeGreaterThanOrEqual(before + 55_000);
    expect(invocationDeadline!.getTime()).toBeLessThanOrEqual(after + 55_000);
    expect(maxDuration).toBe(60);
  });

  it("returns the plain-language permission error without processing", async () => {
    retryGroupInvitation.mockRejectedValueOnce(new GroupInvitationError("Only organization owners and admins can retry invitation emails.", 403));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test"), { params: Promise.resolve({ invitationId }) });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Only organization owners and admins can retry invitation emails." });
    expect(process).not.toHaveBeenCalled();
  });
});
