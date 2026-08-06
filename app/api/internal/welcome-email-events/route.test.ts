import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NotificationRepositoryError } from "@/lib/email-notifications/repository";
import type { WelcomeNotificationInput, WelcomeNotificationOutcome } from "@/lib/email-notifications/welcome";

vi.mock("server-only", () => ({}));

const deliver = vi.fn<(_input: WelcomeNotificationInput, _deadline: Date) => Promise<WelcomeNotificationOutcome>>(async () => ({
  kind: "durable" as const,
  outboxId: "10000000-0000-4000-8000-000000000001",
  status: "sent" as const,
  duplicate: false,
  retryable: false,
}));
const defaultProfileCard = async (did: string): Promise<{ displayName: string | null; avatarUrl: string | null }> => ({
  displayName: did === "did:plc:org" ? "Resolved Org" : "Forest Member",
  avatarUrl: null,
});
const getCertifiedProfileCard = vi.fn(defaultProfileCard);

vi.mock("@/lib/email-notifications/welcome-runtime", () => ({
  createWelcomeRuntime: () => ({ deliver }),
}));

vi.mock("@/app/account/_lib/account-route", () => ({
  getCertifiedProfileCard,
}));

function signedRawRequest(rawBody: string, secret: string, headers: HeadersInit = {}): NextRequest {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return new NextRequest("https://example.test/api/internal/welcome-email-events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gainforest-webhook-timestamp": timestamp,
      "x-gainforest-webhook-signature": `sha256=${signature}`,
      ...headers,
    },
    body: rawBody,
  });
}

function signedRequest(body: unknown, secret: string): NextRequest {
  return signedRawRequest(JSON.stringify(body), secret);
}

