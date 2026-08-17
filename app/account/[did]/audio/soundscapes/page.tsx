import type { Metadata } from "next";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { AudioSubTabs } from "../../../_components/AudioSubTabs";
import { ObservationsSubNav } from "../../../_components/ObservationsSubNav";
import { getAccountRouteData, readAccountRouteParams } from "../../../_lib/account-route";
import { AccountSoundscapesViewer } from "./AccountSoundscapesViewer";

export const metadata: Metadata = {
  title: "Soundscapes — GainForest",
  robots: { index: false, follow: false },
};

/**
 * The Soundscapes view of the profile's Audio tab — the published 24-hour
 * sound portraits, standing beside the raw recordings the tab opens on. The
 * page is public for the same reason the recordings are: soundscape records
 * live in public repos and every one already has a public permalink, so
 * anyone gets the playable gallery (see AccountSoundscapesViewer).
 *
 * Nothing is managed here. Soundscapes are built and published from the
 * workbench, so the only management this page knows about is whether the
 * viewer could build one — which decides if the empty state points there.
 */
export default async function AccountAudioSoundscapesPage({
  params,
}: {
  params: Promise<{ did: string }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const canManage = access?.status === "allowed";

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} />
      <AudioSubTabs identifier={account.urlIdentifier} active="soundscapes" />
      <AccountSoundscapesViewer did={account.did} showBuildCta={canManage} />
    </>
  );
}
