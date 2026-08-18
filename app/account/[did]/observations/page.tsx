import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { TreesSection } from "@/app/(manage)/manage/_sections";
import { AccountObservationsTabContent } from "../../_components/AccountTabContent";
import { ObservationsSubNav } from "../../_components/ObservationsSubNav";
import {
  accountObservationsManagePath,
  getAccountRouteData,
  readAccountRouteParams,
} from "../../_lib/account-route";

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

  // Manage access only gates the private measurements layer — the secondary
  // nav itself (Photos / Audio) is public.
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const canManage = access?.status === "allowed";

  // The tab/manage split ships to GainForest admins first, on the same staged
  // footing as the audio workspace: for them this tab is the public view of
  // the sightings and the working tools live on the dedicated manage page.
  // Everyone else keeps the inline editor here until that page opens up, so
  // no steward loses their tools in the meantime.
  const moderator = canManage ? await getGainForestModeratorAccess().catch(() => null) : null;
  const useManagePage = Boolean(moderator?.isModerator);

  const sp = await searchParams;
  if (useManagePage) {
    // Deep links that open a tool — the measurements layer, the add flow, a
    // pre-picked project — belong to the manage page for this viewer. Forward
    // them with the query intact so every "Add data" entry point still works.
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      const raw = Array.isArray(value) ? value[0] : value;
      if (typeof raw === "string" && raw.length > 0) query.set(key, raw);
    }
    if (query.get("layer") === "measurements" || query.has("mode") || query.has("attachTo")) {
      redirect(`${accountObservationsManagePath(account.urlIdentifier)}?${query.toString()}`);
    }
  }

  // Trees are just occurrences with measurements, so they live as a layer of the
  // Observations route (?layer=measurements) rather than a separate tab.
  const layerParam = sp.layer;
  const showMeasurements = canManage && (Array.isArray(layerParam) ? layerParam[0] : layerParam) === "measurements";

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} />
      {showMeasurements && access?.status === "allowed" ? (
        <TreesSection target={access.target} />
      ) : (
        <AccountObservationsTabContent account={account} did={did} publicViewOnly={useManagePage} />
      )}
    </>
  );
}
