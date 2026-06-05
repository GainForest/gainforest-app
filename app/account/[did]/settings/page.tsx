import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAuthSession } from "../../../_lib/auth-server";
import { AccountSettingsSections } from "../../_components/AccountSettingsSections";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: `${account.displayName} — Settings`,
    description: "Account settings.",
    robots: { index: false, follow: false },
  };
}

export default async function AccountSettingsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, session] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchAuthSession(),
  ]);

  if (!session.isLoggedIn || session.did !== did) {
    notFound();
  }

  return <AccountSettingsSections account={account} />;
}
