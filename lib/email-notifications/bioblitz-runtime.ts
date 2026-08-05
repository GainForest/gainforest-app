import "server-only";

import { randomUUID } from "node:crypto";
import { enqueueBioblitzWinner, type BioblitzWinnerInput } from "./bioblitz";
import { readNotificationConfig } from "./config";
import { SupabaseInvitationSourceReader } from "./invitation-source";
import { createNotificationProcessor, processNotificationById } from "./orchestrator";
import { ApplicationNotificationRenderer } from "./renderer";
import { SupabaseNotificationRepository } from "./repository";
import { createNotificationRuntimeCore, systemNotificationClock } from "./runtime";
import { SupabaseUserEmailReader } from "./user-email";

type Environment = Readonly<Record<string, string | undefined>>;
const WORKER_SAFETY_MARGIN_MS = 2_000;

export function createBioblitzProducerRuntime(environment: Environment = process.env) {
  const config = readNotificationConfig(environment);
  const repository = new SupabaseNotificationRepository();
  const userEmailReader = new SupabaseUserEmailReader();
  return {
    config,
    enqueue: (input: BioblitzWinnerInput) => enqueueBioblitzWinner(input, {
      config,
      repository,
      userEmailReader,
      clock: systemNotificationClock,
    }),
  };
}

export function createBioblitzProcessRuntime(environment: Environment = process.env) {
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
    process: (outboxId: string, deadline: Date) => processNotificationById(outboxId, deadline, {
      config,
      clock,
      repository,
      processor,
      tokenFactory: randomUUID,
    }, { leaseSeconds: 120, safetyMarginMs: WORKER_SAFETY_MARGIN_MS }),
  };
}
