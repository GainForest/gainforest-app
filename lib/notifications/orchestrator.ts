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

export async function drainNotifications(
  invocationDeadline: Date,
  dependencies: NotificationOrchestratorDependencies,
  inputOptions: NotificationOrchestratorOptions = {},
): Promise<DrainOutcome> {
  const resolved = options(inputOptions);
  validDeadline(invocationDeadline);
  if (deliveryDisabled(dependencies.config)) return { kind: "disabled" };

  const startedAt = dependencies.clock.now();
  const outcomes = emptyOutcomes();
  const noCleanup: NotificationCleanupResult = { activeExpired: 0, redacted: 0, deleted: 0 };
  let cleanup = noCleanup;
  let claimed = 0;
  let stopped: DrainCompleted["stopped"] = "empty";
  const seen = new Set<string>();

  const finish = (): DrainCompleted => {
    const result: DrainCompleted = {
      kind: "completed",
      claimed,
      cleanup,
      outcomes,
      stopped,
      elapsedMs: Math.max(0, dependencies.clock.now().getTime() - startedAt.getTime()),
    };
    dependencies.log?.(result);
    return result;
  };

  if (!hasTime(dependencies.clock, invocationDeadline, resolved.safetyMarginMs)) {
    stopped = "deadline";
    return finish();
  }
  cleanup = await dependencies.repository.cleanup(resolved.cleanupBatchSize).catch(() => noCleanup);

  let loopCompleted = false;
  try {
    while (claimed < resolved.batchSize) {
      if (deliveryDisabled(dependencies.config)) {
        stopped = "disabled";
        break;
      }
      if (!hasTime(dependencies.clock, invocationDeadline, resolved.safetyMarginMs)) {
        stopped = "deadline";
        break;
      }
      const requested = Math.min(resolved.concurrency, resolved.batchSize - claimed);
      const batch = await dependencies.repository.claimDue(requested, resolved.leaseSeconds);
      if (batch.length === 0) {
        stopped = "empty";
        break;
      }
      if (batch.length > requested) {
        await Promise.all(batch.map(row => safelyReleaseIdleClaim(row, dependencies)));
        throw new Error("Notification repository returned more claims than requested. Verify the committed claim RPC contract.");
      }

      const fresh: Claim[] = [];
      for (const row of batch) {
        if (seen.has(row.outboxId)) {
          await safelyReleaseIdleClaim(row, dependencies);
          stopped = "duplicate_claim";
          continue;
        }
        seen.add(row.outboxId);
        fresh.push(row);
      }
      if (fresh.length === 0) break;

      const results = await Promise.all(fresh.map(async row => {
        try {
          return await dependencies.processor(row, invocationDeadline);
        } catch {
          await safelyReleaseIdleClaim(row, dependencies);
          return null;
        }
      }));
      claimed += fresh.length;

      let insufficientTime = false;
      for (const result of results) {
        if (!result) {
          outcomes.unexpected_failure += 1;
          continue;
        }
        outcomes[result.kind] += 1;
        if (result.kind === "released_insufficient_time") insufficientTime = true;
      }
      if (insufficientTime) {
        stopped = "insufficient_time";
        break;
      }
      if (stopped === "duplicate_claim") break;
      if (claimed >= resolved.batchSize) {
        stopped = "batch_limit";
        break;
      }
    }
    loopCompleted = true;
  } finally {
    if (!loopCompleted) finish();
  }

  return finish();
}
