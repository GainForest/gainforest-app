import "server-only";

import { NotificationRepositoryError } from "./repository";
import type {
  Claim,
  Clock,
  DeliveryMode,
  EmailProvider,
  FrozenEmailRequest,
  InvitationSourceReader,
  NotificationRenderer,
  NotificationRepository,
  NotificationRow,
  ProcessResult,
  ProviderErrorCode,
  ProviderOutcome,
  RenderedNotification,
  UserEmailReader,
} from "./types";

const QUICK_DELAYS_MS = [0, 500, 1_500] as const;
const DURABLE_BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000] as const;
const RECIPIENT_MISSING_BACKOFF_MS = [3_600_000, 21_600_000, 86_400_000] as const;
const RECIPIENT_ERROR_BACKOFF_MS = [60_000, 300_000, 1_800_000] as const;
const MAX_ACTIVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface NotificationWorkerDependencies {
  readonly mode: DeliveryMode;
  readonly from: string;
  readonly repository: NotificationRepository;
  readonly provider: EmailProvider | null;
  readonly renderer: NotificationRenderer;
  readonly clock: Clock;
  readonly userEmailReader: UserEmailReader;
  readonly invitationSourceReader: InvitationSourceReader;
  readonly invocationDeadline: Date;
  readonly safetyMarginMs: number;
}

function atBackoff(now: Date, row: NotificationRow, values: readonly number[]): Date {
  const index = Math.min(Math.max(row.processingRunCount - 1, 0), values.length - 1);
  const proposed = now.getTime() + values[index];
  const retentionLimit = row.createdAt.getTime() + MAX_ACTIVE_AGE_MS;
  return new Date(Math.max(now.getTime() + 1, Math.min(proposed, retentionLimit)));
}

function validHeader(value: string, max: number): boolean {
  return value.length >= 1 && value.length <= max && !/[\r\n\0]/.test(value);
}

function validBody(value: string): boolean {
  return value.length >= 1 && value.length <= 262_144 && !value.includes("\0");
}

function validRender(rendered: RenderedNotification): boolean {
  return validHeader(rendered.subject, 998) && validBody(rendered.html) && validBody(rendered.text);
}

function validRecipient(value: string): boolean {
  return validHeader(value, 320)
    && value.length >= 3
    && value === value.trim().toLowerCase()
    && value.indexOf("@") > 0;
}

function validEnvelope(from: string, to: string): boolean {
  return validHeader(from, 320) && validRecipient(to);
}

function hasCallBudget(now: Date, claim: Claim, dependencies: NotificationWorkerDependencies, guaranteeExpiry?: Date | null): boolean {
  const requiredUntil = now.getTime() + (dependencies.provider?.timeoutMs ?? 0) + dependencies.safetyMarginMs;
  return requiredUntil <= dependencies.invocationDeadline.getTime()
    && requiredUntil <= claim.lockedUntil.getTime()
    && (!guaranteeExpiry || requiredUntil <= guaranteeExpiry.getTime());
}

async function staleUnless(ok: boolean, result: ProcessResult): Promise<ProcessResult> {
  return ok ? result : { kind: "stale_claim" };
}

function deferTime(now: Date, expiry: Date): Date | null {
  const remaining = expiry.getTime() - now.getTime();
  if (remaining <= 2) return null;
  return new Date(now.getTime() + Math.min(60_000, Math.max(1, Math.floor(remaining / 2))));
}

async function expireClaimed(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
  code: "active_retention_expired" | "provider_idempotency_expired",
): Promise<ProcessResult> {
  return staleUnless(
    await dependencies.repository.expireClaimed(row.id, claim.processingToken, code),
    { kind: "dead", errorCode: code },
  );
}

async function deferAmbiguity(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
  expiry: Date | null,
): Promise<ProcessResult> {
  const now = dependencies.clock.now();
  if (expiry && now >= expiry) return expireClaimed(row, claim, dependencies, "provider_idempotency_expired");
  if (!expiry) return { kind: "stale_claim" };
  const reclaimAt = deferTime(now, expiry);
  if (!reclaimAt) return expireClaimed(row, claim, dependencies, "provider_idempotency_expired");
  return staleUnless(
    await dependencies.repository.deferAmbiguous(row.id, claim.processingToken, reclaimAt),
    { kind: "ambiguous_deferred" },
  );
}

async function release(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
  result: ProcessResult,
): Promise<ProcessResult> {
  return staleUnless(await dependencies.repository.releaseClaim(row.id, claim.processingToken), result);
}

