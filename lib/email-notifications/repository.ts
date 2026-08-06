import "server-only";

import { SUPABASE_RPC_TIMEOUT_MS, supabaseRpc, supabaseSelect } from "@/lib/supabase/rest";
import type {
  Claim,
  FrozenEmailRequest,
  Json,
  NotificationCleanupResult,
  NotificationEnqueueInput,
  NotificationEnqueueRepository,
  NotificationEnqueueResult,
  NotificationOrchestrationRepository,
  NotificationQueueHealth,
  NotificationRepository,
  NotificationRow,
  ProviderErrorCode,
  RecipientErrorCode,
  RequeueErrorCode,
  TerminalErrorCode,
} from "./types";

type RepositoryCode = "repository_unavailable" | "repository_rejected" | "idempotency_conflict" | "invalid_response" | "stale_claim";
type RepositoryOperation =
  | "enqueue" | "cleanup" | "health" | "claim_due" | "claim_one" | "get_claimed" | "expire_claimed" | "resolve_recipient" | "wait_recipient"
  | "freeze_request" | "begin_provider_call" | "defer_ambiguous" | "record_provider_failure"
  | "terminal_provider_failure" | "mark_sent" | "requeue" | "mark_dead" | "suppress_claimed" | "release_claim";

export class NotificationRepositoryError extends Error {
  readonly code: RepositoryCode;

  constructor(code: RepositoryCode, message?: string) {
    super(message ?? `Notification repository operation failed (${code}). Check Supabase availability and service-role configuration.`);
    this.name = "NotificationRepositoryError";
    this.code = code;
  }
}

interface RepositoryOptions {
  readonly log?: (event: { readonly code: RepositoryCode; readonly operation: RepositoryOperation }) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENTS = new Set(["signup", "membership_joined", "invitation", "bioblitz_winner"]);
const OUTBOX_STATUSES = new Set(["waiting_recipient", "queued", "processing", "sent", "suppressed", "dead"]);
const PREVIOUS = new Set(["waiting_recipient", "queued", "processing"]);
const PHASES = new Set(["idle", "in_flight"]);
const ROW_SELECT = [
  "id", "event_type", "payload", "source_id", "recipient_did", "recipient_email", "template_key", "locale",
  "frozen_from", "frozen_to", "frozen_subject", "frozen_html", "frozen_text",
  "status", "provider_call_phase", "provider_call_is_ambiguous_retry", "provider_idempotency_key",
  "provider_idempotency_expires_at", "processing_run_count", "provider_attempt_count", "processing_token",
  "locked_until", "created_at",
].join(",");

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isJson(value: unknown, depth = 0): value is Json {
  if (depth > 20) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isJson(item, depth + 1));
  const valueObject = object(value);
  return valueObject !== null && Object.values(valueObject).every(item => isJson(item, depth + 1));
}

function decodeClaim(value: unknown): Claim | null {
  const item = object(value);
  if (!item || typeof item.outbox_id !== "string" || !UUID.test(item.outbox_id)
    || typeof item.previous_status !== "string" || !PREVIOUS.has(item.previous_status)
    || typeof item.resume_provider_call_phase !== "string" || !PHASES.has(item.resume_provider_call_phase)
    || typeof item.processing_token !== "string" || !UUID.test(item.processing_token)) return null;
  const lockedUntil = date(item.locked_until);
  if (!lockedUntil) return null;
  return {
    outboxId: item.outbox_id,
    previousStatus: item.previous_status as Claim["previousStatus"],
    resumeProviderCallPhase: item.resume_provider_call_phase as Claim["resumeProviderCallPhase"],
    processingToken: item.processing_token,
    lockedUntil,
  };
}

