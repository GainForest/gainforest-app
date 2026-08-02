import type { Metadata } from "next";
import { OrgManageTabContent } from "../../_components/OrgManageTabContent";
import { ObservationsSubNav } from "../../_components/ObservationsSubNav";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Drone — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountDronePage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} showPrivate />
      <OrgManageTabContent identifier={account.urlIdentifier} tab="drone" />
    </>
  );
}
