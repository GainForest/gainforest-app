import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextServer = vi.hoisted(() => ({ after: vi.fn() }));
const cgs = vi.hoisted(() => ({
  fetchAllCgsGroupMembershipsWithCookie: vi.fn(),
  fetchAllCgsMembersWithCookie: vi.fn(),
}));
const supabase = vi.hoisted(() => ({
  supabaseRpc: vi.fn(),
  supabaseSelect: vi.fn(),
}));

vi.mock("next/server", () => nextServer);
vi.mock("server-only", () => ({}));
vi.mock("./cgs-server", () => cgs);
vi.mock("@/lib/supabase/rest", () => ({
  supabaseFilterValue: encodeURIComponent,
  supabaseRpc: supabase.supabaseRpc,
  supabaseSelect: supabase.supabaseSelect,
}));

import {
  ORGANIZATION_ROSTER_SYNC_INTERVAL_MS,
  scheduleOrganizationMembershipSync,
  scheduleOrganizationRosterSync,
  syncOrganizationMemberships,
} from "./organization-memberships";

const COOKIE = "__Secure_gainforest_session=session-secret";
const NOW = new Date("2026-08-17T08:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  nextServer.after.mockReset();
  cgs.fetchAllCgsGroupMembershipsWithCookie.mockReset();
  cgs.fetchAllCgsMembersWithCookie.mockReset();
  supabase.supabaseSelect.mockReset();
  supabase.supabaseRpc.mockReset();
  cgs.fetchAllCgsGroupMembershipsWithCookie.mockResolvedValue([]);
  cgs.fetchAllCgsMembersWithCookie.mockResolvedValue([]);
  supabase.supabaseSelect.mockResolvedValue([]);
  supabase.supabaseRpc.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("syncOrganizationMemberships", () => {
  it("stores a complete stale organization roster with one observed timestamp", async () => {
    cgs.fetchAllCgsGroupMembershipsWithCookie.mockResolvedValue([
      { groupDid: "did:plc:forest", role: "owner" },
    ]);
    supabase.supabaseSelect.mockResolvedValue([
      { roster_synced_at: new Date(NOW.getTime() - ORGANIZATION_ROSTER_SYNC_INTERVAL_MS - 1).toISOString() },
    ]);
    cgs.fetchAllCgsMembersWithCookie.mockResolvedValue([
      { did: "did:plc:alice", role: "owner", addedBy: null, addedAt: null },
      { did: "did:plc:bob", role: "admin", addedBy: "did:plc:alice", addedAt: "2026-01-01T00:00:00Z" },
    ]);

    await expect(syncOrganizationMemberships({ cookie: COOKIE })).resolves.toEqual({
      organizations: 1,
      synced: 1,
      skipped: 0,
      failed: 0,
    });

    expect(cgs.fetchAllCgsMembersWithCookie).toHaveBeenCalledWith({
      repo: "did:plc:forest",
      cookie: COOKIE,
    });
    expect(supabase.supabaseRpc).toHaveBeenCalledWith("organization_memberships_replace_roster", {
      p_organization_did: "did:plc:forest",
      p_members: [
        { memberDid: "did:plc:alice", role: "owner" },
        { memberDid: "did:plc:bob", role: "admin" },
      ],
      p_observed_at: NOW.toISOString(),
    });
  });

  it("does not fetch a roster successfully synchronized less than 30 minutes ago", async () => {
    cgs.fetchAllCgsGroupMembershipsWithCookie.mockResolvedValue([
      { groupDid: "did:plc:forest", role: "member" },
    ]);
    supabase.supabaseSelect.mockResolvedValue([
      { roster_synced_at: new Date(NOW.getTime() - ORGANIZATION_ROSTER_SYNC_INTERVAL_MS + 1).toISOString() },
    ]);

    await expect(syncOrganizationMemberships({ cookie: COOKIE })).resolves.toEqual({
      organizations: 1,
      synced: 0,
      skipped: 1,
      failed: 0,
    });

    expect(cgs.fetchAllCgsMembersWithCookie).not.toHaveBeenCalled();
    expect(supabase.supabaseRpc).not.toHaveBeenCalled();
  });

  it("logs the failed roster error and continues syncing other organizations", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("CGS page failed");
    cgs.fetchAllCgsGroupMembershipsWithCookie.mockResolvedValue([
      { groupDid: "did:plc:forest", role: "owner" },
      { groupDid: "did:plc:river", role: "member" },
    ]);
    supabase.supabaseSelect.mockResolvedValue([]);
    cgs.fetchAllCgsMembersWithCookie
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce([{ did: "did:plc:bob", role: "owner", addedBy: null, addedAt: null }]);

    await expect(syncOrganizationMemberships({ cookie: COOKIE })).resolves.toEqual({
      organizations: 2,
      synced: 1,
      skipped: 0,
      failed: 1,
    });

    expect(consoleError).toHaveBeenCalledWith(
      "Organization membership synchronization could not refresh the roster for did:plc:forest. Failed rosters are left unchanged and will be retried later.",
      error,
    );
    expect(supabase.supabaseRpc).toHaveBeenCalledOnce();
    expect(supabase.supabaseRpc).toHaveBeenCalledWith("organization_memberships_replace_roster", expect.objectContaining({
      p_organization_did: "did:plc:river",
    }));
  });

  it("counts a newer database snapshot as skipped when the replacement RPC rejects a stale race loser", async () => {
    cgs.fetchAllCgsGroupMembershipsWithCookie.mockResolvedValue([
      { groupDid: "did:plc:forest", role: "owner" },
    ]);
    cgs.fetchAllCgsMembersWithCookie.mockResolvedValue([
      { did: "did:plc:alice", role: "owner", addedBy: null, addedAt: null },
    ]);
    supabase.supabaseRpc.mockResolvedValue(false);

    await expect(syncOrganizationMemberships({ cookie: COOKIE })).resolves.toEqual({
      organizations: 1,
      synced: 0,
      skipped: 1,
      failed: 0,
    });
  });
});