describe("welcome email event webhook", () => {
  const secret = "test-webhook-secret-123";
  const originalSecret = process.env.WELCOME_EMAIL_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.WELCOME_EMAIL_WEBHOOK_SECRET = secret;
    deliver.mockReset();
    deliver.mockResolvedValue({
      kind: "durable",
      outboxId: "10000000-0000-4000-8000-000000000001",
      status: "sent",
      duplicate: false,
      retryable: false,
    });
    getCertifiedProfileCard.mockReset();
    getCertifiedProfileCard.mockImplementation(defaultProfileCard);
  });

  afterEach(() => {
    process.env.WELCOME_EMAIL_WEBHOOK_SECRET = originalSecret;
  });

  it("accepts organization.membership.joined and durably delegates the stable auth event", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "organization.membership.joined",
      eventId: "organization.membershipJoined.v1:test",
      createdAt: new Date().toISOString(),
      locale: "en",
      user: {
        did: "did:plc:user",
        handle: "user.example.com",
        email: "member@example.com",
      },
      organization: {
        did: "did:plc:org",
      },
    }, secret));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      notification: {
        kind: "durable",
        outboxId: "10000000-0000-4000-8000-000000000001",
        status: "sent",
        duplicate: false,
        retryable: false,
      },
    });
    expect(response.status).toBe(200);
    expect(getCertifiedProfileCard).toHaveBeenCalledWith("did:plc:user");
    expect(getCertifiedProfileCard).toHaveBeenCalledWith("did:plc:org");
    expect(deliver).toHaveBeenCalledWith({
      type: "membership_joined",
      authEventId: "organization.membershipJoined.v1:test",
      userDid: "did:plc:user",
      email: "member@example.com",
      name: "Forest Member",
      locale: "en",
      organizationDid: "did:plc:org",
      organizationName: "Resolved Org",
      createdAt: expect.any(String),
    }, expect.any(Date));
  });

  it("omits the greeting instead of deriving a name from the handle", async () => {
    getCertifiedProfileCard.mockResolvedValueOnce({ displayName: null, avatarUrl: null });
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:test",
      createdAt: new Date().toISOString(),
      locale: "en",
      user: {
        did: "did:plc:user",
        handle: "forest-steward.example.com",
        email: "member@example.com",
      },
    }, secret));

    expect(response.status).toBe(200);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ name: undefined }), expect.any(Date));
  });

  it("does not use an explicit user name that is actually the handle", async () => {
    getCertifiedProfileCard.mockResolvedValueOnce({ displayName: null, avatarUrl: null });
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:handle-name-test",
      createdAt: new Date().toISOString(),
      locale: "en",
      user: {
        did: "did:plc:user",
        handle: "forest-steward.example.com",
        name: "forest-steward.example.com",
        email: "member@example.com",
      },
    }, secret));

    expect(response.status).toBe(200);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ name: undefined }), expect.any(Date));
  });

  it("does not use an email address as a display name when casing differs", async () => {
    getCertifiedProfileCard.mockResolvedValueOnce({ displayName: null, avatarUrl: null });
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:email-name-test",
      user: {
        did: "did:plc:user",
        name: "Member@Example.com",
        email: "member@example.com",
      },
    }, secret));

    expect(response.status).toBe(200);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ name: undefined }), expect.any(Date));
  });

  it("bounds profile enrichment so the event becomes durable when profile services stall", async () => {
    vi.useFakeTimers();
    try {
      getCertifiedProfileCard.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({ displayName: "Too Late", avatarUrl: null }), 5_000);
      }));
      const { POST } = await import("./route");
      const responseOrTimeout = Promise.race([
        POST(signedRequest({
          type: "organization.membership.joined",
          eventId: "organization.membershipJoined.v1:slow-profile",
          user: { did: "did:plc:user", email: "member@example.com" },
          organization: { did: "did:plc:org" },
        }, secret)).then(response => ({ kind: "response" as const, response })),
        new Promise<{ kind: "timeout" }>(resolve => setTimeout(() => resolve({ kind: "timeout" }), 2_100)),
      ]);

      await vi.advanceTimersByTimeAsync(2_100);
      const result = await responseOrTimeout;
      expect(result.kind).toBe("response");
      if (result.kind === "response") expect(result.response.status).toBe(200);
      expect(deliver).toHaveBeenCalledWith(expect.objectContaining({
        name: undefined,
        organizationName: undefined,
      }), expect.any(Date));
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects unsupported organization event types", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "organization.membership.accepted",
      eventId: "old-event:test",
      user: {
        did: "did:plc:user",
        email: "member@example.com",
      },
      organization: {
        did: "did:plc:org",
      },
    }, secret));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid welcome email event payload." });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("rejects a valid digest with trailing non-hex signature data", async () => {
    const request = signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:malformed-signature",
      user: { did: "did:plc:user", email: "member@example.com" },
    }, secret);
    request.headers.set(
      "x-gainforest-webhook-signature",
      `${request.headers.get("x-gainforest-webhook-signature")}garbage`,
    );
    const { POST } = await import("./route");
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body before signature verification or delivery", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRawRequest("x".repeat(64 * 1024 + 1), secret, { "content-length": "1" }));
    expect(response.status).toBe(413);
    expect(deliver).not.toHaveBeenCalled();
    expect(getCertifiedProfileCard).not.toHaveBeenCalled();
  });

  it("returns success when delivery is durably queued for retry", async () => {
    deliver.mockResolvedValueOnce({
      kind: "durable",
      outboxId: "10000000-0000-4000-8000-000000000001",
      status: "queued",
      duplicate: false,
      retryable: true,
      errorCode: "provider_rate_limited",
    });
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:queued",
      user: { did: "did:plc:user", email: "member@example.com" },
    }, secret));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      notification: { status: "queued", retryable: true, errorCode: "provider_rate_limited" },
    });
  });

  it("returns a non-retryable conflict when an event ID changes identity", async () => {
    deliver.mockRejectedValueOnce(new NotificationRepositoryError("idempotency_conflict"));
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:conflict",
      user: { did: "did:plc:user", email: "member@example.com" },
    }, secret));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Welcome email event ID conflicts with a previously accepted event.",
    });
  });

  it("redacts runtime failures and returns a retryable webhook response", async () => {
    deliver.mockRejectedValueOnce(new Error("member@example.com provider-secret"));
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:error",
      user: { did: "did:plc:user", email: "member@example.com" },
    }, secret));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("Welcome email event could not be queued");
    expect(body).not.toContain("member@example.com");
    expect(body).not.toContain("provider-secret");
  });
});
