import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { supabaseRpc } from "./rest";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("supabaseRpc", () => {
  it("bounds RPC fetches with a ten-second abort signal", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));

    await expect(supabaseRpc("notification_outbox_mark_sent", { p_outbox_id: "row-1" }))
      .resolves.toEqual({ ok: true });

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("maps an aborted RPC to an availability error without leaking parameters", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    fetchMock.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    const pending = supabaseRpc("notification_outbox_mark_sent", {
      p_recipient_email: "private@example.com",
    }).catch((error: unknown) => error);

    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
    const error = await pending;

    expect(error).toMatchObject({ name: "SupabaseRestError", status: 504 });
    expect((error as Error).message).toBe("Supabase RPC timed out. Check Supabase availability and retry.");
    expect((error as Error).message).not.toContain("private@example.com");
  });
});
