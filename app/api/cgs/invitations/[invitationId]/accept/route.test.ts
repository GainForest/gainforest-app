import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { acceptGroupInvitation, fetchAuthSession, scheduleOrganizationRosterSync } = vi.hoisted(() => ({
  acceptGroupInvitation: vi.fn(),
  fetchAuthSession: vi.fn(),
  scheduleOrganizationRosterSync: vi.fn(),
}));

class GroupInvitationError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
    this.name = "GroupInvitationError";
  }
}

vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/cgs-invitations", () => ({ acceptGroupInvitation, GroupInvitationError }));
vi.mock("@/app/_lib/organization-memberships", () => ({ scheduleOrganizationRosterSync }));

beforeEach(() => {
  fetchAuthSession.mockReset();
  fetchAuthSession.mockResolvedValue({
    isLoggedIn: true,
    did: "did:plc:invitee",
    handle: "invitee.gainforest.app",
    email: "invitee@example.com",
  });
  acceptGroupInvitation.mockReset();
  acceptGroupInvitation.mockResolvedValue({
    id: "81000000-0000-4000-8000-000000000001",
    repo: "did:plc:forest",
    status: "accepted",
  });
  scheduleOrganizationRosterSync.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/cgs/invitations/[invitationId]/accept", () => {
  it("forwards the request cookie and schedules a forced roster refresh", async () => {
    const { POST } = await import("./route");
    const request = new Request("https://gainforest.app/api/cgs/invitations/invite-1/accept", {
      method: "POST",
      headers: { cookie: "session=cookie" },
    });

    const response = await POST(request, { params: Promise.resolve({ invitationId: "invite-1" }) });

    expect(response.status).toBe(200);
    expect(acceptGroupInvitation).toHaveBeenCalledWith({
      invitationId: "invite-1",
      session: expect.objectContaining({ did: "did:plc:invitee" }),
      cookie: "session=cookie",
    });
    expect(scheduleOrganizationRosterSync).toHaveBeenCalledWith("did:plc:forest", "session=cookie");
  });
});
