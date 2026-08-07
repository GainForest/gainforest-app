import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseFilterValue, supabaseSelect } from "@/lib/supabase/rest";
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
import type { EventType, NotificationQueueHealth } from "./types";
import { SupabaseUserEmailReader } from "./user-email";

// Keep ownership beyond the 60-second route limit so platform termination does
// not immediately allow a second provider call with an uncertain first result.
const PROCESSING_LEASE_SECONDS = 120;
const WORKER_SAFETY_MARGIN_MS = 2_000;
type Environment = Readonly<Record<string, string | undefined>>;

export interface NotificationDelivery {
  process(outboxId: string, invocationDeadline: Date, expectedEventType?: EventType): Promise<ProcessOneOutcome>;
  drain(invocationDeadline: Date): Promise<DrainOutcome>;
  health(): Promise<NotificationQueueHealth>;
}

async function requireExpectedEvent(outboxId: string, expectedEventType: EventType): Promise<void> {
  let rows: Array<{ event_type?: unknown }>;
  try {
    rows = await supabaseSelect<{ event_type?: unknown }>(
      `/notification_outbox?select=event_type&id=eq.${supabaseFilterValue(outboxId)}&limit=1`,
    );
  } catch {
    throw new Error("Notification event type could not be verified. Check Supabase availability and try again.");
  }
  if (rows.length !== 1 || rows[0].event_type !== expectedEventType) {
    throw new Error(`Notification delivery expected event type ${expectedEventType}, but the outbox row is missing or has a different event type.`);
  }
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
    process: async (outboxId, invocationDeadline, expectedEventType) => {
      if (expectedEventType && !config.emailDisabled) await requireExpectedEvent(outboxId, expectedEventType);
      return processNotificationById(
        outboxId,
        invocationDeadline,
        dependencies,
        {
          leaseSeconds: PROCESSING_LEASE_SECONDS,
          safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
        },
      );
    },
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
