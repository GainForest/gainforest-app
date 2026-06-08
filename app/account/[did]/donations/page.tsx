import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountDonationsTabContent } from "../../_components/AccountTabContent";
import { accountDonationsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: `${account.displayName} — Donation History`,
    description: `Donation history for ${account.displayName}.`,
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}/donations` },
  };
}

export default async function AccountDonationsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    redirect(accountDonationsPath(account.urlIdentifier));
  }

  return <AccountDonationsTabContent account={account} did={did} />;
}
