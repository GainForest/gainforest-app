import "server-only";

import type { ProcessOneOutcome } from "./orchestrator";
import {
  enqueueMembershipJoined,
  enqueueSignup,
  type WelcomeProducerDependencies,
} from "./signup-and-membership-notifications";
import type { NotificationErrorCode, OutboxStatus, ProcessResult } from "./types";

export type WelcomeNotificationInput = {
  readonly authEventId: string;
  readonly userDid: string;
  readonly email: string;
  readonly name?: string;
  readonly locale?: string;
  readonly createdAt?: string;
} & (
  | { readonly type: "signup" }
  | {
    readonly type: "membership_joined";
    readonly organizationDid?: string;
    readonly organizationName?: string;
  }
);

export interface WelcomeNotificationDependencies {
  readonly producer: WelcomeProducerDependencies;
  readonly processOne: (outboxId: string, invocationDeadline: Date) => Promise<ProcessOneOutcome>;
}

export type WelcomeNotificationOutcome =
  | { readonly kind: "disabled" }
  | {
    readonly kind: "durable";
    readonly outboxId: string;
    readonly status: OutboxStatus;
    readonly duplicate: boolean;
    readonly retryable: boolean;
    readonly errorCode?: NotificationErrorCode;
  };

function processSummary(result: ProcessResult): {
  readonly status: OutboxStatus;
  readonly retryable: boolean;
  readonly errorCode?: NotificationErrorCode;
} {
  switch (result.kind) {
    case "sent":
      return { status: "sent", retryable: false };
    case "requeued":
      return { status: "queued", retryable: true, errorCode: result.errorCode };
    case "waiting_recipient":
      return { status: "waiting_recipient", retryable: true, errorCode: result.errorCode };
    case "ambiguous_deferred":
      return { status: "processing", retryable: true };
    case "dead":
      return { status: "dead", retryable: false, errorCode: result.errorCode };
    case "suppressed":
      return { status: "suppressed", retryable: false };
    case "released_insufficient_time":
      return { status: "queued", retryable: true };
    case "stale_claim":
      return { status: "processing", retryable: true };
  }
}

function processOneSummary(result: ProcessOneOutcome): {
  readonly status: OutboxStatus;
  readonly retryable: boolean;
  readonly errorCode?: NotificationErrorCode;
} {
  if (result.kind === "processed") return processSummary(result.result);
  if (result.kind === "deadline" || result.kind === "disabled") return { status: "queued", retryable: true };
  return { status: "processing", retryable: true };
}

export async function deliverWelcomeNotification(
  input: WelcomeNotificationInput,
  invocationDeadline: Date,
  dependencies: WelcomeNotificationDependencies,
): Promise<WelcomeNotificationOutcome> {
  const queued = input.type === "signup"
    ? await enqueueSignup(input, dependencies.producer)
    : await enqueueMembershipJoined(input, dependencies.producer);
  if (queued.kind === "disabled") return queued;

  if (queued.status !== "queued" && queued.status !== "waiting_recipient") {
    return {
      kind: "durable",
      outboxId: queued.outboxId,
      status: queued.status,
      duplicate: queued.duplicate,
      retryable: queued.status === "processing",
    };
  }

  const processed = await dependencies.processOne(queued.outboxId, invocationDeadline);
  return {
    kind: "durable",
    outboxId: queued.outboxId,
    duplicate: queued.duplicate,
    ...processOneSummary(processed),
  };
}
