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
      const lastSyncedAt = await latestRosterSync(group.groupDid);
      if (lastSyncedAt && lastSyncedAt.getTime() > Date.now() - ORGANIZATION_ROSTER_SYNC_INTERVAL_MS) {
        result.skipped += 1;
        continue;
      }

      // This timestamp represents when the CGS snapshot began. The database
      // rejects it if a newer concurrent snapshot has already been applied.
      const observedAt = new Date();
      const members = await fetchAllCgsMembersWithCookie({
        repo: group.groupDid,
        cookie,
      });
      const applied = await supabaseRpc<boolean>("organization_memberships_replace_roster", {
        p_organization_did: group.groupDid,
        p_members: members.map(member => ({ memberDid: member.did, role: member.role })),
        p_observed_at: observedAt.toISOString(),
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
