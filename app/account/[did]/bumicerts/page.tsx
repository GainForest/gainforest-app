import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountBumicertsTabContent } from "../../_components/AccountTabContent";
import { accountBumicertsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: `${account.displayName}'s Bumicerts`,
    description: `Public Bumicerts created by ${account.displayName}.`,
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}/bumicerts` },
  };
}

export default async function AccountBumicertsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    redirect(accountBumicertsPath(account.urlIdentifier));
  }

  return <AccountBumicertsTabContent account={account} did={did} />;
}
