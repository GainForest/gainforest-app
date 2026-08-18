import { after } from "next/server";
import { supabaseFilterValue, supabaseRpc, supabaseSelect } from "@/lib/supabase/rest";
import type { AuthSession } from "./auth";
import {
  fetchAllCgsGroupMembershipsWithCookie,
  fetchAllCgsMembersWithCookie,
} from "./cgs-server";

export const ORGANIZATION_ROSTER_SYNC_INTERVAL_MS = 30 * 60 * 1000;

type RosterFreshnessRow = {
  roster_synced_at: string;
};

export type OrganizationMembershipSyncResult = {
  organizations: number;
  synced: number;
  skipped: number;
  failed: number;
};

async function latestRosterSync(organizationDid: string): Promise<Date | null> {
  const rows = await supabaseSelect<RosterFreshnessRow>(
    `/organization_memberships?select=roster_synced_at&organization_did=eq.${supabaseFilterValue(organizationDid)}&order=roster_synced_at.desc&limit=1`,
  );
  const timestamp = rows[0]?.roster_synced_at;
  if (!timestamp) return null;
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

async function syncOrganizationRoster({
  organizationDid,
  cookie,
  force = false,
}: {
  organizationDid: string;
  cookie: string;
  force?: boolean;
}): Promise<boolean> {
  if (!force) {
    const lastSyncedAt = await latestRosterSync(organizationDid);
    if (lastSyncedAt && lastSyncedAt.getTime() > Date.now() - ORGANIZATION_ROSTER_SYNC_INTERVAL_MS) {
      return false;
    }
  }

  // This timestamp represents when the CGS snapshot began. The database
  // rejects it if a newer concurrent snapshot has already been applied.
  const observedAt = new Date();
  const members = await fetchAllCgsMembersWithCookie({
    repo: organizationDid,
    cookie,
  });
  return supabaseRpc<boolean>("organization_memberships_replace_roster", {
    p_organization_did: organizationDid,
    p_members: members.map(member => ({ memberDid: member.did, role: member.role })),
    p_observed_at: observedAt.toISOString(),
  });
}

export async function syncOrganizationMemberships({
  cookie,
}: {
  cookie: string;
}): Promise<OrganizationMembershipSyncResult> {
  const groups = await fetchAllCgsGroupMembershipsWithCookie(cookie);
  const result: OrganizationMembershipSyncResult = {
    organizations: groups.length,
    synced: 0,
    skipped: 0,
    failed: 0,
  };

  for (const group of groups) {
    try {
      const applied = await syncOrganizationRoster({
        organizationDid: group.groupDid,
        cookie,
      });
      if (applied) result.synced += 1;
      else result.skipped += 1;
    } catch (error) {
      // One unavailable organization must not prevent another accessible
      // organization from refreshing its roster.
      console.error(
        `Organization membership synchronization could not refresh the roster for ${group.groupDid}. Failed rosters are left unchanged and will be retried later.`,
        error,
      );
      result.failed += 1;
    }
  }

  return result;
}

/**
 * Refresh one known organization after CGS has accepted a membership mutation.
 * It intentionally bypasses the periodic freshness interval, but never turns a
 * successful CGS mutation into a failed request when the projection is down.
 */
export function scheduleOrganizationRosterSync(organizationDid: string, cookie: string | null): void {
  if (!organizationDid.startsWith("did:") || !cookie) return;

  after(async () => {
    try {
      await syncOrganizationRoster({ organizationDid, cookie, force: true });
    } catch (error) {
      console.error(
        `Organization membership synchronization could not refresh the roster for ${organizationDid} after a membership mutation. The periodic sync will retry later.`,
        error,
      );
    }
  });
}

export function scheduleOrganizationMembershipSync(session: AuthSession, cookie: string | null): void {
  if (!session.isLoggedIn || !cookie) return;

  after(async () => {
    try {
      const result = await syncOrganizationMemberships({ cookie });
      if (result.failed > 0) {
        console.error(
          `Organization membership synchronization could not refresh ${result.failed} of ${result.organizations} organizations. Failed rosters were left unchanged and will be retried later.`,
        );
      }
    } catch (error) {
      console.error(
        "Organization membership synchronization failed. It will be retried after a future authenticated app load.",
        error,
      );
    }
  });
}
