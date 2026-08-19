import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  fetchAllCgsGroupMembershipsWithCookie,
  fetchCgsMemberRoleWithCookie,
  getCertifiedProfileCard,
  supabaseRpc,
  supabaseSelect,
} = vi.hoisted(() => ({
  fetchAllCgsGroupMembershipsWithCookie: vi.fn(),
  fetchCgsMemberRoleWithCookie: vi.fn(),
  getCertifiedProfileCard: vi.fn(),
  supabaseRpc: vi.fn(),
  supabaseSelect: vi.fn(),
}));

vi.mock("@/app/_lib/cgs-server", () => ({
  fetchAllCgsGroupMembershipsWithCookie,
  fetchCgsMemberRoleWithCookie,
}));
vi.mock("@/app/account/_lib/account-route", () => ({
  accountPath: (identifier: string) => `/account/${identifier}`,
  getCertifiedProfileCard,
}));
vi.mock("@/lib/supabase/rest", () => ({
  supabaseFilterValue: encodeURIComponent,
  supabaseRpc,
  supabaseSelect,
}));

import {
  acceptGroupInvitation,
  createGroupInvitation,
  GroupInvitationError,
  retryGroupInvitation,
} from "./cgs-invitations";

// Pin the clock inside the fixture's validity window: invitation status is
// derived by comparing expires_at against the real clock, so without this the
// suite starts failing the day the calendar passes the fixture's expiry date.
const NOW = new Date("2026-08-06T01:00:00.000Z");

const invitationId = "81000000-0000-4000-8000-000000000001";
const rawInvitation = {
  id: invitationId,
  repo: "did:plc:forest",
  email: "invitee@example.com",
  role: "member",
  status: "pending",
  inviter_did: "did:plc:owner",
  inviter_handle: "owner.example.com",
  inviter_email: "owner@example.com",
  group_name: "Forest Circle",
  group_handle: "forest.example.com",
  created_at: "2026-08-06T01:00:00.000Z",
  expires_at: "2026-08-13T01:00:00.000Z",
  accepted_at: null,
  accepted_by_did: null,
  accepted_by_email: null,
  email_sent_at: null,
  last_email_error: null,
};
const session = {
  isLoggedIn: true as const,
  did: "did:plc:owner",
  handle: "owner.example.com",
  email: "owner@example.com",
};
const inviteeSession = {
  isLoggedIn: true as const,
  did: "did:plc:invitee",
  handle: "invitee.example.com",
  email: "invitee@example.com",
};
const acceptedRawInvitation = {
  ...rawInvitation,
  status: "accepted",
  accepted_at: "2026-08-06T01:01:00.000Z",
  accepted_by_did: inviteeSession.did,
  accepted_by_email: inviteeSession.email,
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
  vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "test-internal-service-token");
  fetchAllCgsGroupMembershipsWithCookie.mockReset();
  fetchCgsMemberRoleWithCookie.mockReset();
  getCertifiedProfileCard.mockReset();
  supabaseRpc.mockReset();
  supabaseSelect.mockReset();
  fetchCgsMemberRoleWithCookie.mockResolvedValue("owner");
  getCertifiedProfileCard.mockImplementation(async (did: string) => did === "did:plc:forest"
    ? { displayName: "Forest Circle", handle: "forest.example.com", avatarUrl: null }
    : { displayName: "Forest Owner", handle: "owner.example.com", avatarUrl: null });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(invitationId);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createGroupInvitation", () => {
  it("uses one atomic RPC and never calls the legacy direct provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    supabaseRpc.mockResolvedValue({
      invitation: rawInvitation,
      notification: { outbox_id: "10000000-0000-4000-8000-000000000001", status: "queued", duplicate: false },
    });

    const invitation = await createGroupInvitation({
      repo: "did:plc:forest",
      email: " INVITEE@Example.com ",
      role: "member",
      session,
      cookie: "session=cookie",
      acceptLanguage: "pt-BR",
      enqueueNotification: true,
    });

    expect(invitation.notification).toEqual({
      outboxId: "10000000-0000-4000-8000-000000000001",
      status: "queued",
      duplicate: false,
      retryable: true,
    });
    expect(supabaseRpc).toHaveBeenCalledTimes(1);
    expect(supabaseRpc).toHaveBeenCalledWith("notification_invitation_create", expect.objectContaining({
      p_invitation_id: invitationId,
      p_repo: "did:plc:forest",
      p_email: "invitee@example.com",
      p_role: "member",
      p_inviter_did: session.did,
      p_group_name: "Forest Circle",
      p_inviter_name: "Forest Owner",
      p_public_origin: "https://example.test",
      p_locale: "pt",
      p_enqueue_notification: true,
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the localized generic inviter copy when the inviter profile is unavailable", async () => {
    getCertifiedProfileCard.mockImplementation(async (did: string) => did === "did:plc:forest"
      ? { displayName: "Forest Circle", handle: "forest.example.com", avatarUrl: null }
      : { displayName: null, handle: null, avatarUrl: null });
    supabaseRpc.mockResolvedValue({ invitation: rawInvitation, notification: null });

    await createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "member", session,
      cookie: "session=cookie", acceptLanguage: "es", enqueueNotification: false,
    });

    expect(supabaseRpc).toHaveBeenCalledWith("notification_invitation_create", expect.objectContaining({
      p_inviter_name: null,
      p_locale: "es",
    }));
  });

  it("persists the invitation without an outbox row when its producer is disabled", async () => {
    supabaseRpc.mockResolvedValue({ invitation: rawInvitation, notification: null });
    const invitation = await createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "member", session,
      cookie: "session=cookie", acceptLanguage: null, enqueueNotification: false,
    });
    expect(invitation.notification).toBeNull();
    expect(supabaseRpc).toHaveBeenCalledWith("notification_invitation_create", expect.objectContaining({ p_enqueue_notification: false }));
  });

  it("enforces current organization role before database mutation", async () => {
    fetchCgsMemberRoleWithCookie.mockResolvedValue("member");
    await expect(createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "member", session,
      cookie: "session=cookie", acceptLanguage: null, enqueueNotification: true,
    })).rejects.toMatchObject({ name: "GroupInvitationError", status: 403 });
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("maps role conflicts to actionable copy without provider details", async () => {
    supabaseRpc.mockRejectedValue(new Error("invitation_role_conflict invitee@example.com private payload"));
    const error = await createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "admin", session,
      cookie: "session=cookie", acceptLanguage: null, enqueueNotification: true,
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(GroupInvitationError);
    expect((error as GroupInvitationError).message).toBe("Cancel the pending invitation before changing this person’s role.");
    expect((error as GroupInvitationError).message).not.toContain("invitee@example.com");
    expect((error as GroupInvitationError).message).not.toContain("private payload");
    expect((error as GroupInvitationError).code).toBe("invitation_role_conflict");
    expect((error as GroupInvitationError).status).toBe(409);
  });

  it.each(["", "not-a-url", "http://example.test", "https://example.test/path"])(
    "rejects an invalid configured public site origin %j before persistence",
    async siteUrl => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
      supabaseRpc.mockResolvedValue({ invitation: rawInvitation, notification: null });

      await expect(createGroupInvitation({
        repo: "did:plc:forest", email: "invitee@example.com", role: "member", session,
        cookie: "session=cookie", acceptLanguage: null, enqueueNotification: true,
      })).rejects.toMatchObject({
        name: "GroupInvitationError",
        message: "Invitation could not be saved. Please try again.",
        status: 502,
      });
      expect(supabaseRpc).not.toHaveBeenCalled();
    },
  );

  it("uses the configured public site origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gainforest.app/");
    supabaseRpc.mockResolvedValue({ invitation: rawInvitation, notification: null });

    await createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "member", session,
      cookie: "session=cookie", acceptLanguage: null, enqueueNotification: true,
    });

    expect(supabaseRpc).toHaveBeenCalledWith("notification_invitation_create", expect.objectContaining({
      p_inviter_url: "https://www.gainforest.app/account/owner.example.com",
      p_public_origin: "https://www.gainforest.app",
    }));
  });
});

