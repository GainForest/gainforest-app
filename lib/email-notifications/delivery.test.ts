import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createNotificationDelivery } from "./delivery";

const DEADLINE = new Date(Date.now() + 55_000);

afterEach(() => vi.unstubAllGlobals());

describe("createNotificationDelivery", () => {
  it("keeps processing and draining inert when email is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const delivery = createNotificationDelivery({ EMAIL_DISABLED: "true" });

    await expect(delivery.process("10000000-0000-4000-8000-000000000001", DEADLINE))
      .resolves.toEqual({ kind: "disabled" });
    await expect(delivery.drain(DEADLINE)).resolves.toEqual({ kind: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails before repository access when enabled email lacks its API key", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => createNotificationDelivery({})).toThrow(
      "Email delivery is enabled but RESEND_API_KEY is missing. Set RESEND_API_KEY or set EMAIL_DISABLED=true.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
