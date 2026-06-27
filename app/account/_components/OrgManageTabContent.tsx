import { notFound } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  AudioSection,
  DroneSection,
  SitesSection,
  TreesSection,
} from "@/app/(manage)/manage/_sections";
import { GroupMembers } from "@/app/(manage)/manage/groups/_components/GroupMembers";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";

export type OrgTab = "sites" | "audio" | "drone" | "trees" | "members";

/**
 * Private management tabs (Sites, Audio, Drone, Trees, Members) that live on the
 * account profile. These are private surfaces: only the account owner (personal
 * profile) or a manager (organization) can see them, and they 404 for everyone
 * else. Sites/Trees/Audio/Drone belong to personal accounts and organizations
 * alike — they write to whichever repo the target points at. Members + the Data
 * Council stay organization-only governance surfaces.
 */
export async function OrgManageTabContent({ identifier, tab }: { identifier: string; tab: OrgTab }) {
  const access = await resolveAccountManageAccess(identifier);
  if (access.status !== "allowed") notFound();
  const target = access.target;

  switch (tab) {
    case "sites":
      return <SitesSection target={target} />;
    case "audio":
      return <AudioSection target={target} />;
    case "drone":
      return <DroneSection target={target} />;
    case "trees":
      return <TreesSection target={target} />;
    case "members": {
      // Members + Data Council are organization-only governance surfaces.
      if (target.kind !== "group") notFound();
      const role: CgsRole = target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member";
      const session = await fetchAuthSession();
      const currentUserDid = target.currentUserDid ?? (session.isLoggedIn ? session.did : null);
      return (
        <div className="py-4">
          <GroupMembers
            groupDid={target.did}
            currentRole={role}
            currentUserDid={currentUserDid}
            variant="section"
            showDataCouncil
          />
        </div>
      );
    }
  }
}
