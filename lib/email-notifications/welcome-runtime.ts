import "server-only";

import { createNotificationDeliveryFromCore } from "./delivery";
import { createNotificationRuntimeCore } from "./runtime";
import { deliverWelcomeNotification, type WelcomeNotificationInput } from "./welcome";

type Environment = Readonly<Record<string, string | undefined>>;

export function createWelcomeRuntime(environment: Environment = process.env) {
  const core = createNotificationRuntimeCore(environment);
  const delivery = createNotificationDeliveryFromCore(core);
  const producer = { config: core.config, clock: core.clock, repository: core.repository };

  return {
    deliver: (input: WelcomeNotificationInput, invocationDeadline: Date) => deliverWelcomeNotification(
      input,
      invocationDeadline,
      {
        producer,
        processOne: delivery.process,
      },
    ),
  };
}
