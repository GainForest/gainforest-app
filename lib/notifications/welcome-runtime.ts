import "server-only";

import { randomUUID } from "node:crypto";
import { processNotificationById, createNotificationProcessor } from "./orchestrator";
import { createNotificationRuntimeCore } from "./runtime";
import type { InvitationSourceReader, UserEmailReader } from "./types";
import { deliverWelcomeNotification, type WelcomeNotificationInput } from "./welcome";
import { WelcomeNotificationRenderer } from "./welcome-renderer";

const WORKER_SAFETY_MARGIN_MS = 2_000;
const PROCESSING_LEASE_SECONDS = 120;
type Environment = Readonly<Record<string, string | undefined>>;

const unusedUserEmailReader: UserEmailReader = {
  lookup: async () => ({ kind: "error" }),
};
const unusedInvitationReader: InvitationSourceReader = {
  getSendability: async () => ({ kind: "error" }),
};

export function createWelcomeRuntime(environment: Environment = process.env) {
  const { config, repository, provider, clock, from } = createNotificationRuntimeCore(environment);
  const processor = createNotificationProcessor({
    mode: config.deliveryMode,
    from,
    repository,
    provider,
    renderer: new WelcomeNotificationRenderer(),
    clock,
    userEmailReader: unusedUserEmailReader,
    invitationSourceReader: unusedInvitationReader,
    safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
  });
  const producer = { config, clock, repository };

  return {
    deliver: (input: WelcomeNotificationInput, invocationDeadline: Date) => deliverWelcomeNotification(
      input,
      invocationDeadline,
      {
        producer,
        processOne: (outboxId, deadline) => processNotificationById(outboxId, deadline, {
          config,
          clock,
          repository,
          processor,
          tokenFactory: randomUUID,
        }, {
          leaseSeconds: PROCESSING_LEASE_SECONDS,
          safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
        }),
      },
    ),
  };
}
