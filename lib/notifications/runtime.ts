import "server-only";

import { readNotificationConfig, type NotificationConfig } from "./config";
import { createEmailProvider, InMemoryCaptureSink } from "./provider";
import { SupabaseNotificationRepository } from "./repository";
import { ResendEmailProvider } from "./resend-provider";
import type { Clock, EmailProvider } from "./types";

const DEFAULT_EMAIL_FROM = "GainForest <noreply@gainforest.id>";
const captureSink = new InMemoryCaptureSink();
type Environment = Readonly<Record<string, string | undefined>>;

export const systemNotificationClock: Clock = {
  now: () => new Date(),
  sleep: async (milliseconds, signal) => {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      let timer: ReturnType<typeof setTimeout>;
      const complete = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      timer = setTimeout(complete, milliseconds);
      signal?.addEventListener("abort", abort, { once: true });
    });
  },
};

export interface NotificationRuntimeCore {
  readonly config: NotificationConfig;
  readonly repository: SupabaseNotificationRepository;
  readonly provider: EmailProvider | null;
  readonly clock: Clock;
  readonly from: string;
}

function emailFrom(environment: Environment): string {
  const value = environment.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
  if (value.length > 320 || /[\r\n\0]/.test(value)) {
    throw new Error("EMAIL_FROM must be a single valid email sender header of at most 320 characters.");
  }
  return value;
}

export function createNotificationRuntimeCore(environment: Environment = process.env): NotificationRuntimeCore {
  const config = readNotificationConfig(environment);
  const repository = new SupabaseNotificationRepository();
  const resendProvider = config.deliveryMode === "resend"
    ? new ResendEmailProvider({
      apiKey: environment.RESEND_API_KEY?.trim()
        || (() => { throw new Error("RESEND_API_KEY is required when EMAIL_DELIVERY_MODE=resend."); })(),
    })
    : undefined;
  return {
    config,
    repository,
    provider: createEmailProvider(config.deliveryMode, captureSink, resendProvider),
    clock: systemNotificationClock,
    from: emailFrom(environment),
  };
}