function decodeRow(value: unknown): NotificationRow | null {
  const item = object(value);
  if (!item || typeof item.id !== "string" || !UUID.test(item.id)
    || typeof item.event_type !== "string" || !EVENTS.has(item.event_type)
    || !isJson(item.payload)
    || !nullableString(item.source_id) || !nullableString(item.recipient_did) || !nullableString(item.recipient_email)
    || typeof item.template_key !== "string" || !nullableString(item.locale)
    || item.status !== "processing"
    || typeof item.provider_call_phase !== "string" || !PHASES.has(item.provider_call_phase)
    || typeof item.provider_call_is_ambiguous_retry !== "boolean"
    || typeof item.provider_idempotency_key !== "string"
    || typeof item.processing_run_count !== "number" || !Number.isInteger(item.processing_run_count) || item.processing_run_count < 0
    || typeof item.provider_attempt_count !== "number" || !Number.isInteger(item.provider_attempt_count) || item.provider_attempt_count < 0
    || typeof item.processing_token !== "string" || !UUID.test(item.processing_token)) return null;
  const lockedUntil = date(item.locked_until);
  const createdAt = date(item.created_at);
  if (!lockedUntil || !createdAt) return null;

  const frozenValues = [item.frozen_from, item.frozen_to, item.frozen_subject, item.frozen_html, item.frozen_text];
  const noFrozen = frozenValues.every(field => field === null);
  const completeFrozen = frozenValues.every(field => typeof field === "string");
  if (!noFrozen && !completeFrozen) return null;
  const expiresAt = item.provider_idempotency_expires_at === null ? null : date(item.provider_idempotency_expires_at);
  if (item.provider_idempotency_expires_at !== null && !expiresAt) return null;
  if ((item.provider_call_phase === "idle" && (item.provider_call_is_ambiguous_retry || expiresAt !== null))
    || (item.provider_call_phase === "in_flight" && expiresAt === null)) return null;

  return {
    id: item.id,
    eventType: item.event_type as NotificationRow["eventType"],
    payload: item.payload,
    sourceId: item.source_id,
    recipientDid: item.recipient_did,
    recipientEmail: item.recipient_email,
    templateKey: item.template_key,
    locale: item.locale,
    frozenRequest: completeFrozen ? {
      from: item.frozen_from as string,
      to: item.frozen_to as string,
      subject: item.frozen_subject as string,
      html: item.frozen_html as string,
      text: item.frozen_text as string,
      idempotencyKey: item.provider_idempotency_key,
    } : null,
    status: "processing",
    providerCallPhase: item.provider_call_phase as NotificationRow["providerCallPhase"],
    providerCallIsAmbiguousRetry: item.provider_call_is_ambiguous_retry,
    providerIdempotencyKey: item.provider_idempotency_key,
    providerIdempotencyExpiresAt: expiresAt,
    processingRunCount: item.processing_run_count,
    providerAttemptCount: item.provider_attempt_count,
    processingToken: item.processing_token,
    lockedUntil,
    createdAt,
  };
}

export class SupabaseNotificationRepository implements NotificationRepository, NotificationEnqueueRepository, NotificationOrchestrationRepository {
  readonly transitionTimeoutMs = SUPABASE_RPC_TIMEOUT_MS;
  private readonly log: NonNullable<RepositoryOptions["log"]>;

  constructor(options: RepositoryOptions = {}) {
    this.log = options.log ?? (() => undefined);
  }

