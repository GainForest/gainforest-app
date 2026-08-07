import "server-only";

import { randomUUID } from "node:crypto";
import { SupabaseInvitationSourceReader } from "./invitation-source";
import {
  createNotificationProcessor,
  drainNotifications,
  processNotificationById,
  type DrainOutcome,
  type NotificationProcessor,
  type ProcessOneOutcome,
} from "./orchestrator";
import { ApplicationNotificationRenderer } from "./renderer";
import {
  createNotificationRuntimeCore,
  rejectDisabledNotificationProcessing,
  type NotificationRuntimeCore,
} from "./runtime";
import type { NotificationQueueHealth } from "./types";
import { SupabaseUserEmailReader } from "./user-email";

const PROCESSING_LEASE_SECONDS = 120;
const WORKER_SAFETY_MARGIN_MS = 2_000;
type Environment = Readonly<Record<string, string | undefined>>;

export interface NotificationDelivery {
  process(outboxId: string, invocationDeadline: Date): Promise<ProcessOneOutcome>;
  drain(invocationDeadline: Date): Promise<DrainOutcome>;
  health(): Promise<NotificationQueueHealth>;
}

export function createNotificationDeliveryFromCore(
  core: NotificationRuntimeCore,
): NotificationDelivery {
  const { config, repository, provider, clock, from } = core;
  const processor: NotificationProcessor = provider
    ? createNotificationProcessor({
      from,
      repository,
      provider,
      renderer: new ApplicationNotificationRenderer(),
      clock,
      userEmailReader: new SupabaseUserEmailReader(),
      invitationSourceReader: new SupabaseInvitationSourceReader(),
      safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
    })
    : rejectDisabledNotificationProcessing;
  const dependencies = { config, clock, repository, processor, tokenFactory: randomUUID };

  return {
    process: (outboxId, invocationDeadline) => processNotificationById(
      outboxId,
      invocationDeadline,
      dependencies,
      {
        leaseSeconds: PROCESSING_LEASE_SECONDS,
        safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
      },
    ),
    drain: invocationDeadline => drainNotifications(invocationDeadline, {
      ...dependencies,
      log: summary => console.info(JSON.stringify({ event: "notification_drain", ...summary })),
    }),
    health: () => repository.health(),
  };
}

export function createNotificationDelivery(
  environment: Environment = process.env,
): NotificationDelivery {
  return createNotificationDeliveryFromCore(createNotificationRuntimeCore(environment));
}