describe("scheduleOrganizationMembershipSync", () => {
  it("runs the authenticated membership synchronization after the response", async () => {
    scheduleOrganizationMembershipSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
    }, COOKIE);

    expect(nextServer.after).toHaveBeenCalledOnce();
    expect(cgs.fetchAllCgsGroupMembershipsWithCookie).not.toHaveBeenCalled();

    const callback = nextServer.after.mock.calls[0][0];
    await callback();

    expect(cgs.fetchAllCgsGroupMembershipsWithCookie).toHaveBeenCalledWith(COOKIE);
  });

  it("does not schedule without both a signed-in session and its request cookie", () => {
    scheduleOrganizationMembershipSync({ isLoggedIn: false }, COOKIE);
    scheduleOrganizationMembershipSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
    }, null);

    expect(nextServer.after).not.toHaveBeenCalled();
  });

  it("forces a freshly synchronized organization roster to refresh after a membership mutation", async () => {
    supabase.supabaseSelect.mockResolvedValue([
      { roster_synced_at: new Date(NOW.getTime() - 1).toISOString() },
    ]);
    cgs.fetchAllCgsMembersWithCookie.mockResolvedValue([
      { did: "did:plc:alice", role: "owner", addedBy: null, addedAt: null },
      { did: "did:plc:bob", role: "member", addedBy: "did:plc:alice", addedAt: NOW.toISOString() },
    ]);

    scheduleOrganizationRosterSync("did:plc:forest", COOKIE);

    expect(nextServer.after).toHaveBeenCalledOnce();
    const callback = nextServer.after.mock.calls[0][0];
    await expect(callback()).resolves.toBeUndefined();

    expect(cgs.fetchAllCgsMembersWithCookie).toHaveBeenCalledWith({
      repo: "did:plc:forest",
      cookie: COOKIE,
    });
    expect(supabase.supabaseRpc).toHaveBeenCalledWith("organization_memberships_replace_roster", {
      p_organization_did: "did:plc:forest",
      p_members: [
        { memberDid: "did:plc:alice", role: "owner" },
        { memberDid: "did:plc:bob", role: "member" },
      ],
      p_observed_at: NOW.toISOString(),
    });
  });

  it("reports partial roster failures after logging their causes", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cgs.fetchAllCgsGroupMembershipsWithCookie.mockResolvedValue([
      { groupDid: "did:plc:forest", role: "owner" },
    ]);
    cgs.fetchAllCgsMembersWithCookie.mockRejectedValue(new Error("private upstream details"));

    scheduleOrganizationMembershipSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
    }, COOKIE);

    const callback = nextServer.after.mock.calls[0][0];
    await expect(callback()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Organization membership synchronization could not refresh the roster for did:plc:forest. Failed rosters are left unchanged and will be retried later.",
      expect.any(Error),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Organization membership synchronization could not refresh 1 of 1 organizations. Failed rosters were left unchanged and will be retried later.",
    );
  });

  it("logs the error that causes a failed background organization-list request", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("private upstream details");
    cgs.fetchAllCgsGroupMembershipsWithCookie.mockRejectedValue(error);

    scheduleOrganizationMembershipSync({
      isLoggedIn: true,
      did: "did:plc:alice",
      handle: "alice.gainforest.app",
    }, COOKIE);

    const callback = nextServer.after.mock.calls[0][0];
    await expect(callback()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Organization membership synchronization failed. It will be retried after a future authenticated app load.",
      error,
    );
  });
});
