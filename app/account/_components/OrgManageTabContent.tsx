import { notFound } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import {
  AudioSection,
  DroneSection,
  SitesSection,
  TreesSection,
} from "@/app/(manage)/manage/_sections";

export type OrgTab = "sites" | "audio" | "drone" | "trees";

/**
 * Private management tabs (Sites, Audio, Drone, Trees) that live on the account
 * profile. These are private surfaces: only the account owner (personal
 * profile) or a manager (organization) can see them, and they 404 for everyone
 * else. They belong to personal accounts and organizations alike — they write
 * to whichever repo the target points at. Members, roles and the Data Council
 * are organization-only, and live in the organization's Settings page.
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
  }
}
