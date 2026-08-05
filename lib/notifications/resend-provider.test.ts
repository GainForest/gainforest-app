import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ResendEmailProvider } from "./resend-provider";
import type { FrozenEmailRequest } from "./types";

const request: FrozenEmailRequest = {
  from: "GainForest <noreply@gainforest.id>",
  to: "member@example.com",
  subject: "Welcome",
  html: "<p>Welcome</p>",
  text: "Welcome",
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("ResendEmailProvider", () => {
  it("sends the complete immutable payload with the frozen idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "provider-id" }, { status: 200 }));
    const provider = new ResendEmailProvider({ apiKey: "re_test" });

    await expect(provider.send(request, { timeoutMs: 8_000 })).resolves.toEqual({ kind: "sent", providerId: "provider-id" });
    expect(provider.timeoutMs).toBe(10_000);
    expect(provider.idempotencyGuaranteeMs).toBe(23 * 60 * 60 * 1000 + 55 * 60 * 1000);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    expect(headers.get("idempotency-key")).toBe(request.idempotencyKey);
    expect(init?.body).toBe(JSON.stringify({
      from: request.from,
      to: [request.to],
      subject: request.subject,
      html: request.html,
      text: request.text,
    }));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["rate_limit_exceeded", "3", 3_000],
    ["daily_quota_exceeded", null, 24 * 60 * 60 * 1000],
  ])("durably retries the documented %s response", async (name, retryAfter, expectedDelay) => {
    fetchMock.mockResolvedValueOnce(Response.json({ name, message: "private provider text" }, {
      status: 429,
      headers: retryAfter ? { "retry-after": retryAfter } : undefined,
    }));
    const provider = new ResendEmailProvider({ apiKey: "re_test" });
    await expect(provider.send(request, { timeoutMs: 8_000 })).resolves.toEqual({
      kind: "transient",
      errorCode: "provider_rate_limited",
      retryAfterMs: expectedDelay,
    });
  });

  it.each(["application_error", "internal_server_error"])("retries documented provider failure %s", async name => {
    fetchMock.mockResolvedValueOnce(Response.json({ name }, { status: 500 }));
    const provider = new ResendEmailProvider({ apiKey: "re_test" });
    await expect(provider.send(request, { timeoutMs: 8_000 })).resolves.toEqual({
      kind: "transient",
      errorCode: "provider_5xx",
    });
  });

  it.each([
    [429, "monthly_quota_exceeded", "provider_rejected"],
    [400, "validation_error", "provider_rejected"],
    [409, "invalid_idempotent_request", "notification_invalid"],
  ])("terminalizes authoritative %s %s responses", async (status, name, errorCode) => {
    fetchMock.mockResolvedValueOnce(Response.json({ name }, { status }));
    const provider = new ResendEmailProvider({ apiKey: "re_test" });
    await expect(provider.send(request, { timeoutMs: 8_000 })).resolves.toEqual({ kind: "permanent", errorCode });
  });

  it.each([
    [409, "concurrent_idempotent_requests"],
    [503, "unknown_server_error"],
    [200, "missing_success_id"],
  ])("treats non-authoritative %s %s responses as uncertain", async (status, name) => {
    fetchMock.mockResolvedValueOnce(Response.json({ name }, { status }));
    const provider = new ResendEmailProvider({ apiKey: "re_test" });
    await expect(provider.send(request, { timeoutMs: 8_000 })).resolves.toEqual({ kind: "uncertain", errorCode: "provider_timeout" });
  });

  it("treats transport failures as uncertain without reflecting their details", async () => {
    const secret = "member@example.com upstream-secret";
    fetchMock.mockRejectedValueOnce(new Error(secret));
    const provider = new ResendEmailProvider({ apiKey: "re_test" });
    const result = await provider.send(request, { timeoutMs: 8_000 });
    expect(result).toEqual({ kind: "uncertain", errorCode: "provider_timeout" });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each([
    [{ apiKey: "" }, "API key"],
    [{ apiKey: "re_test", timeoutMs: 999 }, "timeout"],
  ])("rejects invalid construction before a provider request", (options, message) => {
    expect(() => new ResendEmailProvider(options)).toThrow(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
