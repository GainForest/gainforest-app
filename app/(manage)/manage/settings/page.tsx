import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AccountSettingsSections } from "@/app/account/_components/AccountSettingsSections";
import { getAccountRouteData } from "@/app/account/_lib/account-route";

export const metadata: Metadata = {
  title: "Settings — Bumicerts",
  description: "Manage your Bumicerts account settings.",
  robots: { index: false, follow: false },
};

export default async function ManageSettingsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);

  return <AccountSettingsSections account={account} />;
}
