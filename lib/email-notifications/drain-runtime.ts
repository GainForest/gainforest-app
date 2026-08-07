import "server-only";

import { randomUUID } from "node:crypto";
import {
  drainNotifications,
  createNotificationProcessor,
  type NotificationProcessor,
} from "./orchestrator";
import { createNotificationRuntimeCore } from "./runtime";
import type { InvitationSourceReader, UserEmailReader } from "./types";
import { WelcomeNotificationRenderer } from "./welcome-renderer";

type Environment = Readonly<Record<string, string | undefined>>;
const WORKER_SAFETY_MARGIN_MS = 2_000;

const userEmailReader: UserEmailReader = {
  lookup: async () => ({ kind: "error" }),
};
const invitationReader: InvitationSourceReader = {
  getSendability: async () => ({ kind: "error" }),
};

export function createDrainRuntime(environment: Environment = process.env) {
  const { config, repository, provider, clock, from } = createNotificationRuntimeCore(environment);
  const processor: NotificationProcessor = provider
    ? createNotificationProcessor({
      from,
      repository,
      provider,
      renderer: new WelcomeNotificationRenderer(),
      clock,
      userEmailReader,
      invitationSourceReader: invitationReader,
      safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
    })
    : async () => {
      throw new Error("Notification processor cannot run while email delivery is disabled.");
    };

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
