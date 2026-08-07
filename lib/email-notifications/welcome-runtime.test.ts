import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createWelcomeRuntime } from "./welcome-runtime";

const DEADLINE = new Date(Date.now() + 20_000);

afterEach(() => vi.unstubAllGlobals());

describe("createWelcomeRuntime", () => {
  it("is inert when email is disabled and does not touch Supabase or Resend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const runtime = createWelcomeRuntime({ EMAIL_DISABLED: "true" });
    await expect(runtime.deliver({
      type: "signup",
      authEventId: "auth-event-1",
      userDid: "did:plc:user",
      email: "member@example.com",
    }, DEADLINE)).resolves.toEqual({ kind: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails without network access when enabled email lacks its API key", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(() => createWelcomeRuntime({})).toThrow(
      "Email delivery is enabled but RESEND_API_KEY is missing. Set RESEND_API_KEY or set EMAIL_DISABLED=true.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
