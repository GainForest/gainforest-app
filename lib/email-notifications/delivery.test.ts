import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createNotificationDelivery } from "./delivery";

const DEADLINE = new Date(Date.now() + 55_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("rejects an unexpected event type before claiming the row", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ event_type: "signup" }]));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = createNotificationDelivery({ RESEND_API_KEY: "resend-secret" });

    await expect(delivery.process(
      "10000000-0000-4000-8000-000000000001",
      DEADLINE,
      "invitation",
    )).rejects.toThrow(
      "Notification delivery expected event type invitation, but the outbox row is missing or has a different event type.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/rest/v1/notification_outbox?select=event_type");
  });

  it("redacts event-type lookup failures before claiming the row", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("private@example.com database-secret"));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = createNotificationDelivery({ RESEND_API_KEY: "resend-secret" });

    const error = await delivery.process(
      "10000000-0000-4000-8000-000000000001",
      DEADLINE,
      "invitation",
    ).catch((reason: unknown) => reason);
    expect((error as Error).message).toBe(
      "Notification event type could not be verified. Check Supabase availability and try again.",
    );
    expect((error as Error).message).not.toContain("private@example.com");
    expect((error as Error).message).not.toContain("database-secret");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