function isAmbiguous(row: NotificationRow, claim: Claim): boolean {
  return row.providerCallPhase === "in_flight"
    || row.providerCallIsAmbiguousRetry
    || (claim.previousStatus === "processing" && claim.resumeProviderCallPhase === "in_flight");
}

async function boundaryOrBudget(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
): Promise<ProcessResult | null> {
  const now = dependencies.clock.now();
  if (now.getTime() >= row.createdAt.getTime() + MAX_ACTIVE_AGE_MS) {
    return expireClaimed(row, claim, dependencies, "active_retention_expired");
  }
  const ambiguous = isAmbiguous(row, claim);
  if (ambiguous && row.providerIdempotencyExpiresAt && now >= row.providerIdempotencyExpiresAt) {
    return expireClaimed(row, claim, dependencies, "provider_idempotency_expired");
  }
  if (hasCallBudget(now, claim, dependencies, ambiguous ? row.providerIdempotencyExpiresAt : null)) return null;
  return ambiguous
    ? deferAmbiguity(row, claim, dependencies, row.providerIdempotencyExpiresAt)
    : release(row, claim, dependencies, { kind: "released_insufficient_time" });
}

async function invalidWork(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
): Promise<ProcessResult> {
  if (isAmbiguous(row, claim)) return deferAmbiguity(row, claim, dependencies, row.providerIdempotencyExpiresAt);
  return staleUnless(
    await dependencies.repository.markDead(row.id, claim.processingToken, "notification_invalid"),
    { kind: "dead", errorCode: "notification_invalid" },
  );
}

function computedExpiry(row: NotificationRow, now: Date, provider: EmailProvider, ambiguous: boolean): Date {
  const providerExpiry = new Date(now.getTime() + provider.idempotencyGuaranteeMs);
  if (ambiguous && row.providerIdempotencyExpiresAt && row.providerIdempotencyExpiresAt < providerExpiry) {
    return row.providerIdempotencyExpiresAt;
  }
  return providerExpiry;
}

async function prepareRequest(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
): Promise<FrozenEmailRequest | ProcessResult> {
  if (row.frozenRequest) return row.frozenRequest;
  if (!row.recipientEmail || !validEnvelope(dependencies.from, row.recipientEmail)) {
    return invalidWork(row, claim, dependencies);
  }
  const beforeRender = await boundaryOrBudget(row, claim, dependencies);
  if (beforeRender) return beforeRender;

  let rendered: RenderedNotification;
  try {
    rendered = await dependencies.renderer.render({
      id: row.id,
      eventType: row.eventType,
      payload: row.payload,
      sourceId: row.sourceId,
      recipientEmail: row.recipientEmail,
      templateKey: row.templateKey,
      locale: row.locale,
    });
  } catch {
    return invalidWork(row, claim, dependencies);
  }
  const afterRender = await boundaryOrBudget(row, claim, dependencies);
  if (afterRender) return afterRender;
  if (!validRender(rendered)) return invalidWork(row, claim, dependencies);

  const request: FrozenEmailRequest = {
    from: dependencies.from,
    to: row.recipientEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: row.providerIdempotencyKey,
  };
  const beforeFreeze = await boundaryOrBudget(row, claim, dependencies);
  if (beforeFreeze) return beforeFreeze;
  const frozen = await dependencies.repository.freezeRequest(row.id, claim.processingToken, {
    from: request.from,
    to: request.to,
    subject: request.subject,
    html: request.html,
    text: request.text,
  });
  if (!frozen) return { kind: "stale_claim" };
  const afterFreeze = await boundaryOrBudget(row, claim, dependencies);
  return afterFreeze ?? request;
}

async function durableRequeue(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
  code: ProviderErrorCode,
  delayMs?: number,
): Promise<ProcessResult> {
  const now = dependencies.clock.now();
  const index = Math.min(Math.max(row.processingRunCount - 1, 0), DURABLE_BACKOFF_MS.length - 1);
  const fallback = DURABLE_BACKOFF_MS[index];
  const proposed = now.getTime() + Math.max(delayMs ?? 0, fallback);
  const activeBoundary = row.createdAt.getTime() + MAX_ACTIVE_AGE_MS;
  const nextAttemptAt = new Date(Math.min(proposed, activeBoundary));
  return staleUnless(
    await dependencies.repository.requeue(row.id, claim.processingToken, nextAttemptAt, code),
    { kind: "requeued", errorCode: code },
  );
}

