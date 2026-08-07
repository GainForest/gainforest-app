import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SupabaseInvitationSourceReader } from "./invitation-source";

const fetchMock = vi.fn<typeof fetch>();
const NOW = new Date("2026-08-06T01:00:00.000Z");

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SupabaseInvitationSourceReader", () => {
  it.each([
    ["pending", [{ status: "pending", expires_at: "2026-08-07T01:00:00.000Z" }], { kind: "sendable" }],
    ["expired", [{ status: "pending", expires_at: "2026-08-05T01:00:00.000Z" }], { kind: "expired" }],
    ["accepted", [{ status: "accepted", expires_at: "2026-08-07T01:00:00.000Z" }], { kind: "not_pending" }],
    ["missing", [], { kind: "not_pending" }],
    ["multiple rows", [
      { status: "pending", expires_at: "2026-08-07T01:00:00.000Z" },
      { status: "pending", expires_at: "2026-08-08T01:00:00.000Z" },
    ], { kind: "error" }],
  ])("returns a redacted sendability result for %s source state", async (_label, rows, expected) => {
    fetchMock.mockResolvedValueOnce(Response.json(rows));
    await expect(new SupabaseInvitationSourceReader().getSendability(
      "81000000-0000-4000-8000-000000000001",
      NOW,
    )).resolves.toEqual(expected);
    expect(fetchMock.mock.calls[0][0]).toContain("/rest/v1/cgs_group_invitations?");
  });

  it("converts malformed responses and repository failures to error", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ status: "pending", expires_at: "invalid" }]));
    await expect(new SupabaseInvitationSourceReader().getSendability("id", NOW)).resolves.toEqual({ kind: "error" });
    fetchMock.mockRejectedValueOnce(new Error("invitee@example.com database-secret"));
    await expect(new SupabaseInvitationSourceReader().getSendability("id", NOW)).resolves.toEqual({ kind: "error" });
  });
});
