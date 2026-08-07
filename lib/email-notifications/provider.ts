import "server-only";

import { EmailSendError, sendResendEmail } from "@/lib/email/resend";
import { readNotificationConfig } from "./config";
import type { EmailProvider, FrozenEmailRequest, ProviderOutcome } from "./types";

const RESEND_TIMEOUT_MS = 10_000;
const RESEND_IDEMPOTENCY_GUARANTEE_MS = 24 * 60 * 60 * 1000;

type Environment = Readonly<Record<string, string | undefined>>;
type ResendTransportInput = FrozenEmailRequest & { readonly timeoutMs: number; readonly apiKey?: string };
type ResendTransport = (input: ResendTransportInput) => Promise<{ readonly id: string | null }>;

export class ResendEmailProvider implements EmailProvider {
  readonly timeoutMs = RESEND_TIMEOUT_MS;
  readonly idempotencyGuaranteeMs = RESEND_IDEMPOTENCY_GUARANTEE_MS;

  constructor(private readonly transport: ResendTransport = sendResendEmail) {}

  async send(request: FrozenEmailRequest, options: { readonly timeoutMs: number }): Promise<ProviderOutcome> {
    try {
      const result = await this.transport({ ...request, timeoutMs: options.timeoutMs });
      if (!result.id) throw new Error("Resend accepted the email without returning its provider ID.");
      return { kind: "sent", providerId: result.id };
    } catch (error) {
      if (!(error instanceof EmailSendError)) throw error;
      if (error.status === 429) {
        return {
          kind: "transient",
          errorCode: "provider_rate_limited",
          ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
        };
      }
      if (error.status === 408) {
        return { kind: "transient", errorCode: "provider_timeout" };
      }
      if (error.status >= 500 || (error.status === 409 && error.code === "concurrent_idempotent_requests")) {
        return { kind: "transient", errorCode: "provider_5xx" };
      }
      if (error.status === 400 || error.status === 409 || error.status === 422) {
        return { kind: "permanent", errorCode: "notification_invalid" };
      }
      return { kind: "permanent", errorCode: "provider_rejected" };
    }
  }
}

function testApiUrl(environment: Environment): string | undefined {
  const configured = environment.NOTIFICATION_TEST_RESEND_API_URL?.trim();
  if (!configured) return undefined;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(
      "NOTIFICATION_TEST_RESEND_API_URL must be a valid loopback HTTP URL and is unavailable in production.",
    );
  }
  if (environment.NODE_ENV === "production" || url.protocol !== "http:"
    || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
    throw new Error(
      "NOTIFICATION_TEST_RESEND_API_URL must be a valid loopback HTTP URL and is unavailable in production.",
    );
  }
  return url.toString();
}

export function createEmailProvider(environment: Environment = process.env): EmailProvider | null {
  if (readNotificationConfig(environment).emailDisabled) return null;
  const apiKey = environment.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Email delivery is enabled but RESEND_API_KEY is missing. Set RESEND_API_KEY or set EMAIL_DISABLED=true.",
    );
  }
  const apiUrl = testApiUrl(environment);
  return new ResendEmailProvider(input => sendResendEmail({ ...input, apiKey, apiUrl }));
}
