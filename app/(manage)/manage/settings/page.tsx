import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AccountSettingsSections } from "@/app/account/_components/AccountSettingsSections";

export const metadata: Metadata = {
  title: "Settings — Bumicerts",
  description: "Manage your Bumicerts account settings.",
  robots: { index: false, follow: false },
};

export default async function ManageSettingsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  return <AccountSettingsSections did={session.did} />;
}
