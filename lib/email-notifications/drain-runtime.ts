import "server-only";

import { randomUUID } from "node:crypto";
import { SupabaseInvitationSourceReader } from "./invitation-source";
import { drainNotifications, createNotificationProcessor } from "./orchestrator";
import { ApplicationNotificationRenderer } from "./renderer";
import { createNotificationRuntimeCore } from "./runtime";
import { SupabaseUserEmailReader } from "./user-email";

type Environment = Readonly<Record<string, string | undefined>>;
const WORKER_SAFETY_MARGIN_MS = 2_000;

export function createDrainRuntime(environment: Environment = process.env) {
  const { config, repository, provider, clock, from } = createNotificationRuntimeCore(environment);
  const processor = provider
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
    : async () => ({ kind: "disabled" } as const);

  return {
    drain: (invocationDeadline: Date) => drainNotifications(invocationDeadline, {
      config,
      clock,
      repository,
      processor,
      tokenFactory: randomUUID,
      log: summary => console.info(JSON.stringify({ event: "notification_drain", ...summary })),
    }),
  };
}
