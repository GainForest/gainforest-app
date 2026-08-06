import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchCgsMembersWithCookie, getCertifiedProfileCard, supabaseRpc, supabaseSelect } = vi.hoisted(() => ({
  fetchCgsMembersWithCookie: vi.fn(),
  getCertifiedProfileCard: vi.fn(),
  supabaseRpc: vi.fn(),
  supabaseSelect: vi.fn(),
}));

vi.mock("@/app/_lib/cgs-server", () => ({ fetchCgsMembersWithCookie }));
vi.mock("@/app/account/_lib/account-route", () => ({
  accountPath: (identifier: string) => `/account/${identifier}`,
  getCertifiedProfileCard,
}));
vi.mock("@/lib/supabase/rest", () => ({
  supabaseFilterValue: encodeURIComponent,
  supabaseRpc,
  supabaseSelect,
}));

import { createGroupInvitation, GroupInvitationError, retryGroupInvitation } from "./cgs-invitations";

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

beforeEach(() => {
  fetchCgsMembersWithCookie.mockReset();
  getCertifiedProfileCard.mockReset();
  supabaseRpc.mockReset();
  supabaseSelect.mockReset();
  fetchCgsMembersWithCookie.mockResolvedValue({ members: [{ did: session.did, role: "owner" }] });
  getCertifiedProfileCard.mockImplementation(async (did: string) => did === "did:plc:forest"
    ? { displayName: "Forest Circle", handle: "forest.example.com", avatarUrl: null }
    : { displayName: "Forest Owner", handle: "owner.example.com", avatarUrl: null });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(invitationId);
});

afterEach(() => vi.restoreAllMocks());

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
      origin: "https://example.test",
      acceptLanguage: "pt-BR",
      deliveryMode: "capture",
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
      p_delivery_mode: "capture",
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("uses the localized generic inviter copy when the inviter profile is unavailable", async () => {
    getCertifiedProfileCard.mockImplementation(async (did: string) => did === "did:plc:forest"
      ? { displayName: "Forest Circle", handle: "forest.example.com", avatarUrl: null }
      : { displayName: null, handle: null, avatarUrl: null });
    supabaseRpc.mockResolvedValue({ invitation: rawInvitation, notification: null });

    await createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "member", session,
      cookie: "session=cookie", origin: "https://example.test", acceptLanguage: "es", deliveryMode: null,
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
      cookie: "session=cookie", origin: "https://example.test", acceptLanguage: null, deliveryMode: null,
    });
    expect(invitation.notification).toBeNull();
    expect(supabaseRpc).toHaveBeenCalledWith("notification_invitation_create", expect.objectContaining({ p_delivery_mode: null }));
  });

  it("enforces current organization role before database mutation", async () => {
    fetchCgsMembersWithCookie.mockResolvedValue({ members: [{ did: session.did, role: "member" }] });
    await expect(createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "member", session,
      cookie: "session=cookie", origin: "https://example.test", acceptLanguage: null, deliveryMode: "capture",
    })).rejects.toMatchObject({ name: "GroupInvitationError", status: 403 });
    expect(supabaseRpc).not.toHaveBeenCalled();
  });

  it("maps role conflicts to actionable copy without provider details", async () => {
    supabaseRpc.mockRejectedValue(new Error("invitation_role_conflict invitee@example.com private payload"));
    const error = await createGroupInvitation({
      repo: "did:plc:forest", email: "invitee@example.com", role: "admin", session,
      cookie: "session=cookie", origin: "https://example.test", acceptLanguage: null, deliveryMode: "capture",
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(GroupInvitationError);
    expect((error as GroupInvitationError).message).toBe("Cancel the pending invitation before changing this person’s role.");
    expect((error as GroupInvitationError).code).toBe("invitation_role_conflict");
    expect(JSON.stringify(error)).not.toContain("invitee@example.com");
  });
});

describe("retryGroupInvitation", () => {
  it("checks the actor role before invoking the cooldown-protected RPC", async () => {
    supabaseSelect
      .mockResolvedValueOnce([rawInvitation])
      .mockResolvedValueOnce([{ id: "10000000-0000-4000-8000-000000000001", source_id: invitationId, status: "queued" }]);
    await expect(retryGroupInvitation({ invitationId, actorRole: "member" })).rejects.toMatchObject({ status: 403 });
    expect(supabaseRpc).not.toHaveBeenCalled();
  });
});