describe("acceptGroupInvitation", () => {
  it("accepts a clear member-add success without an extra membership read", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    supabaseRpc.mockResolvedValueOnce({ invitation: acceptedRawInvitation, notification: null });

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).resolves.toMatchObject({ status: "accepted", acceptedByDid: inviteeSession.did });

    expect(fetchAllCgsGroupMembershipsWithCookie).not.toHaveBeenCalled();
    expect(supabaseRpc).toHaveBeenCalledWith("notification_invitation_close", expect.objectContaining({
      p_invitation_id: invitationId,
      p_status: "accepted",
      p_accepted_by_did: inviteeSession.did,
      p_accepted_by_email: inviteeSession.email,
    }));
  });

  it("bounds member-add and reconciles when the request aborts", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchMock = vi.fn((_url: URL, init?: RequestInit) => {
      if (!init?.signal) return Promise.reject(new Error("missing abort signal"));
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    fetchAllCgsGroupMembershipsWithCookie.mockResolvedValueOnce([
      { groupDid: rawInvitation.repo, role: rawInvitation.role },
    ]);
    supabaseRpc.mockResolvedValueOnce({ invitation: acceptedRawInvitation, notification: null });

    const acceptance = acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(acceptance).resolves.toMatchObject({ status: "accepted" });
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetchAllCgsGroupMembershipsWithCookie).toHaveBeenCalledWith("session=cookie");
  });

  it.each([
    ["an upstream server response", () => Response.json({ error: "temporary" }, { status: 503 })],
    ["a thrown member-add request", () => Promise.reject(new Error("timed out"))],
  ])("reconciles %s when the expected membership and role are present", async (_case, addResult) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(addResult));
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    fetchAllCgsGroupMembershipsWithCookie.mockResolvedValueOnce([
      { groupDid: rawInvitation.repo, role: rawInvitation.role },
    ]);
    supabaseRpc.mockResolvedValueOnce({ invitation: acceptedRawInvitation, notification: null });

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).resolves.toMatchObject({ status: "accepted" });

    expect(fetchAllCgsGroupMembershipsWithCookie).toHaveBeenCalledWith("session=cookie");
  });

  it("does not reconcile a definite member-add rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "forbidden" }, { status: 403 })));
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).rejects.toMatchObject({
      name: "GroupInvitationError",
      status: 502,
    });
    expect(fetchAllCgsGroupMembershipsWithCookie).not.toHaveBeenCalled();
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("keeps the invitation pending when an ambiguous add cannot be found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "temporary" }, { status: 503 })));
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    fetchAllCgsGroupMembershipsWithCookie.mockResolvedValueOnce([]);

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).rejects.toMatchObject({
      name: "GroupInvitationError",
      status: 503,
      code: "membership_outcome_unknown",
    });
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("rejects a confirmed membership with a conflicting role", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "temporary" }, { status: 503 })));
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    fetchAllCgsGroupMembershipsWithCookie.mockResolvedValueOnce([
      { groupDid: rawInvitation.repo, role: "admin" },
    ]);

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).rejects.toMatchObject({
      name: "GroupInvitationError",
      status: 409,
      code: "invitation_role_conflict",
    });
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("logs redacted context when membership reconciliation is unavailable", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timed out")));
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    fetchAllCgsGroupMembershipsWithCookie.mockRejectedValueOnce(new Error("membership endpoint unavailable"));

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).rejects.toMatchObject({
      name: "GroupInvitationError",
      status: 503,
      code: "membership_outcome_unknown",
    });

    expect(log).toHaveBeenCalledWith("[cgs-invitations] Membership reconciliation failed", {
      invitationId,
      repo: rawInvitation.repo,
      reason: "Error",
    });
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("rejects when a concurrent close returns another acceptor's identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    supabaseRpc.mockResolvedValueOnce({
      invitation: {
        ...acceptedRawInvitation,
        accepted_by_did: "did:plc:other-invitee",
      },
      notification: null,
    });

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).rejects.toMatchObject({
      name: "GroupInvitationError",
      status: 409,
      code: "invitation_not_pending",
    });
  });

  it("returns an already accepted invitation for the same DID and normalized email without new work", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    supabaseSelect.mockResolvedValueOnce([{ ...acceptedRawInvitation, accepted_by_email: "INVITEE@EXAMPLE.COM" }]);

    await expect(acceptGroupInvitation({
      invitationId,
      session: inviteeSession,
      cookie: "session=cookie",
    })).resolves.toMatchObject({ status: "accepted", acceptedByDid: inviteeSession.did });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fetchAllCgsGroupMembershipsWithCookie).not.toHaveBeenCalled();
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("rejects an accepted invitation when the current person does not match", async () => {
    vi.stubGlobal("fetch", vi.fn());
    supabaseSelect.mockResolvedValueOnce([acceptedRawInvitation]);

    await expect(acceptGroupInvitation({
      invitationId,
      session: { ...inviteeSession, did: "did:plc:someone-else" },
      cookie: "session=cookie",
    })).rejects.toMatchObject({
      name: "GroupInvitationError",
      status: 409,
      code: "invitation_not_pending",
    });
    expect(fetchAllCgsGroupMembershipsWithCookie).not.toHaveBeenCalled();
    expect(supabaseRpc).not.toHaveBeenCalled();
  });
});

