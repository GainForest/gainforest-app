import "server-only";

import type { NotificationConfig } from "./config";
import type {
  Clock,
  Json,
  NotificationEnqueueInput,
  NotificationEnqueueRepository,
  NotificationEnqueueResult,
} from "./types";

export class NotificationProducerInputError extends Error {
  readonly field: string;

  constructor(event: "signup" | "membership", field: string, guidance: string) {
    super(`Notification ${event} input has an invalid ${field}. ${guidance}`);
    this.name = "NotificationProducerInputError";
    this.field = field;
  }
}

export interface WelcomeProducerDependencies {
  readonly config: NotificationConfig;
  readonly clock: Pick<Clock, "now">;
  readonly repository: NotificationEnqueueRepository;
}

export interface SignupNotificationInput {
  readonly authEventId: string;
  readonly userDid: string;
  readonly email: string;
  readonly name?: string;
  readonly locale?: string;
  readonly createdAt?: string;
}

export interface MembershipJoinedNotificationInput extends SignupNotificationInput {
  readonly organizationDid?: string;
  readonly organizationName?: string;
}

export type WelcomeEnqueueOutcome =
  | { readonly kind: "disabled" }
  | ({ readonly kind: "enqueued" } & NotificationEnqueueResult);

type WelcomeEvent = "signup" | "membership";

const WELCOME_PROVIDER_PREFIX = {
  signup: "signup:",
  membership: "organization-membership-joined:",
} as const satisfies Record<WelcomeEvent, string>;
const MAX_PROVIDER_KEY_LENGTH = 256;

function boundedIdentifier(event: WelcomeEvent, field: string, value: string, maximum = 512): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim()) {
    throw new NotificationProducerInputError(event, field, `Supply 1 to ${maximum} characters without surrounding whitespace.`);
  }
  return value;
}

function did(event: WelcomeEvent, field: string, value: string): string {
  const normalized = boundedIdentifier(event, field, value, 256);
  if (!/^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(normalized)) {
    throw new NotificationProducerInputError(event, field, "Supply a valid bounded DID.");
  }
  return normalized;
}

function email(event: WelcomeEvent, value: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.length < 3 || normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new NotificationProducerInputError(event, "email", "Supply a normalized deliverable address.");
  }
  return normalized;
}

function optionalText(event: WelcomeEvent, field: string, value: string | null | undefined, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximum) {
    throw new NotificationProducerInputError(event, field, `Supply at most ${maximum} characters.`);
  }
  return normalized;
}

function eventTime(event: WelcomeEvent, value: string | undefined, receiptTime: Date): string {
  if (value === undefined) return receiptTime.toISOString();
  if (value.length > 64) {
    throw new NotificationProducerInputError(event, "createdAt", "Supply a valid event timestamp of at most 64 characters.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new NotificationProducerInputError(event, "createdAt", "Supply a valid event timestamp of at most 64 characters.");
  }
  return parsed.toISOString();
}

async function enqueue(
  dependencies: WelcomeProducerDependencies,
  input: Omit<NotificationEnqueueInput, "deliveryMode" | "nextAttemptAt">,
  nextAttemptAt: Date,
): Promise<WelcomeEnqueueOutcome> {
  if (dependencies.config.deliveryMode === "disabled") return { kind: "disabled" };
  const result = await dependencies.repository.enqueue({
    ...input,
    deliveryMode: dependencies.config.deliveryMode,
    nextAttemptAt,
  });
  return { kind: "enqueued", ...result };
}

export async function enqueueSignup(
  input: SignupNotificationInput,
  dependencies: WelcomeProducerDependencies,
): Promise<WelcomeEnqueueOutcome> {
  if (dependencies.config.deliveryMode === "disabled" || !dependencies.config.producers.signup) {
    return { kind: "disabled" };
  }
  const receiptTime = dependencies.clock.now();
  const providerPrefix = WELCOME_PROVIDER_PREFIX.signup;
  const eventId = boundedIdentifier(
    "signup",
    "authEventId",
    input.authEventId,
    MAX_PROVIDER_KEY_LENGTH - providerPrefix.length,
  );
  const userDid = did("signup", "userDid", input.userDid);
  const payload: Json = {
    displayName: optionalText("signup", "name", input.name, 200),
    occurredAt: eventTime("signup", input.createdAt, receiptTime),
    userDid,
  };
  return enqueue(dependencies, {
    eventKey: `signup:${eventId}`,
    eventType: "signup",
    payload,
    sourceId: eventId,
    recipientDid: userDid,
    recipientEmail: email("signup", input.email),
    templateKey: "welcome-signup",
    locale: optionalText("signup", "locale", input.locale, 35),
    providerIdempotencyKey: `${providerPrefix}${eventId}`,
  }, receiptTime);
}

export async function enqueueMembershipJoined(
  input: MembershipJoinedNotificationInput,
  dependencies: WelcomeProducerDependencies,
): Promise<WelcomeEnqueueOutcome> {
  if (dependencies.config.deliveryMode === "disabled" || !dependencies.config.producers.membershipJoined) {
    return { kind: "disabled" };
  }
  const receiptTime = dependencies.clock.now();
  const providerPrefix = WELCOME_PROVIDER_PREFIX.membership;
  const eventId = boundedIdentifier(
    "membership",
    "authEventId",
    input.authEventId,
    MAX_PROVIDER_KEY_LENGTH - providerPrefix.length,
  );
  const userDid = did("membership", "userDid", input.userDid);
  const organizationDid = input.organizationDid === undefined
    ? null
    : did("membership", "organizationDid", input.organizationDid);
  const payload: Json = {
    displayName: optionalText("membership", "name", input.name, 200),
    occurredAt: eventTime("membership", input.createdAt, receiptTime),
    organizationDid,
    organizationName: optionalText("membership", "organizationName", input.organizationName, 200),
    userDid,
  };
  return enqueue(dependencies, {
    eventKey: `organization-membership-joined:${eventId}`,
    eventType: "membership_joined",
    payload,
    sourceId: eventId,
    recipientDid: userDid,
    recipientEmail: email("membership", input.email),
    templateKey: "welcome-membership-joined",
    locale: optionalText("membership", "locale", input.locale, 35),
    providerIdempotencyKey: `${providerPrefix}${eventId}`,
  }, receiptTime);
}
