import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { enqueueBioblitzWinner } from "./bioblitz";
import type { NotificationConfig } from "./config";

const NOW = new Date("2026-08-06T01:00:00.000Z");
function deps(config: NotificationConfig) {
  return {
    config,
    clock: { now: () => NOW },
    repository: { enqueue: vi.fn().mockResolvedValue({ outboxId: "10000000-0000-4000-8000-000000000001", status: "waiting_recipient", duplicate: false }) },
    userEmailReader: { lookup: vi.fn().mockResolvedValue({ kind: "ready", email: "winner@example.com" }) },
  };
}
const enabled: NotificationConfig = { emailDisabled: false };
const input = {
  roundId: 4,
  roundLabel: "Week 4",
  prize: "most-observations" as const,
  winnerDid: "did:plc:winner",
  createdAt: "2026-08-06T00:59:00.000Z",
};

describe("enqueueBioblitzWinner", () => {
  it("is inert before lookup and database access when disabled", async () => {
    const dependencies = deps({ emailDisabled: true });
    await expect(enqueueBioblitzWinner(input, dependencies)).resolves.toEqual({ kind: "disabled" });
    expect(dependencies.userEmailReader.lookup).not.toHaveBeenCalled();
    expect(dependencies.repository.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "ready", email: "winner@example.com" }, "ready"],
    [{ kind: "missing" }, "missing_email"],
    [{ kind: "error" }, "lookup_failed"],
  ])("creates stable waiting-recipient work and reports lookup status", async (lookup, recipientStatus) => {
    const dependencies = deps(enabled);
    dependencies.userEmailReader.lookup.mockResolvedValue(lookup);
    await expect(enqueueBioblitzWinner(input, dependencies)).resolves.toMatchObject({
      kind: "enqueued", recipientStatus, outboxId: expect.any(String), status: "waiting_recipient",
    });
    expect(dependencies.repository.enqueue).toHaveBeenCalledWith({
      eventKey: "bioblitz:4:most-observations:did:plc:winner",
      eventType: "bioblitz_winner",
      payload: {
        createdAt: "2026-08-06T00:59:00.000Z",
        prize: "most-observations",
        roundId: 4,
        roundLabel: "Week 4",
        winnerDid: "did:plc:winner",
      },
      sourceId: "bioblitz:4:most-observations",
      recipientDid: "did:plc:winner",
      recipientEmail: null,
      templateKey: "bioblitz-winner",
      locale: null,
      providerIdempotencyKey: null,
      nextAttemptAt: NOW,
    });
  });
});
