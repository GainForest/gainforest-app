import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SupabaseUserEmailReader } from "./user-email";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("SupabaseUserEmailReader", () => {
  it.each([
    [[{ email: "winner@example.com" }], { kind: "ready", email: "winner@example.com" }],
    [[], { kind: "missing" }],
    [[{ email: "invalid" }], { kind: "error" }],
  ])("returns a bounded private lookup result", async (rows, expected) => {
    fetchMock.mockResolvedValueOnce(Response.json(rows));
    await expect(new SupabaseUserEmailReader().lookup("did:plc:winner")).resolves.toEqual(expected);
    expect(fetchMock.mock.calls[0][0]).toContain("/rest/v1/user_emails?");
  });

  it("redacts repository failure details", async () => {
    fetchMock.mockRejectedValueOnce(new Error("winner@example.com service-role-secret"));
    await expect(new SupabaseUserEmailReader().lookup("did:plc:winner")).resolves.toEqual({ kind: "error" });
  });
});