describe("retryGroupInvitation", () => {
  it("checks the actor role before invoking the cooldown-protected RPC", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    await expect(retryGroupInvitation({ invitationId, actorRole: "member" })).rejects.toMatchObject({ status: 403 });
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("normalizes a successful retry summary", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    supabaseRpc.mockResolvedValue({
      outbox_id: "10000000-0000-4000-8000-000000000001",
      status: "queued",
      retryable: true,
      next_attempt_at: "2026-08-06T01:05:00.000Z",
    });

    await expect(retryGroupInvitation({ invitationId, actorRole: "owner" })).resolves.toEqual({
      outboxId: "10000000-0000-4000-8000-000000000001",
      status: "queued",
      retryable: true,
      nextAttemptAt: "2026-08-06T01:05:00.000Z",
    });
  });

  it.each([
    ["invitation_retry_cooldown", 429],
    ["invitation_notification_not_safely_retryable", 409],
  ])("maps %s to status %i", async (token, status) => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    supabaseRpc.mockRejectedValue(new Error(`${token} invitee@example.com private payload`));

    const error = await retryGroupInvitation({ invitationId, actorRole: "owner" }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ name: "GroupInvitationError", status });
    expect((error as GroupInvitationError).message).not.toContain("invitee@example.com");
    expect((error as GroupInvitationError).message).not.toContain("private payload");
  });
});
