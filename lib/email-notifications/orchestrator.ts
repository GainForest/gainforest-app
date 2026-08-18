import "server-only";

import type { NotificationConfig } from "./config";
import { processNotificationClaim, type NotificationWorkerDependencies } from "./worker";
import type {
  Claim,
  Clock,
  NotificationCleanupResult,
  NotificationOrchestrationRepository,
  ProcessResult,
} from "./types";

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_CLEANUP_BATCH_SIZE = 500;
const DEFAULT_SAFETY_MARGIN_MS = 5_000;
const MAX_BATCH_SIZE = 20;
const MAX_CONCURRENCY = 4;
const MAX_LEASE_SECONDS = 300;
const MAX_CLEANUP_BATCH_SIZE = 500;

type OutcomeKind = ProcessResult["kind"] | "unexpected_failure";

export interface NotificationProcessor {
  (claim: Claim, invocationDeadline: Date): Promise<ProcessResult>;
}

export function createNotificationProcessor(
  dependencies: Omit<NotificationWorkerDependencies, "invocationDeadline">,
): NotificationProcessor {
  return (claim, invocationDeadline) => processNotificationClaim(claim, { ...dependencies, invocationDeadline });
}

export interface NotificationOrchestratorDependencies {
  readonly config: NotificationConfig;
  readonly clock: Pick<Clock, "now">;
  readonly repository: NotificationOrchestrationRepository;
  readonly processor: NotificationProcessor;
  readonly tokenFactory: () => string;
  readonly log?: (summary: DrainCompleted) => void;
}

export interface NotificationOrchestratorOptions {
  readonly batchSize?: number;
  readonly concurrency?: number;
  readonly leaseSeconds?: number;
  readonly cleanupBatchSize?: number;
  readonly safetyMarginMs?: number;
}

export type ProcessOneOutcome =
  | { readonly kind: "disabled" | "deadline" | "no_claim" }
  | { readonly kind: "processed"; readonly result: ProcessResult }
  | { readonly kind: "unexpected_failure" };

export interface DrainCompleted {
  readonly kind: "completed";
  readonly claimed: number;
  readonly cleanup: NotificationCleanupResult;
  readonly outcomes: Readonly<Record<OutcomeKind, number>>;
  readonly stopped: "empty" | "batch_limit" | "deadline" | "insufficient_time" | "duplicate_claim" | "disabled";
  readonly elapsedMs: number;
}

export type DrainOutcome = { readonly kind: "disabled" } | DrainCompleted;

