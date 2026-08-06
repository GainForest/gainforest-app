import "server-only";

import type { DeliveryMode } from "./types";

export interface NotificationConfig {
  readonly deliveryMode: DeliveryMode;
  readonly producers: {
    readonly signup: boolean;
    readonly membershipJoined: boolean;
    readonly invitation: boolean;
    readonly bioblitzWinner: boolean;
  };
}

type Environment = Readonly<Record<string, string | undefined>>;

function mode(value: string | undefined): DeliveryMode {
  const parsed = value?.trim() || "disabled";
  if (parsed === "disabled" || parsed === "capture" || parsed === "resend") return parsed;
  throw new Error(`EMAIL_DELIVERY_MODE must be one of disabled, capture, or resend; received ${JSON.stringify(parsed)}`);
}

function flag(environment: Environment, name: string): boolean {
  const value = environment[name]?.trim();
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be exactly true or false; received ${JSON.stringify(value)}`);
}

export function readNotificationConfig(environment: Environment = process.env): NotificationConfig {
  return {
    deliveryMode: mode(environment.EMAIL_DELIVERY_MODE),
    producers: {
      signup: flag(environment, "EMAIL_SIGNUP_ENABLED"),
      membershipJoined: flag(environment, "EMAIL_MEMBERSHIP_JOINED_ENABLED"),
      invitation: flag(environment, "EMAIL_INVITATION_ENABLED"),
      bioblitzWinner: flag(environment, "EMAIL_BIOBLITZ_WINNER_ENABLED"),
    },
  };
}