async function handleDefinitiveFailure(
  row: NotificationRow,
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
  outcome: Extract<ProviderOutcome, { kind: "transient" | "permanent" }>,
  ambiguous: boolean,
  expiry: Date,
  attemptIndex: number,
): Promise<ProcessResult | null> {
  if (outcome.kind === "permanent") {
    if (!ambiguous) {
      return staleUnless(
        await dependencies.repository.terminalProviderFailure(row.id, claim.processingToken, outcome.errorCode),
        { kind: "dead", errorCode: outcome.errorCode },
      );
    }
    const recorded = await dependencies.repository.recordProviderFailure(row.id, claim.processingToken, outcome.errorCode);
    if (!recorded) return { kind: "stale_claim" };
    return deferAmbiguity(row, claim, dependencies, expiry);
  }

  const recorded = await dependencies.repository.recordProviderFailure(row.id, claim.processingToken, outcome.errorCode);
  if (!recorded) return { kind: "stale_claim" };
  if (ambiguous) return deferAmbiguity(row, claim, dependencies, expiry);

  const nextQuickDelay = QUICK_DELAYS_MS[attemptIndex + 1];
  if (outcome.retryAfterMs !== undefined && (nextQuickDelay === undefined || outcome.retryAfterMs > nextQuickDelay)) {
    return durableRequeue(row, claim, dependencies, outcome.errorCode, outcome.retryAfterMs);
  }
  if (nextQuickDelay === undefined) return durableRequeue(row, claim, dependencies, outcome.errorCode);
  const nextCallAt = new Date(dependencies.clock.now().getTime() + nextQuickDelay);
  if (!hasCallBudget(nextCallAt, claim, dependencies)) {
    return durableRequeue(row, claim, dependencies, outcome.errorCode, outcome.retryAfterMs);
  }
  return null;
}

/**
 * Processes one already-committed claim. Orchestration must not call this when
 * globally disabled and must not reclaim an insufficient-time release again in
 * the same invocation.
 */
