import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { NotificationConfig } from "./config";
import {
  drainNotifications,
  processNotificationById,
  type NotificationOrchestratorDependencies,
} from "./orchestrator";
import type { Claim, ProcessResult } from "./types";

const NOW = new Date("2026-08-06T01:00:00.000Z");
const DEADLINE = new Date("2026-08-06T01:01:00.000Z");

function config(deliveryMode: NotificationConfig["deliveryMode"] = "capture"): NotificationConfig {
  return {
    deliveryMode,
    producers: { signup: false, membershipJoined: false, invitation: false, bioblitzWinner: false },
  };
}

function claim(sequence: number, phase: Claim["resumeProviderCallPhase"] = "idle"): Claim {
  return {
    outboxId: `10000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    previousStatus: phase === "idle" ? "queued" : "processing",
    resumeProviderCallPhase: phase,
    processingToken: `20000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    lockedUntil: new Date("2026-08-06T01:02:00.000Z"),
  };
}

function dependencies(
  overrides: Partial<Pick<NotificationOrchestratorDependencies, "config" | "log">> = {},
) {
  const repository = {
    cleanup: vi.fn().mockResolvedValue({ activeExpired: 0, redacted: 0, deleted: 0 }),
    claimDue: vi.fn().mockResolvedValue([]),
    claimOne: vi.fn().mockResolvedValue(null),
    releaseClaim: vi.fn().mockResolvedValue(true),
  };
  return {
    config: config(),
    clock: { now: vi.fn(() => NOW) },
    tokenFactory: vi.fn(() => "30000000-0000-4000-8000-000000000001"),
    repository,
    processor: vi.fn(async (): Promise<ProcessResult> => ({ kind: "sent" })),
    ...overrides,
  } satisfies NotificationOrchestratorDependencies;
}

describe("processNotificationById", () => {
  it("returns before token generation and repository access when disabled", async () => {
    const deps = dependencies({ config: config("disabled") });
    await expect(processNotificationById("10000000-0000-4000-8000-000000000001", DEADLINE, deps)).resolves.toEqual({ kind: "disabled" });
    expect(deps.tokenFactory).not.toHaveBeenCalled();
    expect(deps.repository.claimOne).not.toHaveBeenCalled();
    expect(deps.processor).not.toHaveBeenCalled();
  });

  it("distinguishes no claim without invoking the processor", async () => {
    const deps = dependencies();
    await expect(processNotificationById("10000000-0000-4000-8000-000000000001", DEADLINE, deps)).resolves.toEqual({ kind: "no_claim" });
    expect(deps.repository.claimOne).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000001",
      120,
    );
    expect(deps.processor).not.toHaveBeenCalled();
  });

  it("passes one claim and the invocation deadline to the processor", async () => {
    const owned = claim(1);
    const deps = dependencies();
    deps.repository.claimOne.mockResolvedValue(owned);
    deps.processor.mockResolvedValue({ kind: "stale_claim" });
    await expect(processNotificationById(owned.outboxId, DEADLINE, deps, { leaseSeconds: 45 })).resolves.toEqual({
      kind: "processed",
      result: { kind: "stale_claim" },
    });
    expect(deps.processor).toHaveBeenCalledWith(owned, DEADLINE);
    expect(deps.repository.claimOne).toHaveBeenCalledWith(owned.outboxId, expect.any(String), 45);
  });

  it("does not claim when the safety margin has exhausted the deadline", async () => {
    const deps = dependencies();
    await expect(processNotificationById(
      "10000000-0000-4000-8000-000000000001",
      new Date(NOW.getTime() + 4_999),
      deps,
    )).resolves.toEqual({ kind: "deadline" });
    expect(deps.repository.claimOne).not.toHaveBeenCalled();
  });

  it("releases an idle claim and hides detail after a processor failure", async () => {
    const owned = claim(1);
    const deps = dependencies();
    deps.repository.claimOne.mockResolvedValue(owned);
    deps.processor.mockRejectedValue(new Error("private@example.com provider body"));

    const result = await processNotificationById(owned.outboxId, DEADLINE, deps);

    expect(result).toEqual({ kind: "unexpected_failure" });
    expect(deps.repository.releaseClaim).toHaveBeenCalledWith(owned.outboxId, owned.processingToken);
    expect(JSON.stringify(result)).not.toContain("private@example.com");
  });
});

