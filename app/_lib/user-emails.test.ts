import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextServer = vi.hoisted(() => ({ after: vi.fn() }));

vi.mock("next/server", () => nextServer);

import { scheduleUserEmailSync, upsertUserEmail } from "./user-emails";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  nextServer.after.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upsertUserEmail", () => {
  it("normalizes and upserts the DID-to-email mapping without returning rows", async () => {
    await upsertUserEmail({
      did: "did:plc:alice",
      email: "  Alice@Example.COM  ",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(url).toBe("https://project.supabase.co/rest/v1/user_emails?on_conflict=did");
    expect(init?.method).toBe("POST");
    expect(headers.get("apikey")).toBe("service-role-secret");
    expect(headers.get("authorization")).toBe("Bearer service-role-secret");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("prefer")).toBe("resolution=merge-duplicates,return=minimal");
    expect(init?.body).toBe(JSON.stringify({ did: "did:plc:alice", email: "alice@example.com" }));
  });

  it("explains how to fix a failed sync without retaining private database details", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { message: "Rejected row for alice@example.com" },
        { status: 503 },
      ),
    );

    const error = await upsertUserEmail({
      did: "did:plc:alice",
      email: "alice@example.com",
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Could not sync the signed-in user's email: Supabase returned HTTP 503. Verify the user_emails table and Supabase service-role configuration.",
    );
    expect((error as Error).message).not.toContain("alice@example.com");
    expect((error as Error).cause).toBeUndefined();
  });
});

describe("scheduleUserEmailSync", () => {
  it("schedules the upsert after the response for a session containing an email", async () => {
    scheduleUserEmailSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
      email: "alice@example.com",
    });

    expect(nextServer.after).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();

    const callback = nextServer.after.mock.calls[0][0];
    await callback();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not schedule database work without a signed-in session email", () => {
    scheduleUserEmailSync({ isLoggedIn: false });
    scheduleUserEmailSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
    });

    expect(nextServer.after).not.toHaveBeenCalled();
  });

  it("keeps a failed background sync from rejecting after the response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: "user_emails is unavailable" }, { status: 503 }),
    );

    scheduleUserEmailSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
      email: "alice@example.com",
    });

    const callback = nextServer.after.mock.calls[0][0];
    await expect(callback()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "User email synchronization failed; it will be retried on a later full app load. Verify the user_emails table and Supabase service-role configuration.",
    );
  });
});
