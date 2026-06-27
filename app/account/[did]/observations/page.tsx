import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { AccountObservationsTabContent } from "../../_components/AccountTabContent";
import { ObservationsSubNav } from "../../_components/ObservationsSubNav";
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

  // Trees / Audio / Drone are private sub-views, so only show the secondary nav
  // to the owner / organization manager.
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} showPrivate={access?.status === "allowed"} />
      <AccountObservationsTabContent account={account} did={did} />
    </>
  );
}
