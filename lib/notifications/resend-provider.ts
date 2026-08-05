import "server-only";

import type { EmailProvider, FrozenEmailRequest, ProviderOutcome } from "./types";

const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 15_000;
const RESEND_DOCUMENTED_GUARANTEE_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const DAILY_QUOTA_RETRY_MS = 24 * 60 * 60 * 1000;
const MAX_RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

interface ResendProviderOptions {
  readonly apiKey: string;
  readonly timeoutMs?: number;
}

interface ResendPayload {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly type?: unknown;
}

function errorName(payload: ResendPayload | null): string | null {
  if (typeof payload?.name === "string") return payload.name;
  if (typeof payload?.type === "string") return payload.type;
  return null;
}

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

async function boundedPayload(response: Response): Promise<ResendPayload | null> {
  const body = (await response.text()).slice(0, 16_384);
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as ResendPayload
      : null;
  } catch {
    return null;
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly timeoutMs: number;
  readonly idempotencyGuaranteeMs = RESEND_DOCUMENTED_GUARANTEE_MS - IDEMPOTENCY_SAFETY_MARGIN_MS;
  private readonly apiKey: string;

  constructor(options: ResendProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("Resend notification provider requires an API key.");
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeout) || timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) {
      throw new Error(`Resend notification provider timeout must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} milliseconds.`);
    }
    this.timeoutMs = timeout;
  }

  async send(request: FrozenEmailRequest, options: { readonly timeoutMs: number }): Promise<ProviderOutcome> {
    try {
      const response = await fetch(RESEND_EMAILS_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": request.idempotencyKey,
        },
        body: JSON.stringify({
          from: request.from,
          to: [request.to],
          subject: request.subject,
          html: request.html,
          text: request.text,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, options.timeoutMs)),
      });
      const payload = await boundedPayload(response);
      const name = errorName(payload);

      if (response.ok) {
        return typeof payload?.id === "string" && payload.id.length > 0
          ? { kind: "sent", providerId: payload.id }
          : { kind: "uncertain", errorCode: "provider_timeout" };
      }
      if (response.status === 409 && name === "concurrent_idempotent_requests") {
        return { kind: "uncertain", errorCode: "provider_timeout" };
      }
      if (response.status === 409 && name === "invalid_idempotent_request") {
        return { kind: "permanent", errorCode: "notification_invalid" };
      }
      if (response.status === 429 && name === "rate_limit_exceeded") {
        return {
          kind: "transient",
          errorCode: "provider_rate_limited",
          retryAfterMs: retryAfterMs(response) ?? 1_000,
        };
      }
      if (response.status === 429 && name === "daily_quota_exceeded") {
        return { kind: "transient", errorCode: "provider_rate_limited", retryAfterMs: DAILY_QUOTA_RETRY_MS };
      }
      if (response.status === 429 && name === "monthly_quota_exceeded") {
        return { kind: "permanent", errorCode: "provider_rejected" };
      }
      if (response.status === 500 && (name === "application_error" || name === "internal_server_error")) {
        return { kind: "transient", errorCode: "provider_5xx" };
      }
      if (response.status >= 400 && response.status < 500) {
        return { kind: "permanent", errorCode: "provider_rejected" };
      }
      return { kind: "uncertain", errorCode: "provider_timeout" };
    } catch {
      return { kind: "uncertain", errorCode: "provider_timeout" };
    }
  }
}
