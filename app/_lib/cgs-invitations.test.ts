import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchCgsMemberRoleWithCookie, getCertifiedProfileCard, supabaseRpc, supabaseSelect } = vi.hoisted(() => ({
  fetchCgsMemberRoleWithCookie: vi.fn(),
  getCertifiedProfileCard: vi.fn(),
  supabaseRpc: vi.fn(),
  supabaseSelect: vi.fn(),
}));

vi.mock("@/app/_lib/cgs-server", () => ({ fetchCgsMemberRoleWithCookie }));
vi.mock("@/app/account/_lib/account-route", () => ({
  accountPath: (identifier: string) => `/account/${identifier}`,
  getCertifiedProfileCard,
}));
vi.mock("@/lib/supabase/rest", () => ({
  supabaseFilterValue: encodeURIComponent,
  supabaseRpc,
  supabaseSelect,
}));

import { acceptGroupInvitation, createGroupInvitation, GroupInvitationError, retryGroupInvitation } from "./cgs-invitations";

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
  expires_at: "2099-08-13T01:00:00.000Z",
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

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
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
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
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
  const inviteeSession = {
    isLoggedIn: true as const,
    did: "did:plc:member",
    handle: "member.example.com",
    email: "invitee@example.com",
  };

  it("adds the member, then marks the invitation accepted", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    supabaseRpc.mockResolvedValueOnce({
      invitation: {
        ...rawInvitation,
        status: "accepted",
        accepted_at: "2026-08-06T01:05:00.000Z",
        accepted_by_did: inviteeSession.did,
        accepted_by_email: inviteeSession.email,
      },
      notification: {
        outbox_id: "10000000-0000-4000-8000-000000000002",
        status: "suppressed",
        duplicate: false,
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      memberDid: inviteeSession.did,
      role: rawInvitation.role,
      alreadyMember: false,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "internal-secret");

    const invitation = await acceptGroupInvitation({ invitationId, session: inviteeSession });

    expect(fetchMock).toHaveBeenCalledWith(new URL("https://auth.example.test/api/internal/cgs/member-add"), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        actorDid: rawInvitation.inviter_did,
        repo: rawInvitation.repo,
        memberDid: inviteeSession.did,
        role: rawInvitation.role,
      }),
      signal: expect.any(AbortSignal),
    }));
    expect(supabaseRpc).toHaveBeenCalledOnce();
    expect(supabaseRpc).toHaveBeenCalledWith("notification_invitation_close", {
      p_invitation_id: invitationId,
      p_status: "accepted",
      p_accepted_by_did: inviteeSession.did,
      p_accepted_by_email: inviteeSession.email,
    });
    expect(invitation).toMatchObject({ status: "accepted" });
  });

  it("leaves the invitation pending when member creation fails", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "CGS rejected the membership mutation",
      code: "membership_rejected",
    }), {
      status: 502,
      headers: { "content-type": "application/json" },
    })));
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "internal-secret");

    await expect(acceptGroupInvitation({ invitationId, session: inviteeSession }))
      .rejects.toMatchObject({ status: 502 });

    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("accepts a retry when auth confirms the membership already exists", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    supabaseRpc.mockResolvedValueOnce({
      invitation: {
        ...rawInvitation,
        status: "accepted",
        accepted_at: "2026-08-06T01:05:00.000Z",
        accepted_by_did: inviteeSession.did,
        accepted_by_email: inviteeSession.email,
      },
      notification: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      memberDid: inviteeSession.did,
      role: "member",
      alreadyMember: true,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "internal-secret");

    const invitation = await acceptGroupInvitation({ invitationId, session: inviteeSession });

    expect(invitation).toMatchObject({ status: "accepted" });
    expect(supabaseRpc).toHaveBeenCalledOnce();
  });

  it.each([
    [{ ok: true }, "missing result fields"],
    [{ ok: true, memberDid: "did:plc:other", role: "member", alreadyMember: false }, "wrong member"],
    [{ ok: true, memberDid: inviteeSession.did, role: "admin", alreadyMember: false }, "wrong role"],
    [{ ok: true, memberDid: inviteeSession.did, role: "member", alreadyMember: "false" }, "non-boolean membership state"],
  ])("does not accept when a 2xx auth response has %s", async (payload, _reason) => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "internal-secret");

    await expect(acceptGroupInvitation({ invitationId, session: inviteeSession }))
      .rejects.toMatchObject({ status: 503, code: "membership_outcome_unknown" });

    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("returns a stable translated error code when finalization fails after member creation", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    supabaseRpc.mockRejectedValueOnce(new Error("database unavailable private details"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      memberDid: inviteeSession.did,
      role: "member",
      alreadyMember: false,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "internal-secret");

    await expect(acceptGroupInvitation({ invitationId, session: inviteeSession }))
      .rejects.toMatchObject({ status: 502, code: "invitation_acceptance_incomplete" });
  });

  it("leaves the invitation pending when the app loses the auth response", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "internal-secret");

    await expect(acceptGroupInvitation({ invitationId, session: inviteeSession }))
      .rejects.toMatchObject({ status: 503, code: "membership_outcome_unknown" });

    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("leaves the invitation pending when auth cannot determine whether CGS committed", async () => {
    supabaseSelect.mockResolvedValueOnce([rawInvitation]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Could not confirm whether the member was added. Retry the same invitation.",
      code: "membership_outcome_unknown",
    }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })));
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "internal-secret");

    await expect(acceptGroupInvitation({ invitationId, session: inviteeSession }))
      .rejects.toMatchObject({ status: 503, code: "membership_outcome_unknown" });

    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("recovers an already accepted invitation without adding the member again", async () => {
    supabaseSelect.mockResolvedValueOnce([{
      ...rawInvitation,
      status: "accepted",
      accepted_at: "2026-08-06T01:05:00.000Z",
      accepted_by_did: inviteeSession.did,
      accepted_by_email: inviteeSession.email,
    }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const invitation = await acceptGroupInvitation({ invitationId, session: inviteeSession });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabaseRpc).not.toHaveBeenCalled();
    expect(invitation).toMatchObject({ status: "accepted" });
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
