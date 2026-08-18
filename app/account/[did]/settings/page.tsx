import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { SettingsSection } from "@/app/(manage)/manage/_sections";
import { readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Settings — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage({ params }: { params: Promise<{ did: string }> }) {
  const { urlIdentifier } = await readAccountRouteParams(params);
  // Settings are private: only the owner (or an org member with edit rights)
  // gets here. Everyone else gets a 404 instead of the public profile chrome.
  const access = await resolveAccountManageAccess(urlIdentifier);
  if (access.status !== "allowed") notFound();

  return <SettingsSection target={access.target} />;
}
