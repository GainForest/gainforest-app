import "server-only";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type DeliveryMode = "disabled" | "capture" | "resend";
export type PersistedDeliveryMode = Exclude<DeliveryMode, "disabled">;
export type EventType = "signup" | "membership_joined" | "invitation" | "bioblitz_winner";
export type OutboxStatus = "waiting_recipient" | "queued" | "processing" | "sent" | "suppressed" | "dead";
export type ProviderCallPhase = "idle" | "in_flight";
export type PreviousStatus = "waiting_recipient" | "queued" | "processing";

export type RecipientErrorCode = "recipient_missing" | "recipient_lookup_failed";
export type ProviderErrorCode = "provider_5xx" | "provider_rate_limited" | "provider_rejected" | "notification_invalid";
export type RequeueErrorCode = ProviderErrorCode | "recipient_lookup_failed" | "delivery_mode_mismatch";
export type TerminalErrorCode =
  | "provider_rejected"
  | "provider_timeout"
  | "provider_idempotency_expired"
  | "active_retention_expired"
  | "notification_invalid";
export type NotificationErrorCode = RecipientErrorCode | ProviderErrorCode | RequeueErrorCode | TerminalErrorCode
  | "invitation_not_pending" | "manually_suppressed";

export interface Claim {
  readonly outboxId: string;
  readonly previousStatus: PreviousStatus;
  readonly resumeProviderCallPhase: ProviderCallPhase;
  readonly processingToken: string;
  readonly lockedUntil: Date;
}

