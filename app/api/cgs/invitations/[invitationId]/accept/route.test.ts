import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  acceptGroupInvitation,
  afterCallbacks,
  deliver,
  fetchAuthSession,
  scheduleOrganizationRosterSync,
} = vi.hoisted(() => ({
  acceptGroupInvitation: vi.fn(),
  afterCallbacks: [] as Array<() => Promise<void>>,
  deliver: vi.fn(),
  fetchAuthSession: vi.fn(),
  scheduleOrganizationRosterSync: vi.fn(),
}));

class GroupInvitationError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
    this.name = "GroupInvitationError";
  }
}

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => afterCallbacks.push(callback),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({
    cookie: "session=cookie; bumicerts-language=pt",
    "x-bumicerts-locale": "es",
    "accept-language": "sw;q=0.9,en;q=0.8",
  }),
}));
vi.mock("@/app/_lib/auth-server", () => ({ fetchAuthSession }));
vi.mock("@/app/_lib/cgs-invitations", () => ({ acceptGroupInvitation, GroupInvitationError }));
vi.mock("@/app/_lib/organization-memberships", () => ({ scheduleOrganizationRosterSync }));
vi.mock("@/lib/email-notifications/welcome-runtime", () => ({
  createWelcomeRuntime: () => ({ deliver }),
}));

const invitationId = "81000000-0000-4000-8000-000000000001";
const session = {
  isLoggedIn: true,
  did: "did:plc:invitee",
  handle: "invitee.gainforest.app",
  email: "invitee@example.com",
};
const acceptedInvitation = {
  id: invitationId,
  repo: "did:plc:forest",
  email: "invitee@example.com",
  role: "member",
  status: "accepted",
  inviterDid: "did:plc:owner",
  inviterHandle: "owner.example.com",
  inviterEmail: "owner@example.com",
  groupName: "Forest Circle",
  groupHandle: "forest.example.com",
  createdAt: "2026-08-18T12:00:00.000Z",
  expiresAt: "2026-08-25T12:00:00.000Z",
  acceptedAt: "2026-08-18T12:01:00.000Z",
  acceptedByDid: session.did,
  acceptedByEmail: session.email,
  emailSentAt: null,
  lastEmailError: null,
  notification: null,
};

function acceptanceRequest({
  languageCookie = "pt",
  requestLocale = "es",
  acceptLanguage = "sw;q=0.9,en;q=0.8",
}: {
  languageCookie?: string | null;
  requestLocale?: string | null;
  acceptLanguage?: string | null;
} = {}): Request {
  const cookie = ["session=cookie", languageCookie ? `bumicerts-language=${languageCookie}` : null]
    .filter((value): value is string => Boolean(value))
    .join("; ");
  const headers = new Headers({ cookie });
  if (requestLocale) headers.set("x-bumicerts-locale", requestLocale);
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);

  return new Request(`https://gainforest.app/api/cgs/invitations/${invitationId}/accept`, {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  afterCallbacks.length = 0;
  fetchAuthSession.mockReset();
  fetchAuthSession.mockResolvedValue(session);
  acceptGroupInvitation.mockReset();
  acceptGroupInvitation.mockResolvedValue(acceptedInvitation);
  scheduleOrganizationRosterSync.mockReset();
  deliver.mockReset();
  deliver.mockResolvedValue({
    kind: "durable",
    outboxId: "10000000-0000-4000-8000-000000000001",
    status: "sent",
    duplicate: false,
    retryable: false,
  });
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/cgs/invitations/[invitationId]/accept", () => {
  it("returns acceptance before the joined-email callback runs and preserves the roster refresh", async () => {
    const { POST } = await import("./route");
    const response = await POST(acceptanceRequest(), {
      params: Promise.resolve({ invitationId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ invitation: acceptedInvitation });
    expect(deliver).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    expect(acceptGroupInvitation).toHaveBeenCalledWith({
      invitationId,
      session,
      cookie: "session=cookie; bumicerts-language=pt",
    });
    expect(scheduleOrganizationRosterSync).toHaveBeenCalledWith(
      acceptedInvitation.repo,
      "session=cookie; bumicerts-language=pt",
    );
  });

  it("uses the invitation identity and request locale when the background callback runs", async () => {
    const { POST } = await import("./route");
    const before = Date.now();
    const response = await POST(acceptanceRequest(), {
      params: Promise.resolve({ invitationId }),
    });
    const after = Date.now();

    expect(response.status).toBe(200);
    await afterCallbacks[0]!();

    expect(deliver).toHaveBeenCalledWith({
      type: "membership_joined",
      authEventId: `invitation.accepted.v1:${invitationId}`,
      userDid: session.did,
      email: session.email,
      createdAt: acceptedInvitation.acceptedAt,
      organizationDid: acceptedInvitation.repo,
      organizationName: acceptedInvitation.groupName,
      locale: "es",
    }, expect.any(Date));
    const deadline = deliver.mock.calls[0]?.[1] as Date;
    expect(deadline.getTime()).toBeGreaterThanOrEqual(before + 55_000);
    expect(deadline.getTime()).toBeLessThanOrEqual(after + 55_000);
  });

  it.each([
    ["the language cookie when the request locale is absent", { requestLocale: null }, "pt"],
    ["accept-language when the request locale and language cookie are absent", { requestLocale: null, languageCookie: null }, "sw"],
  ])("uses %s for the joined email", async (_source, requestOptions, locale) => {
    const { POST } = await import("./route");
    const response = await POST(acceptanceRequest(requestOptions), {
      params: Promise.resolve({ invitationId }),
    });

    expect(response.status).toBe(200);
    await afterCallbacks[0]!();
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ locale }), expect.any(Date));
  });

  it.each([
    ["sent", { kind: "durable", outboxId: "outbox-sent", status: "sent", duplicate: false, retryable: false }],
    ["queued", { kind: "durable", outboxId: "outbox-queued", status: "queued", duplicate: false, retryable: true }],
    ["disabled", { kind: "disabled" }],
  ])("keeps the accepted HTTP result when delivery finishes as %s", async (_kind, outcome) => {
    deliver.mockResolvedValueOnce(outcome);
    const { POST } = await import("./route");
    const response = await POST(acceptanceRequest(), {
      params: Promise.resolve({ invitationId }),
    });

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toEqual({ invitation: acceptedInvitation });
    await afterCallbacks[0]!();
    expect(response.status).toBe(200);
  });

  it("logs only redacted metadata when joined-email setup throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deliver.mockRejectedValueOnce(new Error("invitee@example.com provider-secret raw failure"));
    const { POST } = await import("./route");
    const response = await POST(acceptanceRequest(), {
      params: Promise.resolve({ invitationId }),
    });

    expect(response.status).toBe(200);
    await afterCallbacks[0]!();
    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledWith("[cgs-invitations] Joined email setup failed", {
      invitationId,
      reason: "Error",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("invitee@example.com");
    expect(JSON.stringify(log.mock.calls)).not.toContain("provider-secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("raw failure");
  });
});
