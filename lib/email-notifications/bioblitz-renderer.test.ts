import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderBioblitzWinnerEmail } from "@/lib/email/bioblitz-winner-template";
import { BioblitzNotificationRenderer } from "./bioblitz-renderer";
import type { RenderableRow } from "./types";

const row: RenderableRow = {
  id: "10000000-0000-4000-8000-000000000001",
  eventType: "bioblitz_winner",
  payload: { createdAt: "2026-08-06T01:00:00.000Z", prize: "best-picture", roundId: 4, roundLabel: "Week 4", winnerDid: "did:plc:winner" },
  sourceId: "bioblitz:4:best-picture",
  recipientEmail: "winner@example.com",
  templateKey: "bioblitz-winner",
  locale: "pt-BR",
};

describe("BioblitzNotificationRenderer", () => {
  it("renders the production winner template without exposing technical identity", async () => {
    const rendered = await new BioblitzNotificationRenderer().render(row);
    expect(rendered).toEqual(renderBioblitzWinnerEmail({ locale: "pt", roundLabel: "Week 4", prize: "best-picture" }));
    expect(JSON.stringify(rendered)).not.toContain("did:plc:winner");
  });

  it("rejects mismatched source and payload with a fixed error", async () => {
    const error = await new BioblitzNotificationRenderer().render({ ...row, sourceId: "bioblitz:4:most-observations" }).catch(reason => reason);
    expect((error as Error).message).toBe("BioBlitz notification row is invalid. Verify the committed award snapshot.");
  });
});
