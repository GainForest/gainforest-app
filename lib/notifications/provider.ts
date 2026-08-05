import "server-only";

import type { CaptureSink, DeliveryMode, EmailProvider, FrozenEmailRequest, ProviderOutcome } from "./types";

const CAPTURE_GUARANTEE_MS = 7 * 24 * 60 * 60 * 1000;

function sameRequest(left: FrozenEmailRequest, right: FrozenEmailRequest): boolean {
  return left.from === right.from
    && left.to === right.to
    && left.subject === right.subject
    && left.html === right.html
    && left.text === right.text
    && left.idempotencyKey === right.idempotencyKey;
}

export class CaptureSinkConflictError extends Error {
  constructor() {
    super("Capture idempotency key was already used for a different immutable request.");
    this.name = "CaptureSinkConflictError";
  }
}

/**
 * Local/test-only capture storage. A restart loses both captured side effects
 * and the matching key registry, while one instance retains both together.
 */
export class InMemoryCaptureSink implements CaptureSink {
  readonly idempotencyGuaranteeMs = CAPTURE_GUARANTEE_MS;
  private readonly requests = new Map<string, FrozenEmailRequest>();

  async captureOnce(idempotencyKey: string, request: FrozenEmailRequest): Promise<"captured" | "duplicate"> {
    const existing = this.requests.get(idempotencyKey);
    if (existing) {
      if (!sameRequest(existing, request)) throw new CaptureSinkConflictError();
      return "duplicate";
    }
    this.requests.set(idempotencyKey, structuredClone(request));
    return "captured";
  }

  captured(): FrozenEmailRequest[] {
    return [...this.requests.values()].map(request => structuredClone(request));
  }
}

/** A deterministic local provider whose idempotency capability comes from its sink. */
export class CaptureEmailProvider implements EmailProvider {
  readonly timeoutMs = 1_000;
  readonly idempotencyGuaranteeMs: number;

  constructor(private readonly sink: CaptureSink) {
    if (!Number.isFinite(sink.idempotencyGuaranteeMs) || sink.idempotencyGuaranteeMs <= 0) {
      throw new Error("Capture sink idempotency guarantee must be a positive finite number of milliseconds.");
    }
    this.idempotencyGuaranteeMs = sink.idempotencyGuaranteeMs;
  }

  async send(request: FrozenEmailRequest, _options: { readonly timeoutMs: number }): Promise<ProviderOutcome> {
    try {
      await this.sink.captureOnce(request.idempotencyKey, request);
      return { kind: "sent", providerId: "capture" };
    } catch {
      return { kind: "permanent", errorCode: "notification_invalid" };
    }
  }
}

export function createEmailProvider(
  mode: DeliveryMode,
  sink: CaptureSink,
  resendProvider?: EmailProvider,
): EmailProvider | null {
  if (mode === "disabled") return null;
  if (mode === "capture") return new CaptureEmailProvider(sink);
  if (resendProvider) return resendProvider;
  throw new Error(
    "EMAIL_DELIVERY_MODE=resend requires an explicitly configured Resend provider adapter. Configure RESEND_API_KEY or use disabled/capture.",
  );
}