  private async run<T>(operation: RepositoryOperation, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof NotificationRepositoryError) {
        if (error.code === "invalid_response") this.log({ code: error.code, operation });
        throw error;
      }
      const details = object(error);
      const status = details?.status;
      const message = typeof details?.message === "string" ? details.message : "";
      const code: RepositoryCode = operation === "enqueue"
        && (message.includes("notification_outbox_idempotency_conflict")
          || message.includes("notification_outbox_provider_key_conflict"))
        ? "idempotency_conflict"
        : typeof status === "number" && status >= 500
          ? "repository_unavailable"
          : "repository_rejected";
      this.log({ code, operation });
      throw new NotificationRepositoryError(code);
    }
  }

  private invalid(message: string): never {
    throw new NotificationRepositoryError("invalid_response", message);
  }

  private async transition(operation: RepositoryOperation, name: string, parameters: Record<string, unknown>): Promise<boolean> {
    return this.run(operation, async () => {
      const response = await supabaseRpc<unknown>(name, parameters);
      if (typeof response !== "boolean") this.invalid("Notification repository returned an invalid transition response. Verify the committed outbox RPC signature.");
      return response;
    });
  }

  async enqueue(input: NotificationEnqueueInput): Promise<NotificationEnqueueResult> {
    return this.run("enqueue", async () => {
      const response = await supabaseRpc<unknown>("notification_outbox_enqueue", {
        p_event_key: input.eventKey,
        p_event_type: input.eventType,
        p_payload: input.payload,
        p_source_id: input.sourceId,
        p_recipient_did: input.recipientDid,
        p_recipient_email: input.recipientEmail,
        p_template_key: input.templateKey,
        p_locale: input.locale,
        p_provider_idempotency_key: input.providerIdempotencyKey,
        p_next_attempt_at: input.nextAttemptAt.toISOString(),
      });
      if (!Array.isArray(response) || response.length !== 1) {
        this.invalid("Notification repository returned an invalid enqueue response. Verify the committed enqueue RPC signature.");
      }
      const item = object(response[0]);
      if (!item || typeof item.outbox_id !== "string" || !UUID.test(item.outbox_id)
        || typeof item.status !== "string" || !OUTBOX_STATUSES.has(item.status)
        || typeof item.duplicate !== "boolean") {
        this.invalid("Notification repository returned an invalid enqueue response. Verify the committed enqueue RPC signature.");
      }
      return {
        outboxId: item.outbox_id,
        status: item.status as NotificationEnqueueResult["status"],
        duplicate: item.duplicate,
      };
    });
  }

  async cleanup(batchSize: number): Promise<NotificationCleanupResult> {
    return this.run("cleanup", async () => {
      const response = await supabaseRpc<unknown>("notification_outbox_cleanup", { p_batch_size: batchSize });
      if (!Array.isArray(response) || response.length !== 1) {
        this.invalid("Notification repository returned an invalid cleanup response. Verify the committed cleanup RPC signature.");
      }
      const item = object(response[0]);
      const counts = item && [item.active_expired, item.redacted, item.deleted];
      if (!item || !counts || counts.some(value => typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
        this.invalid("Notification repository returned an invalid cleanup response. Verify the committed cleanup RPC signature.");
      }
      return {
        activeExpired: item.active_expired as number,
        redacted: item.redacted as number,
        deleted: item.deleted as number,
      };
    });
  }

  async health(): Promise<NotificationQueueHealth> {
    return this.run("health", async () => {
      const response = await supabaseRpc<unknown>("notification_outbox_health", {});
      const item = object(response);
      const counts = item && [item.waiting_recipient, item.queued, item.processing, item.dead, item.oldest_due_age_seconds];
      if (!item || !counts || counts.some(value => typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
        this.invalid("Notification repository returned an invalid health response. Verify the committed health RPC signature.");
      }
      return {
        waitingRecipient: item.waiting_recipient as number,
        queued: item.queued as number,
        processing: item.processing as number,
        dead: item.dead as number,
        oldestDueAgeSeconds: item.oldest_due_age_seconds as number,
      };
    });
  }

  async claimDue(batchSize: number, leaseSeconds: number): Promise<Claim[]> {
    return this.run("claim_due", async () => {
      const response = await supabaseRpc<unknown>("notification_outbox_claim_due", {
        p_batch_size: batchSize,
        p_lease_seconds: leaseSeconds,
      });
      if (!Array.isArray(response)) this.invalid("Notification repository returned an invalid claim response. Verify the committed claim RPC signature.");
      const claims = response.map(decodeClaim);
      if (claims.some(value => value === null)) this.invalid("Notification repository returned an invalid claim response. Verify the committed claim RPC signature.");
      return claims as Claim[];
    });
  }

  async claimOne(outboxId: string, token: string, leaseSeconds: number): Promise<Claim | null> {
    return this.run("claim_one", async () => {
      const response = await supabaseRpc<unknown>("notification_outbox_claim_one", {
        p_outbox_id: outboxId, p_token: token, p_lease_seconds: leaseSeconds,
      });
      if (!Array.isArray(response) || response.length > 1) this.invalid("Notification repository returned an invalid claim response. Verify the committed claim RPC signature.");
      if (response.length === 0) return null;
      const claimed = decodeClaim(response[0]);
      if (!claimed) this.invalid("Notification repository returned an invalid claim response. Verify the committed claim RPC signature.");
      return claimed;
    });
  }

  async getClaimed(claim: Claim): Promise<NotificationRow> {
    return this.run("get_claimed", async () => {
      const query = new URLSearchParams({
        id: `eq.${claim.outboxId}`,
        processing_token: `eq.${claim.processingToken}`,
        status: "eq.processing",
        select: ROW_SELECT,
      });
      const response = await supabaseSelect<unknown>(`/notification_outbox?${query}`);
      if (response.length === 0) throw new NotificationRepositoryError("stale_claim", "Notification claim is no longer owned by this worker.");
      if (response.length !== 1) this.invalid("Notification repository returned an invalid claimed row. The row contract may have changed.");
      const claimedRow = decodeRow(response[0]);
      if (!claimedRow || claimedRow.processingToken !== claim.processingToken) {
        this.invalid("Notification repository returned an invalid claimed row. The row contract may have changed.");
      }
      return claimedRow;
    });
  }

  expireClaimed(outboxId: string, token: string, code: "active_retention_expired" | "provider_idempotency_expired") {
    return this.transition("expire_claimed", "notification_outbox_expire_claimed", { p_outbox_id: outboxId, p_token: token, p_error_code: code });
  }
  resolveRecipient(outboxId: string, token: string, email: string) {
    return this.transition("resolve_recipient", "notification_outbox_resolve_recipient", { p_outbox_id: outboxId, p_token: token, p_recipient_email: email });
  }
  waitRecipient(outboxId: string, token: string, nextAttemptAt: Date, code: RecipientErrorCode) {
    return this.transition("wait_recipient", "notification_outbox_wait_recipient", { p_outbox_id: outboxId, p_token: token, p_next_attempt_at: nextAttemptAt.toISOString(), p_error_code: code });
  }
  freezeRequest(outboxId: string, token: string, request: Omit<FrozenEmailRequest, "idempotencyKey">) {
    return this.transition("freeze_request", "notification_outbox_freeze_request", {
      p_outbox_id: outboxId, p_token: token, p_from: request.from, p_to: request.to,
      p_subject: request.subject, p_html: request.html, p_text: request.text,
    });
  }
  beginProviderCall(outboxId: string, token: string, idempotencyExpiresAt: Date) {
    return this.transition("begin_provider_call", "notification_outbox_begin_provider_call", { p_outbox_id: outboxId, p_token: token, p_idempotency_expires_at: idempotencyExpiresAt.toISOString() });
  }
  deferAmbiguous(outboxId: string, token: string, reclaimAt: Date) {
    return this.transition("defer_ambiguous", "notification_outbox_defer_ambiguous", { p_outbox_id: outboxId, p_token: token, p_reclaim_at: reclaimAt.toISOString() });
  }
  recordProviderFailure(outboxId: string, token: string, code: ProviderErrorCode) {
    return this.transition("record_provider_failure", "notification_outbox_record_provider_failure", { p_outbox_id: outboxId, p_token: token, p_error_code: code });
  }
  terminalProviderFailure(outboxId: string, token: string, code: "provider_rejected" | "notification_invalid") {
    return this.transition("terminal_provider_failure", "notification_outbox_terminal_provider_failure", { p_outbox_id: outboxId, p_token: token, p_error_code: code });
  }
  markSent(outboxId: string, token: string, providerId: string) {
    return this.transition("mark_sent", "notification_outbox_mark_sent", { p_outbox_id: outboxId, p_token: token, p_provider_id: providerId });
  }
  requeue(outboxId: string, token: string, nextAttemptAt: Date, code: RequeueErrorCode) {
    return this.transition("requeue", "notification_outbox_requeue", { p_outbox_id: outboxId, p_token: token, p_next_attempt_at: nextAttemptAt.toISOString(), p_error_code: code });
  }
  markDead(outboxId: string, token: string, code: TerminalErrorCode) {
    return this.transition("mark_dead", "notification_outbox_mark_dead", { p_outbox_id: outboxId, p_token: token, p_error_code: code });
  }
  suppressClaimed(outboxId: string, token: string, code: "invitation_not_pending" | "manually_suppressed") {
    return this.transition("suppress_claimed", "notification_outbox_suppress_claimed", { p_outbox_id: outboxId, p_token: token, p_error_code: code });
  }
  releaseClaim(outboxId: string, token: string) {
    return this.transition("release_claim", "notification_outbox_release_claim", { p_outbox_id: outboxId, p_token: token });
  }
}
