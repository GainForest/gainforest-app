import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAuthSession, getGroupInvitation } = vi.hoisted(() => ({
  fetchAuthSession: vi.fn(),
  getGroupInvitation: vi.fn(),
}));

vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/cgs-invitations", () => ({ getGroupInvitation }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import InvitePage from "./page";

const acceptedInvitation = {
  id: "81000000-0000-4000-8000-000000000001",
  repo: "did:plc:forest",
  email: "invitee@example.com",
  role: "member" as const,
  status: "accepted" as const,
  inviterDid: "did:plc:owner",
  inviterHandle: "owner.example.com",
  inviterEmail: "owner@example.com",
  groupName: "Forest Circle",
  groupHandle: "forest.example.com",
  createdAt: "2026-08-18T12:00:00.000Z",
  expiresAt: "2026-08-25T12:00:00.000Z",
  acceptedAt: "2026-08-18T12:01:00.000Z",
  acceptedByDid: "did:plc:invitee",
  acceptedByEmail: "invitee@example.com",
  emailSentAt: null,
  lastEmailError: null,
  notification: null,
};

beforeEach(() => {
  fetchAuthSession.mockReset();
  fetchAuthSession.mockResolvedValue({ isLoggedIn: false });
  getGroupInvitation.mockReset();
  getGroupInvitation.mockResolvedValue(acceptedInvitation);
});

describe("InvitePage", () => {
  it("renders an accepted invitation without loading the auth session", async () => {
    const page = await InvitePage({
      params: Promise.resolve({ invitationId: acceptedInvitation.id }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("alreadyAcceptedTitle");
    expect(fetchAuthSession).not.toHaveBeenCalled();
  });
});
