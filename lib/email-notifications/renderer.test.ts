import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ApplicationNotificationRenderer } from "./renderer";
import type { RenderableRow } from "./types";

const unsupportedRow = {
  id: "10000000-0000-4000-8000-000000000001",
  eventType: "unsupported",
  payload: {},
  sourceId: "source",
  recipientEmail: "recipient@example.com",
  templateKey: "unsupported",
  locale: "en",
} as unknown as RenderableRow;

describe("ApplicationNotificationRenderer", () => {
  it("rejects unsupported events through its Promise contract", async () => {
    const error = await new ApplicationNotificationRenderer().render(unsupportedRow).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Notification event has no registered renderer. Add its production template adapter before enabling the producer.",
    );
  });
});
