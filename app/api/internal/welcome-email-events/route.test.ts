import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

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
  });

  afterEach(() => {
    process.env.WELCOME_EMAIL_WEBHOOK_SECRET = originalSecret;
  });

  it("ignores legacy signup events because first app use owns the welcome email", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "user.signup.completed",
      eventId: "signup.completed.v1:did:plc:user",
      user: { did: "did:plc:user", email: "member@example.com" },
    }, secret));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      reason: "signup_welcome_uses_first_app_session",
    });
  });

  it("ignores legacy membership events because invitation acceptance owns joined email", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "organization.membership.joined",
      eventId: "organization.membershipJoined.v1:creator",
      user: { did: "did:plc:creator", email: "creator@example.com" },
      organization: { did: "did:plc:org" },
    }, secret));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      reason: "membership_welcome_uses_invitation_acceptance",
    });
  });

  it("rejects unsupported event types", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest({
      type: "organization.membership.accepted",
      eventId: "old-event:test",
      user: { did: "did:plc:user", email: "member@example.com" },
      organization: { did: "did:plc:org" },
    }, secret));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid welcome email event payload." });
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
  });

  it("rejects an oversized streamed body before signature verification", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRawRequest("x".repeat(64 * 1024 + 1), secret, { "content-length": "1" }));
    expect(response.status).toBe(413);
  });
});