export async function processNotificationClaim(
  claim: Claim,
  dependencies: NotificationWorkerDependencies,
): Promise<ProcessResult> {
  let row: NotificationRow;
  try {
    row = await dependencies.repository.getClaimed(claim);
  } catch (error) {
    if (error instanceof NotificationRepositoryError && error.code === "stale_claim") return { kind: "stale_claim" };
    throw error;
  }

  if (row.id !== claim.outboxId || row.processingToken !== claim.processingToken
    || row.providerCallPhase !== claim.resumeProviderCallPhase) return { kind: "stale_claim" };

  const initialNow = dependencies.clock.now();
  if (initialNow.getTime() >= row.createdAt.getTime() + MAX_ACTIVE_AGE_MS) {
    return expireClaimed(row, claim, dependencies, "active_retention_expired");
  }
  if (isAmbiguous(row, claim) && row.providerIdempotencyExpiresAt && initialNow >= row.providerIdempotencyExpiresAt) {
    return expireClaimed(row, claim, dependencies, "provider_idempotency_expired");
  }

  if (dependencies.mode === "disabled" || !dependencies.provider || row.deliveryMode !== dependencies.mode) {
    if (isAmbiguous(row, claim)) return deferAmbiguity(row, claim, dependencies, row.providerIdempotencyExpiresAt);
    return release(row, claim, dependencies, { kind: "disabled" });
  }
  const initialBoundary = await boundaryOrBudget(row, claim, dependencies);
  if (initialBoundary) return initialBoundary;

  if (row.eventType === "bioblitz_winner" && !row.recipientEmail) {
    if (!row.recipientDid) return invalidWork(row, claim, dependencies);
    const beforeLookup = await boundaryOrBudget(row, claim, dependencies);
    if (beforeLookup) return beforeLookup;
    let lookup;
    try {
      lookup = await dependencies.userEmailReader.lookup(row.recipientDid);
    } catch {
      lookup = { kind: "error" } as const;
    }
    const afterLookup = await boundaryOrBudget(row, claim, dependencies);
    if (afterLookup) return afterLookup;
    if (lookup.kind !== "ready") {
      const code = lookup.kind === "missing" ? "recipient_missing" : "recipient_lookup_failed";
      const values = lookup.kind === "missing" ? RECIPIENT_MISSING_BACKOFF_MS : RECIPIENT_ERROR_BACKOFF_MS;
      return staleUnless(
        await dependencies.repository.waitRecipient(row.id, claim.processingToken, atBackoff(dependencies.clock.now(), row, values), code),
        { kind: "waiting_recipient", errorCode: code },
      );
    }
    if (!validRecipient(lookup.email)) return invalidWork(row, claim, dependencies);
    if (!await dependencies.repository.resolveRecipient(row.id, claim.processingToken, lookup.email)) return { kind: "stale_claim" };
    row = { ...row, recipientEmail: lookup.email };
    const afterResolve = await boundaryOrBudget(row, claim, dependencies);
    if (afterResolve) return afterResolve;
  } else if (!row.recipientEmail) {
    return invalidWork(row, claim, dependencies);
  }

  if (row.eventType === "invitation") {
    if (!row.sourceId) return invalidWork(row, claim, dependencies);
    const beforeSource = await boundaryOrBudget(row, claim, dependencies);
    if (beforeSource) return beforeSource;
    let sendability;
    try {
      sendability = await dependencies.invitationSourceReader.getSendability(row.sourceId, dependencies.clock.now());
    } catch {
      sendability = { kind: "error" } as const;
    }
    const afterSource = await boundaryOrBudget(row, claim, dependencies);
    if (afterSource) return afterSource;
    if (sendability.kind !== "sendable" && isAmbiguous(row, claim)) {
      return deferAmbiguity(row, claim, dependencies, row.providerIdempotencyExpiresAt);
    }
    if (sendability.kind === "error") {
      return staleUnless(
        await dependencies.repository.requeue(row.id, claim.processingToken, atBackoff(dependencies.clock.now(), row, RECIPIENT_ERROR_BACKOFF_MS), "recipient_lookup_failed"),
        { kind: "requeued", errorCode: "recipient_lookup_failed" },
      );
    }
    if (sendability.kind !== "sendable") {
      return staleUnless(
        await dependencies.repository.suppressClaimed(row.id, claim.processingToken, "invitation_not_pending"),
        { kind: "suppressed" },
      );
    }
  }

  const prepared = await prepareRequest(row, claim, dependencies);
  if (!("idempotencyKey" in prepared)) return prepared;
  const request = prepared;
  const provider = dependencies.provider;
  let ambiguous = isAmbiguous(row, claim);
  let expiry = row.providerIdempotencyExpiresAt;

  for (let attemptIndex = 0; attemptIndex < QUICK_DELAYS_MS.length; attemptIndex += 1) {
    const delay = QUICK_DELAYS_MS[attemptIndex];
    if (delay > 0) await dependencies.clock.sleep(delay);
    const now = dependencies.clock.now();
    if (!hasCallBudget(now, claim, dependencies, ambiguous ? expiry : null)) {
      return ambiguous
        ? deferAmbiguity(row, claim, dependencies, expiry)
        : release(row, claim, dependencies, { kind: "released_insufficient_time" });
    }

    expiry = computedExpiry(row, now, provider, ambiguous);
    if (expiry <= now) {
      return expireClaimed(row, claim, dependencies, "provider_idempotency_expired");
    }
    if (!hasCallBudget(now, claim, dependencies, expiry)) {
      return ambiguous
        ? deferAmbiguity(row, claim, dependencies, expiry)
        : release(row, claim, dependencies, { kind: "released_insufficient_time" });
    }
    if (!await dependencies.repository.beginProviderCall(row.id, claim.processingToken, expiry)) return { kind: "stale_claim" };

    // The begin transition makes the outcome potentially ambiguous. Re-read
    // time and never release or transmit if any call budget disappeared while
    // the durable phase changed to in_flight.
    const afterBegin = dependencies.clock.now();
    const activeBoundary = new Date(row.createdAt.getTime() + MAX_ACTIVE_AGE_MS);
    if (afterBegin >= activeBoundary) {
      return expireClaimed(row, claim, dependencies, "active_retention_expired");
    }
    if (afterBegin >= expiry) {
      return expireClaimed(row, claim, dependencies, "provider_idempotency_expired");
    }
    const requiredUntil = afterBegin.getTime() + provider.timeoutMs + dependencies.safetyMarginMs;
    if (requiredUntil > activeBoundary.getTime()
      || !hasCallBudget(afterBegin, claim, dependencies, expiry)) {
      return deferAmbiguity(row, claim, dependencies, expiry);
    }

    let outcome: ProviderOutcome;
    try {
      outcome = await provider.send(request, { timeoutMs: provider.timeoutMs });
    } catch {
      outcome = { kind: "uncertain", errorCode: "provider_timeout" };
    }

    if (outcome.kind === "sent") {
      return staleUnless(
        await dependencies.repository.markSent(row.id, claim.processingToken, outcome.providerId),
        { kind: "sent" },
      );
    }
    if (outcome.kind === "uncertain") return deferAmbiguity(row, claim, dependencies, expiry);

    const handled = await handleDefinitiveFailure(row, claim, dependencies, outcome, ambiguous, expiry, attemptIndex);
    if (handled) return handled;
    ambiguous = false;
  }

  return { kind: "stale_claim" };
}
