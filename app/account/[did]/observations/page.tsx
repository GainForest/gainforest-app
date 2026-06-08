import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountObservationsTabContent } from "../../_components/AccountTabContent";
import { accountObservationsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: `${account.displayName} — Observations`,
    description: `Nature sightings shared by ${account.displayName}.`,
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}/observations` },
  };
}

export default async function AccountObservationsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    redirect(accountObservationsPath(account.urlIdentifier));
  }

  return <AccountObservationsTabContent account={account} did={did} />;
}
