import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  fetchAuthSession,
  fetchCgsMemberRoleWithCookie,
  fetchCgsMembersWithCookie,
  fetchIndexedCertifiedProfileCards,
  listAcceptedGroupInvitationEmailsForRepo,
  listPendingGroupInvitationsForRepo,
} = vi.hoisted(() => ({
  fetchAuthSession: vi.fn(),
  fetchCgsMemberRoleWithCookie: vi.fn(),
  fetchCgsMembersWithCookie: vi.fn(),
  fetchIndexedCertifiedProfileCards: vi.fn(),
  listAcceptedGroupInvitationEmailsForRepo: vi.fn(),
  listPendingGroupInvitationsForRepo: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=cookie" }) }));
vi.mock("@/app/_lib/auth", () => ({ getAuthForwardCookie: (value: string | null) => value }));
vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/cgs-server", () => ({ fetchCgsMemberRoleWithCookie, fetchCgsMembersWithCookie }));
vi.mock("@/app/_lib/indexer", () => ({ fetchIndexedCertifiedProfileCards }));
vi.mock("@/app/_lib/bluesky-profile", () => ({ fetchBlueskyProfileCard: vi.fn() }));
vi.mock("@/app/_lib/data-council", () => ({ loadFastDataCouncilState: vi.fn() }));
vi.mock("@/app/_lib/cgs-invitations", () => ({
  listAcceptedGroupInvitationEmailsForRepo,
  listPendingGroupInvitationsForRepo,
}));
vi.mock("@/app/_lib/did-identity", () => ({
  isEpdsIdentity: () => false,
  resolveDidIdentity: vi.fn(),
}));

const invitation = {
  id: "81000000-0000-4000-8000-000000000001",
  email: "invitee@example.com",
  role: "member",
  status: "pending",
};

beforeEach(() => {
  fetchAuthSession.mockReset();
  fetchAuthSession.mockResolvedValue({ isLoggedIn: true, did: "did:plc:admin", handle: "admin.example.com" });
  fetchCgsMembersWithCookie.mockReset();
  fetchCgsMembersWithCookie.mockResolvedValue({ members: [], cursor: "page-2" });
  fetchCgsMemberRoleWithCookie.mockReset();
  fetchCgsMemberRoleWithCookie.mockResolvedValue("admin");
  fetchIndexedCertifiedProfileCards.mockReset();
  fetchIndexedCertifiedProfileCards.mockResolvedValue(new Map());
  listAcceptedGroupInvitationEmailsForRepo.mockReset();
  listAcceptedGroupInvitationEmailsForRepo.mockResolvedValue(new Map());
  listPendingGroupInvitationsForRepo.mockReset();
  listPendingGroupInvitationsForRepo.mockResolvedValue([invitation]);
});

describe("GET /api/manage/group-settings", () => {
  it("includes pending invitations for an authorized manager beyond the first member page", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/api/manage/group-settings?repo=did:plc:forest"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ invitations: [invitation] });
    expect(fetchCgsMemberRoleWithCookie).toHaveBeenCalledWith({
      repo: "did:plc:forest",
      cookie: "session=cookie",
      did: "did:plc:admin",
    });
  });
});
