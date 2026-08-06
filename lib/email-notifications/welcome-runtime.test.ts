import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createWelcomeRuntime } from "./welcome-runtime";

const DEADLINE = new Date(Date.now() + 20_000);

afterEach(() => vi.unstubAllGlobals());

describe("createWelcomeRuntime", () => {
  it("is inert without configuration and does not touch Supabase or Resend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const runtime = createWelcomeRuntime({});
    await expect(runtime.deliver({
      type: "signup",
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: "member@example.com",
    }, DEADLINE)).resolves.toEqual({ kind: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails before repository access when resend mode lacks its API key", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(() => createWelcomeRuntime({
      EMAIL_DELIVERY_MODE: "resend",
      EMAIL_SIGNUP_ENABLED: "true",
    })).toThrow("RESEND_API_KEY is required when EMAIL_DELIVERY_MODE=resend");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