interface ResolvedOptions {
  readonly batchSize: number;
  readonly concurrency: number;
  readonly leaseSeconds: number;
  readonly cleanupBatchSize: number;
  readonly safetyMarginMs: number;
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Notification orchestrator ${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function options(input: NotificationOrchestratorOptions = {}): ResolvedOptions {
  return {
    batchSize: boundedInteger("batchSize", input.batchSize ?? DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE),
    concurrency: boundedInteger("concurrency", input.concurrency ?? DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY),
    leaseSeconds: boundedInteger("leaseSeconds", input.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 1, MAX_LEASE_SECONDS),
    cleanupBatchSize: boundedInteger("cleanupBatchSize", input.cleanupBatchSize ?? DEFAULT_CLEANUP_BATCH_SIZE, 1, MAX_CLEANUP_BATCH_SIZE),
    safetyMarginMs: boundedInteger("safetyMarginMs", input.safetyMarginMs ?? DEFAULT_SAFETY_MARGIN_MS, 0, 60_000),
  };
}

function validDeadline(deadline: Date): void {
  if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) {
    throw new Error("Notification orchestrator invocation deadline must be a valid Date.");
  }
}

function hasTime(clock: Pick<Clock, "now">, deadline: Date, safetyMarginMs: number): boolean {
  return deadline.getTime() - clock.now().getTime() > safetyMarginMs;
}

function deliveryDisabled(config: NotificationConfig): boolean {
  return config.emailDisabled;
}

function emptyOutcomes(): Record<OutcomeKind, number> {
  return {
    sent: 0,
    requeued: 0,
    waiting_recipient: 0,
    ambiguous_deferred: 0,
    dead: 0,
    suppressed: 0,
    released_insufficient_time: 0,
    stale_claim: 0,
    unexpected_failure: 0,
  };
}

async function safelyReleaseIdleClaim(
  claim: Claim,
  dependencies: NotificationOrchestratorDependencies,
): Promise<void> {
  if (claim.resumeProviderCallPhase !== "idle" || deliveryDisabled(dependencies.config)) return;
  await dependencies.repository.releaseClaim(claim.outboxId, claim.processingToken).catch(() => false);
}

export async function processNotificationById(
  outboxId: string,
  invocationDeadline: Date,
  dependencies: NotificationOrchestratorDependencies,
  inputOptions: Pick<NotificationOrchestratorOptions, "leaseSeconds" | "safetyMarginMs"> = {},
): Promise<ProcessOneOutcome> {
  const resolved = options(inputOptions);
  validDeadline(invocationDeadline);
  if (deliveryDisabled(dependencies.config)) return { kind: "disabled" };
  if (!hasTime(dependencies.clock, invocationDeadline, resolved.safetyMarginMs)) return { kind: "deadline" };
  const token = dependencies.tokenFactory();
  const owned = await dependencies.repository.claimOne(outboxId, token, resolved.leaseSeconds);
  if (!owned) return { kind: "no_claim" };
  try {
    return { kind: "processed", result: await dependencies.processor(owned, invocationDeadline) };
  } catch {
    await safelyReleaseIdleClaim(owned, dependencies);
    return { kind: "unexpected_failure" };
  }
}

interface DrainState {
  readonly startedAt: Date;
  readonly outcomes: Record<OutcomeKind, number>;
  readonly seen: Set<string>;
  cleanup: NotificationCleanupResult;
  claimed: number;
  stopped: DrainCompleted["stopped"];
}

type BatchStop = "empty" | "batch_limit" | "insufficient_time" | "duplicate_claim";

function emptyCleanup(): NotificationCleanupResult {
  return { activeExpired: 0, redacted: 0, deleted: 0 };
}

function createDrainState(startedAt: Date): DrainState {
  return {
    startedAt,
    outcomes: emptyOutcomes(),
    seen: new Set<string>(),
    cleanup: emptyCleanup(),
    claimed: 0,
    stopped: "empty",
  };
}

function finishDrain(
  state: DrainState,
  dependencies: NotificationOrchestratorDependencies,
): DrainCompleted {
  const result: DrainCompleted = {
    kind: "completed",
    claimed: state.claimed,
    cleanup: state.cleanup,
    outcomes: state.outcomes,
    stopped: state.stopped,
    elapsedMs: Math.max(0, dependencies.clock.now().getTime() - state.startedAt.getTime()),
  };
  dependencies.log?.(result);
  return result;
}

async function filterFreshClaims(
  batch: readonly Claim[],
  state: DrainState,
  dependencies: NotificationOrchestratorDependencies,
): Promise<{ readonly claims: Claim[]; readonly duplicateFound: boolean }> {
  const claims: Claim[] = [];
  let duplicateFound = false;
  for (const row of batch) {
    if (state.seen.has(row.outboxId)) {
      await safelyReleaseIdleClaim(row, dependencies);
      duplicateFound = true;
      continue;
    }
    state.seen.add(row.outboxId);
    claims.push(row);
  }
  return { claims, duplicateFound };
}

async function processClaimBatch(
  claims: readonly Claim[],
  invocationDeadline: Date,
  dependencies: NotificationOrchestratorDependencies,
): Promise<Array<ProcessResult | null>> {
  return Promise.all(claims.map(async claim => {
    try {
      return await dependencies.processor(claim, invocationDeadline);
    } catch {
      await safelyReleaseIdleClaim(claim, dependencies);
      return null;
    }
  }));
}

function recordBatchResults(results: readonly (ProcessResult | null)[], state: DrainState): boolean {
  let insufficientTime = false;
  for (const result of results) {
    if (!result) {
      state.outcomes.unexpected_failure += 1;
      continue;
    }
    state.outcomes[result.kind] += 1;
    if (result.kind === "released_insufficient_time") insufficientTime = true;
  }
  return insufficientTime;
}

async function processNextDrainBatch(
  invocationDeadline: Date,
  dependencies: NotificationOrchestratorDependencies,
  resolved: ResolvedOptions,
  state: DrainState,
): Promise<BatchStop | null> {
  const requested = Math.min(resolved.concurrency, resolved.batchSize - state.claimed);
  const batch = await dependencies.repository.claimDue(requested, resolved.leaseSeconds);
  if (batch.length === 0) return "empty";
  if (batch.length > requested) {
    await Promise.all(batch.map(claim => safelyReleaseIdleClaim(claim, dependencies)));
    throw new Error("Notification repository returned more claims than requested. Verify the committed claim RPC contract.");
  }

  const { claims, duplicateFound } = await filterFreshClaims(batch, state, dependencies);
  if (claims.length === 0) return "duplicate_claim";

  const results = await processClaimBatch(claims, invocationDeadline, dependencies);
  state.claimed += claims.length;
  if (recordBatchResults(results, state)) return "insufficient_time";
  if (duplicateFound) return "duplicate_claim";
  if (state.claimed >= resolved.batchSize) return "batch_limit";
  return null;
}

function stopBeforeNextBatch(
  invocationDeadline: Date,
  dependencies: NotificationOrchestratorDependencies,
  safetyMarginMs: number,
): "disabled" | "deadline" | null {
  if (deliveryDisabled(dependencies.config)) return "disabled";
  if (!hasTime(dependencies.clock, invocationDeadline, safetyMarginMs)) return "deadline";
  return null;
}

export async function drainNotifications(
  invocationDeadline: Date,
  dependencies: NotificationOrchestratorDependencies,
  inputOptions: NotificationOrchestratorOptions = {},
): Promise<DrainOutcome> {
  const resolved = options(inputOptions);
  validDeadline(invocationDeadline);
  if (deliveryDisabled(dependencies.config)) return { kind: "disabled" };

  const state = createDrainState(dependencies.clock.now());
  if (!hasTime(dependencies.clock, invocationDeadline, resolved.safetyMarginMs)) {
    state.stopped = "deadline";
    return finishDrain(state, dependencies);
  }
  state.cleanup = await dependencies.repository.cleanup(resolved.cleanupBatchSize).catch(emptyCleanup);

  let loopCompleted = false;
  try {
    while (state.claimed < resolved.batchSize) {
      const earlyStop = stopBeforeNextBatch(invocationDeadline, dependencies, resolved.safetyMarginMs);
      if (earlyStop) {
        state.stopped = earlyStop;
        break;
      }
      const batchStop = await processNextDrainBatch(invocationDeadline, dependencies, resolved, state);
      if (batchStop) {
        state.stopped = batchStop;
        break;
      }
    }
    loopCompleted = true;
  } finally {
    if (!loopCompleted) finishDrain(state, dependencies);
  }

  return finishDrain(state, dependencies);
}
