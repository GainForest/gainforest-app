import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendResendEmail = vi.fn(async () => ({ id: "resend-test-id" }));
const getCertifiedProfileCard = vi.fn(async () => ({ displayName: "Resolved Org", avatarUrl: null }));

vi.mock("@/lib/email/resend", () => ({
  EmailSendError: class EmailSendError extends Error {
    status: number;
    constructor(message: string, status = 502) {
      super(message);
      this.name = "EmailSendError";
      this.status = status;
    }
  },
  sendResendEmail,
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
  const originalResendKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.WELCOME_EMAIL_WEBHOOK_SECRET = secret;
    process.env.RESEND_API_KEY = "re_test";
    sendResendEmail.mockClear();
    getCertifiedProfileCard.mockClear();
  });

  afterEach(() => {
    process.env.WELCOME_EMAIL_WEBHOOK_SECRET = originalSecret;
    process.env.RESEND_API_KEY = originalResendKey;
  });

  it("accepts organization.membership.joined and uses eventId as the Resend idempotency key", async () => {
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

    await expect(response.json()).resolves.toEqual({ ok: true, id: "resend-test-id" });
    expect(response.status).toBe(200);
    expect(getCertifiedProfileCard).toHaveBeenCalledWith("did:plc:org");
    expect(sendResendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "member@example.com",
      idempotencyKey: "organization.membershipJoined.v1:test",
      subject: "You’ve joined Resolved Org on GainForest",
    }));
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
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
});
