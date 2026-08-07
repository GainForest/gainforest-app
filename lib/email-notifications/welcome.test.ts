import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { NotificationConfig } from "./config";
import { deliverWelcomeNotification } from "./welcome";
import type { ProcessOneOutcome } from "./orchestrator";

const NOW = new Date("2026-08-06T01:00:00.000Z");
const DEADLINE = new Date("2026-08-06T01:00:20.000Z");
const OUTBOX_ID = "10000000-0000-4000-8000-000000000001";

function config(): NotificationConfig {
  return { emailDisabled: false };
}

function dependencies() {
  return {
    producer: {
      config: config(),
      clock: { now: () => NOW },
      repository: {
        enqueue: vi.fn().mockResolvedValue({ outboxId: OUTBOX_ID, status: "queued", duplicate: false }),
      },
    },
    processOne: vi.fn<(_outboxId: string, _deadline: Date) => Promise<ProcessOneOutcome>>()
      .mockResolvedValue({ kind: "processed", result: { kind: "sent" } }),
  };
}

describe("deliverWelcomeNotification", () => {
  it("returns disabled without processing when notification email is off", async () => {
    const deps = dependencies();
    deps.producer.config = { emailDisabled: true };
    await expect(deliverWelcomeNotification({
      type: "signup",
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: "member@example.com",
    }, DEADLINE, deps)).resolves.toEqual({ kind: "disabled" });
    expect(deps.producer.repository.enqueue).not.toHaveBeenCalled();
    expect(deps.processOne).not.toHaveBeenCalled();
  });

  it("awaits one bounded processing run and reports sent", async () => {
    const deps = dependencies();
    await expect(deliverWelcomeNotification({
      type: "signup",
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: "member@example.com",
      name: "Forest Member",
      locale: "en",
      createdAt: "2026-08-06T00:59:00.000Z",
    }, DEADLINE, deps)).resolves.toEqual({
      kind: "durable",
      outboxId: OUTBOX_ID,
      status: "sent",
      duplicate: false,
      retryable: false,
    });
    expect(deps.processOne).toHaveBeenCalledWith(OUTBOX_ID, DEADLINE);
  });

  it("maps retry outcomes to a durable queued summary without provider details", async () => {
    const deps = dependencies();
    deps.processOne.mockResolvedValue({
      kind: "processed",
      result: { kind: "requeued", errorCode: "provider_rate_limited" },
    });
    await expect(deliverWelcomeNotification({
      type: "membership_joined",
      authEventId: "membership-event-1",
      userDid: "did:plc:user",
      email: "member@example.com",
      organizationDid: "did:plc:forest",
      organizationName: "Forest Circle",
    }, DEADLINE, deps)).resolves.toEqual({
      kind: "durable",
      outboxId: OUTBOX_ID,
      status: "queued",
      duplicate: false,
      retryable: true,
      errorCode: "provider_rate_limited",
    });
  });

  it.each([
    ["sent", false],
    ["dead", false],
    ["suppressed", false],
    ["processing", true],
  ] as const)("does not process an already durable duplicate in %s", async (status, retryable) => {
    const deps = dependencies();
    deps.producer.repository.enqueue.mockResolvedValue({ outboxId: OUTBOX_ID, status, duplicate: true });
    await expect(deliverWelcomeNotification({
      type: "signup", authEventId: "auth-event-1", userDid: "did:plc:user", email: "member@example.com",
    }, DEADLINE, deps)).resolves.toEqual({
      kind: "durable",
      outboxId: OUTBOX_ID,
      status,
      duplicate: true,
      retryable,
    });
    expect(deps.processOne).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "no_claim" } as ProcessOneOutcome, "processing", true],
    [{ kind: "deadline" } as ProcessOneOutcome, "queued", true],
    [{ kind: "unexpected_failure" } as ProcessOneOutcome, "processing", true],
    [{ kind: "processed", result: { kind: "dead", errorCode: "notification_invalid" } } as ProcessOneOutcome, "dead", false],
    [{ kind: "processed", result: { kind: "released_insufficient_time" } } as ProcessOneOutcome, "queued", true],
  ])("maps bounded process result without exposing row data", async (processResult, status, retryable) => {
    const deps = dependencies();
    deps.processOne.mockResolvedValue(processResult);
    const result = await deliverWelcomeNotification({
      type: "signup", authEventId: "auth-event-1", userDid: "did:plc:user", email: "member@example.com",
    }, DEADLINE, deps);
    expect(result).toMatchObject({ kind: "durable", status, retryable });
    expect(JSON.stringify(result)).not.toContain("member@example.com");
  });
});
