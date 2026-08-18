import "server-only";

import { enqueueBioblitzWinner, type BioblitzWinnerInput } from "./bioblitz";
import { readNotificationConfig } from "./config";
import { SupabaseNotificationRepository } from "./repository";
import { systemNotificationClock } from "./runtime";
import { SupabaseUserEmailReader } from "./user-email";

type Environment = Readonly<Record<string, string | undefined>>;

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
