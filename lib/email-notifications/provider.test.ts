import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EmailSendError } from "@/lib/email/resend";
import { createEmailProvider, ResendEmailProvider } from "./provider";
import type { FrozenEmailRequest } from "./types";

const request: FrozenEmailRequest = {
  from: "GainForest <noreply@gainforest.id>",
  to: "person@example.com",
  subject: "Subject",
  html: "<p>Body</p>",
  text: "Body",
  idempotencyKey: "event-1",
};

describe("ResendEmailProvider", () => {
  it("sends the exact frozen request and exposes Resend's 24-hour idempotency guarantee", async () => {
    const send = vi.fn(async () => ({ id: "resend-email-1" }));
    const provider = new ResendEmailProvider(send);

    await expect(provider.send(request, { timeoutMs: 7_500 })).resolves.toEqual({
      kind: "sent",
      providerId: "resend-email-1",
    });
    expect(provider.idempotencyGuaranteeMs).toBe(24 * 60 * 60 * 1000);
    expect(send).toHaveBeenCalledWith({ ...request, timeoutMs: 7_500 });
  });

  it.each([
    [408, { kind: "transient", errorCode: "provider_timeout" }],
    [429, { kind: "transient", errorCode: "provider_rate_limited" }],
    [503, { kind: "transient", errorCode: "provider_5xx" }],
    [400, { kind: "permanent", errorCode: "notification_invalid" }],
    [401, { kind: "permanent", errorCode: "provider_rejected" }],
  ] as const)("maps Resend HTTP %i into the worker outcome contract", async (status, expected) => {
    const provider = new ResendEmailProvider(async () => {
      throw new EmailSendError("Resend rejected the request.", status);
    });

    await expect(provider.send(request, { timeoutMs: 7_500 })).resolves.toEqual(expected);
  });

  it.each([
    ["concurrent_idempotent_requests", { kind: "transient", errorCode: "provider_5xx" }],
    ["invalid_idempotent_request", { kind: "permanent", errorCode: "notification_invalid" }],
  ] as const)("handles Resend idempotency error %s", async (code, expected) => {
    const provider = new ResendEmailProvider(async () => {
      throw new EmailSendError("Resend idempotency response.", 409, code);
    });

    await expect(provider.send(request, { timeoutMs: 7_500 })).resolves.toEqual(expected);
  });

  it("preserves Resend Retry-After guidance for durable rate-limit backoff", async () => {
    const provider = new ResendEmailProvider(async () => {
      throw new EmailSendError("Resend rate limit.", 429, "rate_limit_exceeded", 30_000);
    });

    await expect(provider.send(request, { timeoutMs: 7_500 })).resolves.toEqual({
      kind: "transient",
      errorCode: "provider_rate_limited",
      retryAfterMs: 30_000,
    });
  });

  it("propagates transport failures so the worker preserves an ambiguous outcome", async () => {
    const provider = new ResendEmailProvider(async () => {
      throw new Error("socket closed without a response");
    });

    await expect(provider.send(request, { timeoutMs: 7_500 }))
      .rejects.toThrow("socket closed without a response");
  });
});

describe("createEmailProvider", () => {
  it("does not require Resend configuration when email is disabled", () => {
    expect(createEmailProvider({ EMAIL_DISABLED: "true" })).toBeNull();
  });

  it("creates Resend delivery when the required API key is configured", () => {
    expect(createEmailProvider({ RESEND_API_KEY: " re_test " })).toBeInstanceOf(ResendEmailProvider);
  });

  it.each([
    ["https://api.resend.com/emails", "test"],
    ["http://127.0.0.1:3056/emails", "production"],
    ["not-a-url", "test"],
  ])("rejects unsafe test provider URL %s", (url, nodeEnv) => {
    expect(() => createEmailProvider({
      RESEND_API_KEY: "re_test",
      NOTIFICATION_TEST_RESEND_API_URL: url,
      NODE_ENV: nodeEnv,
    })).toThrow("must be a valid loopback HTTP URL and is unavailable in production");
  });

  it("accepts a loopback provider URL outside production", () => {
    expect(createEmailProvider({
      RESEND_API_KEY: "re_test",
      NOTIFICATION_TEST_RESEND_API_URL: "http://127.0.0.1:3056/emails",
      NODE_ENV: "test",
    })).toBeInstanceOf(ResendEmailProvider);
  });

  it("fails before processing when enabled email has no Resend API key", () => {
    expect(() => createEmailProvider({})).toThrow(
      "Email delivery is enabled but RESEND_API_KEY is missing. Set RESEND_API_KEY or set EMAIL_DISABLED=true.",
    );
  });
});
