import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { enqueue, process, supabaseSelect, supabaseRpc } = vi.hoisted(() => ({
  enqueue: vi.fn(), process: vi.fn(), supabaseSelect: vi.fn(), supabaseRpc: vi.fn(),
}));
vi.mock("@/lib/email-notifications/bioblitz-runtime", () => ({
  createBioblitzProducerRuntime: () => ({ enqueue }),
  createBioblitzProcessRuntime: () => ({ process }),
}));
vi.mock("@/lib/supabase/rest", () => ({ supabaseSelect, supabaseRpc }));

import { listBioblitzNotificationSummaries, markBioblitzNotificationHandled, notifyBioblitzWinner } from "./bioblitz-notifications";

const input = { roundId: 4, roundLabel: "Week 4", prize: "best-picture" as const, winnerDid: "did:plc:winner", createdAt: "2026-08-06T01:00:00.000Z" };

beforeEach(() => { enqueue.mockReset(); process.mockReset(); supabaseSelect.mockReset(); supabaseRpc.mockReset(); });

describe("BioBlitz notification summaries", () => {
  it("maps private outbox state to plain moderator statuses", async () => {
    const mostHash = createHash("sha256").update("bioblitz:4:most-observations:did:plc:most").digest("hex");
    const bestHash = createHash("sha256").update("bioblitz:4:best-picture:did:plc:best").digest("hex");
    supabaseSelect.mockResolvedValue([
      { event_key_hash: mostHash, status: "waiting_recipient", last_error_code: "recipient_missing" },
      { event_key_hash: bestHash, status: "sent" },
    ]);
    const summaries = await listBioblitzNotificationSummaries([
      { roundId: 4, prize: "most-observations", winnerDid: "did:plc:most" },
      { roundId: 4, prize: "best-picture", winnerDid: "did:plc:best" },
    ]);
    expect(summaries.get("bioblitz:4:most-observations")).toEqual({ status: "missing_email", canMarkHandled: true });
    expect(summaries.get("bioblitz:4:best-picture")).toEqual({ status: "sent", canMarkHandled: false });
  });

  it("preserves a badge success when email is missing", async () => {
    enqueue.mockResolvedValue({ kind: "enqueued", outboxId: "id", status: "waiting_recipient", duplicate: false, recipientStatus: "missing_email" });
    process.mockResolvedValue({ kind: "processed", result: { kind: "waiting_recipient", errorCode: "recipient_missing" } });
    await expect(notifyBioblitzWinner(input, new Date())).resolves.toEqual({ status: "missing_email", canMarkHandled: true });
  });

  it("reports setup failure instead of throwing into the award flow", async () => {
    enqueue.mockRejectedValue(new Error("winner@example.com database-secret"));
    await expect(notifyBioblitzWinner(input, new Date())).resolves.toEqual({ status: "notification_setup_failed", canMarkHandled: true });
  });

  it("returns a redacted manual handling summary", async () => {
    supabaseRpc.mockResolvedValue({ outbox_id: "id", status: "suppressed" });
    await expect(markBioblitzNotificationHandled({ roundId: 4, prize: "best-picture", winnerDid: "did:plc:winner", moderatorDid: "did:plc:mod" }))
      .resolves.toEqual({ status: "handled_manually", canMarkHandled: false });
  });
});
