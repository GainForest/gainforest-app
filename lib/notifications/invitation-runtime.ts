import "server-only";

import { randomUUID } from "node:crypto";
import { SupabaseInvitationSourceReader } from "./invitation-source";
import { createNotificationProcessor, processNotificationById } from "./orchestrator";
import { ApplicationNotificationRenderer } from "./renderer";
import { createNotificationRuntimeCore } from "./runtime";
import type { UserEmailReader } from "./types";

type Environment = Readonly<Record<string, string | undefined>>;
const WORKER_SAFETY_MARGIN_MS = 2_000;
const PROCESSING_LEASE_SECONDS = 120;
const unusedUserEmailReader: UserEmailReader = { lookup: async () => ({ kind: "error" }) };

export function createInvitationRuntime(environment: Environment = process.env) {
  const { config, repository, provider, clock, from } = createNotificationRuntimeCore(environment);
  const processor = createNotificationProcessor({
    mode: config.deliveryMode,
    from,
    repository,
    provider,
    renderer: new ApplicationNotificationRenderer(),
    clock,
    userEmailReader: unusedUserEmailReader,
    invitationSourceReader: new SupabaseInvitationSourceReader(),
    safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
  });

  return {
    config,
    process: (outboxId: string, invocationDeadline: Date) => processNotificationById(
      outboxId,
      invocationDeadline,
      { config, clock, repository, processor, tokenFactory: randomUUID },
      { leaseSeconds: PROCESSING_LEASE_SECONDS, safetyMarginMs: WORKER_SAFETY_MARGIN_MS },
    ),
  };
}
