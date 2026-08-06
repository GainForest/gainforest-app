import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DrainOutcome } from "@/lib/notifications/orchestrator";

vi.mock("server-only", () => ({}));

const drain = vi.fn<(_deadline: Date) => Promise<DrainOutcome>>(async () => ({
  kind: "completed" as const,
  claimed: 2,
  cleanup: { activeExpired: 0, redacted: 1, deleted: 0 },
  outcomes: {
    sent: 1,
    requeued: 1,
    waiting_recipient: 0,
    ambiguous_deferred: 0,
    dead: 0,
    suppressed: 0,
    released_insufficient_time: 0,
    stale_claim: 0,
    unexpected_failure: 0,
  },
  stopped: "empty" as const,
  elapsedMs: 25,
}));
const health = vi.fn(async () => ({ waitingRecipient: 1, queued: 2, processing: 0, dead: 0, oldestDueAgeSeconds: 30 }));
const createDrainRuntime = vi.fn(() => ({ drain, health }));
const reconcileRecentBioblitzNotifications = vi.fn(async (_deadline: Date) => ({ candidates: 2, completed: true }));

vi.mock("@/lib/notifications/drain-runtime", () => ({ createDrainRuntime }));
vi.mock("@/app/_lib/bioblitz-notification-reconciliation", () => ({ reconcileRecentBioblitzNotifications }));

function request(token?: string): NextRequest {
  return new NextRequest("https://example.test/api/internal/notifications/drain", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe("notification drain route", () => {
  const secret = "notification-cron-secret-123";
  const originalSecret = process.env.NOTIFICATION_CRON_SECRET;

  beforeEach(() => {
    process.env.NOTIFICATION_CRON_SECRET = secret;
    createDrainRuntime.mockClear();
    drain.mockClear();
    health.mockClear();
    reconcileRecentBioblitzNotifications.mockClear();
  });

  afterEach(() => {
    process.env.NOTIFICATION_CRON_SECRET = originalSecret;
  });

  it.each([undefined, "short"])("fails before runtime construction when the secret is %s", async configured => {
    if (configured === undefined) delete process.env.NOTIFICATION_CRON_SECRET;
    else process.env.NOTIFICATION_CRON_SECRET = configured;
    const { GET } = await import("./route");
    const response = await GET(request(secret));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Notification recovery is not configured." });
    expect(createDrainRuntime).not.toHaveBeenCalled();
  });

  it.each([undefined, "wrong-token"])("rejects a missing or incorrect bearer token", async token => {
    const { GET } = await import("./route");
    const response = await GET(request(token));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized notification recovery request." });
    expect(createDrainRuntime).not.toHaveBeenCalled();
  });

  it("runs one deadline-bounded drain and returns aggregate fields only", async () => {
    const { GET } = await import("./route");
    const before = Date.now();
    const response = await GET(request(secret));
    const after = Date.now();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      kind: "completed",
      claimed: 2,
      outcomes: { sent: 1, requeued: 1 },
      reconciliation: { candidates: 2, completed: true },
      health: { queued: 2, oldestDueAgeSeconds: 30 },
    });
    expect(JSON.stringify(body)).not.toContain("@example.com");
    expect(drain).toHaveBeenCalledTimes(1);
    const reconciliationDeadline = reconcileRecentBioblitzNotifications.mock.calls[0][0] as Date;
    expect(reconciliationDeadline.getTime()).toBeGreaterThanOrEqual(before + 9_000);
    expect(reconciliationDeadline.getTime()).toBeLessThanOrEqual(after + 10_000);
    const deadline = drain.mock.calls[0][0] as Date;
    expect(deadline.getTime()).toBeGreaterThanOrEqual(before + 54_000);
    expect(deadline.getTime()).toBeLessThanOrEqual(after + 55_000);
  });

  it("redacts runtime failures", async () => {
    drain.mockRejectedValueOnce(new Error("member@example.com database-secret"));
    const { GET } = await import("./route");
    const response = await GET(request(secret));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("Notification recovery could not complete");
    expect(body).not.toContain("member@example.com");
    expect(body).not.toContain("database-secret");
  });
});