describe("drainNotifications", () => {
  it("returns before cleanup and claiming when disabled", async () => {
    const deps = dependencies({ config: config("disabled") });
    await expect(drainNotifications(DEADLINE, deps)).resolves.toEqual({ kind: "disabled" });
    expect(deps.repository.cleanup).not.toHaveBeenCalled();
    expect(deps.repository.claimDue).not.toHaveBeenCalled();
  });

  it("runs bounded cleanup before incrementally claiming at most concurrency", async () => {
    const queue = [claim(1), claim(2), claim(3), claim(4), claim(5)];
    const order: string[] = [];
    const deps = dependencies();
    deps.repository.cleanup.mockImplementation(async () => {
      order.push("cleanup");
      return { activeExpired: 1, redacted: 2, deleted: 3 };
    });
    deps.repository.claimDue.mockImplementation(async (size: number) => {
      order.push(`claim:${size}`);
      return queue.splice(0, size);
    });
    deps.processor.mockImplementation(async () => {
      order.push("process");
      return { kind: "sent" };
    });

    const result = await drainNotifications(DEADLINE, deps, { batchSize: 5, concurrency: 2 });

    expect(order[0]).toBe("cleanup");
    expect(deps.repository.cleanup).toHaveBeenCalledWith(500);
    expect(deps.repository.claimDue.mock.calls.map(call => call[0])).toEqual([2, 2, 1]);
    expect(result).toMatchObject({
      kind: "completed",
      claimed: 5,
      cleanup: { activeExpired: 1, redacted: 2, deleted: 3 },
      outcomes: { sent: 5, unexpected_failure: 0 },
      stopped: "batch_limit",
    });
  });

  it("never exceeds configured concurrency", async () => {
    const claims = [claim(1), claim(2), claim(3), claim(4)];
    let active = 0;
    let maximum = 0;
    const gates: Array<() => void> = [];
    const deps = dependencies();
    deps.repository.claimDue.mockResolvedValueOnce(claims).mockResolvedValueOnce([]);
    deps.processor.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => gates.push(resolve));
      active -= 1;
      return { kind: "sent" };
    });

    const running = drainNotifications(DEADLINE, deps, { batchSize: 8, concurrency: 4 });
    await vi.waitFor(() => expect(gates).toHaveLength(4));
    expect(maximum).toBe(4);
    gates.splice(0).forEach(release => release());
    await running;
    expect(maximum).toBe(4);
  });

  it("stops the invocation after an insufficient-time release and cannot reclaim it", async () => {
    const sameClaim = claim(1);
    const deps = dependencies();
    deps.repository.claimDue.mockResolvedValue([sameClaim]);
    deps.processor.mockResolvedValue({ kind: "released_insufficient_time" });

    const result = await drainNotifications(DEADLINE, deps, { batchSize: 20, concurrency: 1 });

    expect(deps.repository.claimDue).toHaveBeenCalledTimes(1);
    expect(deps.processor).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: "completed",
      claimed: 1,
      stopped: "insufficient_time",
      outcomes: { released_insufficient_time: 1 },
    });
  });

  it("stops before another claim when the invocation deadline is exhausted", async () => {
    let time = NOW.getTime();
    const deps = dependencies();
    deps.clock.now.mockImplementation(() => new Date(time));
    deps.repository.claimDue.mockResolvedValueOnce([claim(1)]);
    deps.processor.mockImplementation(async () => {
      time += 56_000;
      return { kind: "sent" };
    });

    const result = await drainNotifications(DEADLINE, deps, { batchSize: 2, concurrency: 1 });

    expect(deps.repository.claimDue).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "completed", claimed: 1, stopped: "deadline" });
  });

  it("releases only initially-idle claims after unexpected processor failures", async () => {
    const idle = claim(1, "idle");
    const ambiguous = claim(2, "in_flight");
    const deps = dependencies();
    deps.repository.claimDue.mockResolvedValueOnce([idle, ambiguous]);
    deps.processor.mockRejectedValue(new Error("private@example.com provider body"));

    const result = await drainNotifications(DEADLINE, deps, { batchSize: 2, concurrency: 2 });

    expect(deps.repository.releaseClaim).toHaveBeenCalledTimes(1);
    expect(deps.repository.releaseClaim).toHaveBeenCalledWith(idle.outboxId, idle.processingToken);
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(result).toMatchObject({
      kind: "completed",
      outcomes: { unexpected_failure: 2 },
    });
  });

  it("continues delivery with a zero cleanup summary when maintenance fails", async () => {
    const deps = dependencies();
    deps.repository.cleanup.mockRejectedValue(new Error("cleanup unavailable"));
    deps.repository.claimDue.mockResolvedValueOnce([claim(1)]);

    const result = await drainNotifications(DEADLINE, deps, { batchSize: 1 });

    expect(deps.processor).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: "completed",
      cleanup: { activeExpired: 0, redacted: 0, deleted: 0 },
      outcomes: { sent: 1 },
    });
  });

  it("releases and stops when the repository repeats a claim in one invocation", async () => {
    const repeated = claim(1);
    const deps = dependencies();
    deps.repository.claimDue
      .mockResolvedValueOnce([repeated])
      .mockResolvedValueOnce([repeated]);

    const result = await drainNotifications(DEADLINE, deps, { batchSize: 2, concurrency: 1 });

    expect(result).toMatchObject({ kind: "completed", claimed: 1, stopped: "duplicate_claim" });
    expect(deps.repository.releaseClaim).toHaveBeenCalledWith(repeated.outboxId, repeated.processingToken);
  });

  it("releases over-claimed rows, logs the partial summary, and rejects the broken contract", async () => {
    const log = vi.fn();
    const deps = dependencies({ log });
    const overClaimed = [claim(1), claim(2)];
    deps.repository.claimDue.mockResolvedValueOnce(overClaimed);

    await expect(drainNotifications(DEADLINE, deps, { batchSize: 1, concurrency: 1 }))
      .rejects.toThrow("more claims than requested");

    expect(deps.repository.releaseClaim).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      kind: "completed",
      claimed: 0,
      outcomes: expect.objectContaining({ unexpected_failure: 0 }),
    }));
  });

  it("logs the partial summary before propagating claim failures", async () => {
    const log = vi.fn();
    const deps = dependencies({ log });
    deps.repository.claimDue.mockRejectedValue(new Error("claim unavailable"));

    await expect(drainNotifications(DEADLINE, deps)).rejects.toThrow("claim unavailable");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      kind: "completed",
      claimed: 0,
      cleanup: { activeExpired: 0, redacted: 0, deleted: 0 },
    }));
  });

  it("returns and logs aggregate counts without identifiers or notification data", async () => {
    const log = vi.fn();
    const deps = dependencies({ log });
    deps.repository.claimDue.mockResolvedValueOnce([claim(1)]);
    deps.processor.mockResolvedValue({ kind: "dead", errorCode: "notification_invalid" });

    const result = await drainNotifications(DEADLINE, deps, { batchSize: 1 });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(claim(1).outboxId);
    expect(serialized).not.toContain(claim(1).processingToken);
    expect(result).toMatchObject({ kind: "completed", outcomes: { dead: 1 } });
    expect(log).toHaveBeenCalledWith(result);
  });

  it.each([
    [{ batchSize: 0 }, "batchSize"],
    [{ batchSize: 21 }, "batchSize"],
    [{ concurrency: 0 }, "concurrency"],
    [{ concurrency: 5 }, "concurrency"],
    [{ leaseSeconds: 0 }, "leaseSeconds"],
    [{ cleanupBatchSize: 501 }, "cleanupBatchSize"],
  ])("rejects unsafe option %s before repository access", async (options, field) => {
    const deps = dependencies();
    await expect(drainNotifications(DEADLINE, deps, options)).rejects.toThrow(field);
    expect(deps.repository.cleanup).not.toHaveBeenCalled();
  });
});
