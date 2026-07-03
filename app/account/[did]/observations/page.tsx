import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { TreesSection } from "@/app/(manage)/manage/_sections";
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

export default async function AccountObservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountObservationsPath(account.urlIdentifier)} />;
  }

  // Measurements / Audio / Drone are private layers, so only show the secondary
  // nav to the owner / organization manager.
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const canManage = access?.status === "allowed";
  const storageNoteT = canManage ? await getTranslations("common.accountObservations.storageNote") : null;

  // Trees are just occurrences with measurements, so they live as a layer of the
  // Observations route (?layer=measurements) rather than a separate tab.
  const layerParam = (await searchParams).layer;
  const showMeasurements = canManage && (Array.isArray(layerParam) ? layerParam[0] : layerParam) === "measurements";

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} showPrivate={canManage} />
      {storageNoteT ? (
        <div className="mb-5 rounded-2xl bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
          {storageNoteT(account.kind === "organization" ? "organization" : "user", { accountName: account.displayName })}
        </div>
      ) : null}
      {showMeasurements && access?.status === "allowed" ? (
        <TreesSection target={access.target} />
      ) : (
        <AccountObservationsTabContent account={account} did={did} />
      )}
    </>
  );
}
