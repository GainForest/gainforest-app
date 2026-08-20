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

  it("accepts legacy signup events without delivering because first app use owns the welcome email", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "signup.completed.v1:did:plc:user",
      user: {
        did: "did:plc:user",
        email: "member@example.com",
      },
    }, secret));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      reason: "signup_welcome_uses_first_app_session",
    });
    expect(getCertifiedProfileCard).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("accepts legacy membership events without delivery because invitation acceptance owns the joined email", async () => {
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      reason: "membership_welcome_uses_invitation_acceptance",
    });
    expect(getCertifiedProfileCard).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
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

  it("rejects unsigned legacy events", async () => {
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://example.test/api/internal/welcome-email-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "organization.membership.joined",
        eventId: "organization.membershipJoined.v1:unsigned",
        user: { did: "did:plc:user", email: "member@example.com" },
        organization: { did: "did:plc:org" },
      }),
    }));

    expect(response.status).toBe(401);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("rejects correctly signed legacy events with stale timestamps", async () => {
    const rawBody = JSON.stringify({
      type: "organization.membership.joined",
      eventId: "organization.membershipJoined.v1:stale",
      user: { did: "did:plc:user", email: "member@example.com" },
      organization: { did: "did:plc:org" },
    });
    const timestamp = String(Math.floor((Date.now() - 10 * 60 * 1000) / 1000));
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://example.test/api/internal/welcome-email-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gainforest-webhook-timestamp": timestamp,
        "x-gainforest-webhook-signature": `sha256=${signature}`,
      },
      body: rawBody,
    }));

    expect(response.status).toBe(401);
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

});
