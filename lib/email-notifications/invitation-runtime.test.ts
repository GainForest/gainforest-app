import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createNotificationProcessor,
  createNotificationRuntimeCore,
  processNotificationById,
  supabaseSelect,
} = vi.hoisted(() => ({
  createNotificationProcessor: vi.fn(),
  createNotificationRuntimeCore: vi.fn(),
  processNotificationById: vi.fn(),
  supabaseSelect: vi.fn(),
}));

vi.mock("@/lib/supabase/rest", () => ({
  supabaseFilterValue: encodeURIComponent,
  supabaseSelect,
}));
vi.mock("./orchestrator", () => ({
  createNotificationProcessor,
  processNotificationById,
}));
vi.mock("./runtime", () => ({
  createNotificationRuntimeCore,
  rejectDisabledNotificationProcessing: vi.fn(),
}));

import { createInvitationRuntime } from "./invitation-runtime";

const OUTBOX_ID = "10000000-0000-4000-8000-000000000001";
const DEADLINE = new Date("2026-08-06T01:01:00.000Z");
const repository = { claimOne: vi.fn() };
const processor = vi.fn();

beforeEach(() => {
  supabaseSelect.mockReset();
  processNotificationById.mockReset();
  processNotificationById.mockResolvedValue({ kind: "no_claim" });
  createNotificationProcessor.mockReset();
  createNotificationProcessor.mockReturnValue(processor);
  createNotificationRuntimeCore.mockReset();
  createNotificationRuntimeCore.mockReturnValue({
    config: { emailDisabled: false },
    repository,
    provider: {},
    clock: { now: () => new Date("2026-08-06T01:00:00.000Z") },
    from: "GainForest <noreply@gainforest.id>",
  });
});

describe("createInvitationRuntime", () => {
  it("processes an existing invitation row", async () => {
    supabaseSelect.mockResolvedValueOnce([{ event_type: "invitation" }]);

    await expect(createInvitationRuntime({}).process(OUTBOX_ID, DEADLINE)).resolves.toEqual({ kind: "no_claim" });
    expect(processNotificationById).toHaveBeenCalledWith(
      OUTBOX_ID,
      DEADLINE,
      expect.objectContaining({ repository }),
      { leaseSeconds: 120, safetyMarginMs: 2_000 },
    );
  });

  it.each([
    ["signup", [{ event_type: "signup" }]],
    ["membership", [{ event_type: "membership_joined" }]],
    ["unknown", [{ event_type: "unknown" }]],
    ["missing", []],
  ])("rejects a %s row before claiming it", async (_label, rows) => {
    supabaseSelect.mockResolvedValueOnce(rows);

    await expect(createInvitationRuntime({}).process(OUTBOX_ID, DEADLINE)).rejects.toThrow(
      "Invitation notification processing requires an existing invitation outbox row. Use the runtime registered for that event type.",
    );
    expect(processNotificationById).not.toHaveBeenCalled();
  });

  it("redacts event-type lookup failures and does not claim", async () => {
    supabaseSelect.mockRejectedValueOnce(new Error("private@example.com database-secret"));

    const error = await createInvitationRuntime({}).process(OUTBOX_ID, DEADLINE).catch((reason: unknown) => reason);
    expect((error as Error).message).toBe(
      "Invitation notification type could not be verified. Check Supabase availability and try again.",
    );
    expect((error as Error).message).not.toContain("private@example.com");
    expect((error as Error).message).not.toContain("database-secret");
    expect(processNotificationById).not.toHaveBeenCalled();
  });
});
