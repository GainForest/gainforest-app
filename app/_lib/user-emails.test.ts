import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextServer = vi.hoisted(() => ({ after: vi.fn() }));
const welcomeRuntime = vi.hoisted(() => ({
  deliver: vi.fn(async () => ({
    kind: "durable" as const,
    outboxId: "10000000-0000-4000-8000-000000000001",
    status: "sent" as const,
    duplicate: false,
    retryable: false,
  })),
}));

vi.mock("next/server", () => nextServer);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email-notifications/welcome-runtime", () => ({
  createWelcomeRuntime: () => welcomeRuntime,
}));

import { scheduleUserEmailSync, upsertUserEmail } from "./user-emails";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  nextServer.after.mockReset();
  welcomeRuntime.deliver.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upsertUserEmail", () => {
  it("reports first GainForest use when the DID is absent, then normalizes and upserts the email", async () => {
    const result = await upsertUserEmail({
      did: "did:plc:alice",
      email: "  Alice@Example.COM  ",
      handle: "  Alice.GainForest.App  ",
    });

    expect(result).toEqual({ firstUse: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [lookupUrl, lookupInit] = fetchMock.mock.calls[0];
    expect(lookupUrl).toBe("https://project.supabase.co/rest/v1/user_emails?select=did&did=eq.did%3Aplc%3Aalice&limit=1");
    expect(lookupInit?.method).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[1];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://project.supabase.co/rest/v1/user_emails?on_conflict=did");
    expect(init?.method).toBe("POST");
    expect(headers.get("apikey")).toBe("service-role-secret");
    expect(headers.get("authorization")).toBe("Bearer service-role-secret");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("prefer")).toBe("resolution=merge-duplicates,return=minimal");
    expect(init?.body).toBe(JSON.stringify({ did: "did:plc:alice", email: "alice@example.com", handle: "alice.gainforest.app" }));
  });

  it("reports a returning GainForest user when the DID already exists and still refreshes their email", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([{ did: "did:plc:alice" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(upsertUserEmail({
      did: "did:plc:alice",
      email: "new@example.com",
    })).resolves.toEqual({ firstUse: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({
      did: "did:plc:alice",
      email: "new@example.com",
    }));
  });

  it("omits handle from the payload when not provided", async () => {
    await upsertUserEmail({ did: "did:plc:alice", email: "alice@example.com" });

    const [, init] = fetchMock.mock.calls[1];
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
  it("enqueues the welcome email after the first authenticated GainForest load", async () => {
    scheduleUserEmailSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
      email: "alice@example.com",
    }, "pt");

    expect(nextServer.after).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();

    const callback = nextServer.after.mock.calls[0][0];
    await callback();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(welcomeRuntime.deliver).toHaveBeenCalledWith({
      type: "signup",
      authEventId: "gainforest.first-use.v1:a304c5c525080ebfa7b6205c6c31508ce8f769fc129576e170dcb27172ff6fb4",
      userDid: "did:plc:alice",
      email: "alice@example.com",
      locale: "pt",
    }, expect.any(Date));
  });

  it("only refreshes the email for a returning GainForest user", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([{ did: "did:plc:alice" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    scheduleUserEmailSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
      email: "alice@example.com",
    }, "en");

    const callback = nextServer.after.mock.calls[0][0];
    await callback();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(welcomeRuntime.deliver).not.toHaveBeenCalled();
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
      "User email synchronization or first-use welcome setup failed. It will be retried only if the DID was not saved; verify Supabase and notification configuration.",
    );
  });
});
