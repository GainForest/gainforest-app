import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { NotificationConfig } from "./config";
import { enqueueMembershipJoined, enqueueSignup, NotificationProducerInputError } from "./outbox";

const NOW = new Date("2026-08-06T01:00:00.000Z");

function config(overrides: Partial<NotificationConfig["producers"]> = {}): NotificationConfig {
  return {
    deliveryMode: "capture",
    producers: {
      signup: false,
      membershipJoined: false,
      invitation: false,
      bioblitzWinner: false,
      ...overrides,
    },
  };
}

function dependencies(notificationConfig: NotificationConfig) {
  return {
    config: notificationConfig,
    clock: { now: () => NOW },
    repository: {
      enqueue: vi.fn().mockResolvedValue({
        outboxId: "10000000-0000-4000-8000-000000000001",
        status: "queued",
        duplicate: false,
      }),
    },
  };
}

describe("welcome notification enqueue boundaries", () => {
  it.each([
    ["global mode", { ...config({ signup: true }), deliveryMode: "disabled" as const }],
    ["signup feature", config()],
  ])("does not touch the repository when %s is disabled", async (_label, notificationConfig) => {
    const deps = dependencies(notificationConfig);
    await expect(enqueueSignup({
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: "USER@Example.com ",
      name: "River Keeper",
    }, deps)).resolves.toEqual({ kind: "disabled" });
    expect(deps.repository.enqueue).not.toHaveBeenCalled();
  });

  it("derives every immutable signup field and preserves the legacy auth event key", async () => {
    const deps = dependencies(config({ signup: true }));
    await expect(enqueueSignup({
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: " USER@Example.com ",
      name: " River Keeper ",
      locale: "en-BT",
      createdAt: "2026-08-06T01:00:00.000Z",
    }, deps)).resolves.toEqual({
      kind: "enqueued",
      outboxId: "10000000-0000-4000-8000-000000000001",
      status: "queued",
      duplicate: false,
    });

    expect(deps.repository.enqueue).toHaveBeenCalledWith({
      eventKey: "signup:auth-event-1",
      eventType: "signup",
      payload: {
        displayName: "River Keeper",
        occurredAt: "2026-08-06T01:00:00.000Z",
        userDid: "did:plc:user",
      },
      sourceId: "auth-event-1",
      recipientDid: "did:plc:user",
      recipientEmail: "user@example.com",
      templateKey: "welcome-signup",
      locale: "en-BT",
      deliveryMode: "capture",
      nextAttemptAt: NOW,
    });
  });

  it("derives membership fields without exposing arbitrary event or provider choices", async () => {
    const deps = dependencies(config({ membershipJoined: true }));
    await enqueueMembershipJoined({
      authEventId: "membership-event-1",
      userDid: "did:plc:user",
      email: "member@example.com",
      name: undefined,
      organizationDid: "did:plc:forest",
      organizationName: " Forest Circle ",
    }, deps);

    expect(deps.repository.enqueue).toHaveBeenCalledWith({
      eventKey: "organization-membership-joined:membership-event-1",
      eventType: "membership_joined",
      payload: {
        displayName: null,
        occurredAt: "2026-08-06T01:00:00.000Z",
        organizationDid: "did:plc:forest",
        organizationName: "Forest Circle",
        userDid: "did:plc:user",
      },
      sourceId: "membership-event-1",
      recipientDid: "did:plc:user",
      recipientEmail: "member@example.com",
      templateKey: "welcome-membership-joined",
      locale: null,
      deliveryMode: "capture",
      nextAttemptAt: NOW,
    });
  });

  it.each([
    ["event ID", { authEventId: " " }, "authEventId"],
    ["user DID", { userDid: "not-a-did" }, "userDid"],
    ["email", { email: "not-an-email" }, "email"],
    ["display name", { name: "x".repeat(201) }, "name"],
    ["locale", { locale: "x".repeat(36) }, "locale"],
    ["occurrence date", { createdAt: "not-a-date" }, "createdAt"],
  ])("rejects invalid %s before repository access", async (_label, change, field) => {
    const deps = dependencies(config({ signup: true }));
    const input = {
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: "user@example.com",
      name: "River Keeper",
      locale: "en",
      ...change,
    };
    await expect(enqueueSignup(input, deps)).rejects.toMatchObject({
      name: "NotificationProducerInputError",
      field,
    });
    expect(deps.repository.enqueue).not.toHaveBeenCalled();
  });

  it("uses an actionable typed error without reflecting invalid input", async () => {
    const deps = dependencies(config({ signup: true }));
    const secret = "private@example.com payload-secret";
    const error = await enqueueSignup({
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: secret,
    }, deps).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NotificationProducerInputError);
    expect((error as Error).message).toBe("Notification signup input has an invalid email. Supply a normalized deliverable address.");
    expect(JSON.stringify(error)).not.toContain(secret);
  });
});
