import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { WelcomeNotificationInput, WelcomeNotificationOutcome } from "@/lib/email-notifications/welcome";

vi.mock("server-only", () => ({}));

const deliver = vi.fn<(_input: WelcomeNotificationInput, _deadline: Date) => Promise<WelcomeNotificationOutcome>>(async () => ({
  kind: "durable" as const,
  outboxId: "10000000-0000-4000-8000-000000000001",
  status: "sent" as const,
  duplicate: false,
  retryable: false,
}));
const getCertifiedProfileCard = vi.fn(async (did: string): Promise<{ displayName: string | null; avatarUrl: string | null }> => ({
  displayName: did === "did:plc:org" ? "Resolved Org" : "Forest Member",
  avatarUrl: null,
}));

vi.mock("@/lib/email-notifications/welcome-runtime", () => ({
  createWelcomeRuntime: () => ({ deliver }),
}));

vi.mock("@/app/account/_lib/account-route", () => ({
  getCertifiedProfileCard,
}));

function signedRequest(body: unknown, secret: string): NextRequest {
  const rawBody = JSON.stringify(body);
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
    },
    body: rawBody,
  });
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
    getCertifiedProfileCard.mockClear();
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

  it("reserves 55 seconds for immediate welcome delivery", async () => {
    const { POST, maxDuration } = await import("./route");
    const before = Date.now();
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "user.signup.completed.v1:delivery-budget",
      user: {
        did: "did:plc:user",
        email: "member@example.com",
      },
    }, secret));
    const after = Date.now();

    expect(response.status).toBe(200);
    const invocationDeadline = deliver.mock.calls[0]?.[1];
    expect(invocationDeadline).toBeInstanceOf(Date);
    expect(invocationDeadline!.getTime()).toBeGreaterThanOrEqual(before + 55_000);
    expect(invocationDeadline!.getTime()).toBeLessThanOrEqual(after + 55_000);
    expect(maxDuration).toBe(60);
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