export interface FrozenEmailRequest {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

export interface NotificationRow {
  readonly id: string;
  readonly eventType: EventType;
  readonly payload: Json;
  readonly sourceId: string | null;
  readonly recipientDid: string | null;
  readonly recipientEmail: string | null;
  readonly templateKey: string;
  readonly locale: string | null;
  readonly deliveryMode: PersistedDeliveryMode;
  readonly frozenRequest: FrozenEmailRequest | null;
  readonly frozenAt: Date | null;
  readonly status: "processing";
  readonly providerCallPhase: ProviderCallPhase;
  readonly providerCallIsAmbiguousRetry: boolean;
  readonly providerIdempotencyKey: string;
  readonly providerIdempotencyExpiresAt: Date | null;
  readonly processingRunCount: number;
  readonly providerAttemptCount: number;
  readonly processingToken: string;
  readonly lockedUntil: Date;
  readonly createdAt: Date;
}

export type ProviderOutcome =
  | { readonly kind: "sent"; readonly providerId: string }
  | { readonly kind: "transient"; readonly errorCode: "provider_5xx" | "provider_rate_limited"; readonly retryAfterMs?: number }
  | { readonly kind: "permanent"; readonly errorCode: "provider_rejected" | "notification_invalid" }
  | { readonly kind: "uncertain"; readonly errorCode: "provider_timeout" };

export interface EmailProvider {
  /** Maximum duration of one provider transmission. */
  readonly timeoutMs: number;
  /** Verified period during which this provider honors the same idempotency key. */
  readonly idempotencyGuaranteeMs: number;
  send(request: FrozenEmailRequest, options: { readonly timeoutMs: number }): Promise<ProviderOutcome>;
}

export type CaptureResult = "captured" | "duplicate";

/** Stores at most one immutable request for each idempotency key. */
export interface CaptureSink {
  /** Lifetime for which this sink preserves both captured effects and key ownership. */
  readonly idempotencyGuaranteeMs: number;
  captureOnce(idempotencyKey: string, request: FrozenEmailRequest): Promise<CaptureResult> | CaptureResult;
}

export interface RenderableRow {
  readonly id: string;
  readonly eventType: EventType;
  readonly payload: Json;
  readonly sourceId: string | null;
  readonly recipientEmail: string;
  readonly templateKey: string;
  readonly locale: string | null;
}

export interface RenderedNotification {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface NotificationRenderer {
  render(row: RenderableRow): Promise<RenderedNotification>;
}

export type UserEmailLookup =
  | { readonly kind: "ready"; readonly email: string }
  | { readonly kind: "missing" }
  | { readonly kind: "error" };

export interface UserEmailReader {
  lookup(did: string): Promise<UserEmailLookup>;
}

export type InvitationSendability =
  | { readonly kind: "sendable" }
  | { readonly kind: "not_pending" | "expired" | "error" };

export interface InvitationSourceReader {
  getSendability(sourceId: string, now: Date): Promise<InvitationSendability>;
}

export interface Clock {
  now(): Date;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface NotificationEnqueueInput {
  readonly eventKey: string;
  readonly eventType: EventType;
  readonly payload: Json;
  readonly sourceId: string | null;
  readonly recipientDid: string | null;
  readonly recipientEmail: string | null;
  readonly templateKey: string;
  readonly locale: string | null;
  readonly providerIdempotencyKey: string | null;
  readonly deliveryMode: PersistedDeliveryMode;
  readonly nextAttemptAt: Date;
}

export interface NotificationEnqueueResult {
  readonly outboxId: string;
  readonly status: OutboxStatus;
  readonly duplicate: boolean;
}

export interface NotificationCleanupResult {
  readonly activeExpired: number;
  readonly redacted: number;
  readonly deleted: number;
}

export interface NotificationEnqueueRepository {
  enqueue(input: NotificationEnqueueInput): Promise<NotificationEnqueueResult>;
}

export interface NotificationOrchestrationRepository {
  cleanup(batchSize: number): Promise<NotificationCleanupResult>;
  claimDue(batchSize: number, leaseSeconds: number): Promise<Claim[]>;
  claimOne(outboxId: string, token: string, leaseSeconds: number): Promise<Claim | null>;
  releaseClaim(outboxId: string, token: string): Promise<boolean>;
}

export interface NotificationRepository {
  /** Maximum time a durable transition may wait before aborting. */
  readonly transitionTimeoutMs: number;
  claimDue(batchSize: number, leaseSeconds: number): Promise<Claim[]>;
  claimOne(outboxId: string, token: string, leaseSeconds: number): Promise<Claim | null>;
  getClaimed(claim: Claim): Promise<NotificationRow>;
  expireClaimed(outboxId: string, token: string, code: "active_retention_expired" | "provider_idempotency_expired"): Promise<boolean>;
  resolveRecipient(outboxId: string, token: string, email: string): Promise<boolean>;
  waitRecipient(outboxId: string, token: string, nextAttemptAt: Date, code: RecipientErrorCode): Promise<boolean>;
  freezeRequest(outboxId: string, token: string, request: Omit<FrozenEmailRequest, "idempotencyKey">): Promise<boolean>;
  beginProviderCall(outboxId: string, token: string, idempotencyExpiresAt: Date): Promise<boolean>;
  deferAmbiguous(outboxId: string, token: string, reclaimAt: Date): Promise<boolean>;
  recordProviderFailure(outboxId: string, token: string, code: ProviderErrorCode): Promise<boolean>;
  terminalProviderFailure(outboxId: string, token: string, code: "provider_rejected" | "notification_invalid"): Promise<boolean>;
  markSent(outboxId: string, token: string, providerId: string): Promise<boolean>;
  requeue(outboxId: string, token: string, nextAttemptAt: Date, code: RequeueErrorCode): Promise<boolean>;
  markDead(outboxId: string, token: string, code: TerminalErrorCode): Promise<boolean>;
  suppressClaimed(outboxId: string, token: string, code: "invitation_not_pending" | "manually_suppressed"): Promise<boolean>;
  releaseClaim(outboxId: string, token: string): Promise<boolean>;
}

export type ProcessResult =
  | { readonly kind: "sent" }
  | { readonly kind: "requeued"; readonly errorCode: RequeueErrorCode }
  | { readonly kind: "waiting_recipient"; readonly errorCode: RecipientErrorCode }
  | { readonly kind: "ambiguous_deferred" }
  | { readonly kind: "dead"; readonly errorCode: TerminalErrorCode }
  | { readonly kind: "suppressed" }
  | { readonly kind: "disabled" }
  /** The orchestrator must not reclaim this row again during the same invocation. */
  | { readonly kind: "released_insufficient_time" }
  | { readonly kind: "stale_claim" };

export interface NotificationSummary {
  readonly outboxId: string;
  readonly result: ProcessResult["kind"];
  readonly errorCode?: NotificationErrorCode;
}
