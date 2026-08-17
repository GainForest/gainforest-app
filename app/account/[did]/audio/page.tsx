import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { ObservationsSubNav } from "../../_components/ObservationsSubNav";
import { ManageActionRow } from "../../_components/ManageActionRow";
import {
  accountAudioManagePath,
  getAccountRouteData,
  readAccountRouteParams,
} from "../../_lib/account-route";
import { AudioSection } from "@/app/(manage)/manage/_sections";
import { canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import { AccountAudioViewer } from "./AccountAudioViewer";

export const metadata: Metadata = {
  title: "Audio — GainForest",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ did: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * The profile's Audio tab. The default view is a simple player gallery of
 * the account's recordings grouped by deployment (see AccountAudioViewer) —
 * uploading and deployment editing live on the AudioMoth page, so nothing
 * here duplicates them. The page is public: recordings live in public repos
 * and the audio explore page links every visitor here, so anyone gets the
 * read-only gallery. Owners and organization managers additionally get
 * upload/rename/delete powers, and the legacy record editor stays reachable
 * for them through explicit `?section=…` / `?mode=…` deep links.
 *
 * That last part is being moved out: for GainForest admins this tab is the
 * listening view and the recording tools live on the dedicated manage page,
 * the same staged split the observations tab follows. Every other steward
 * keeps their tools here until that page opens up.
 */
export default async function AccountAudioPage({ params, searchParams }: PageProps) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const target = access?.status === "allowed" ? access.target : null;

  const moderator = target ? await getGainForestModeratorAccess().catch(() => null) : null;
  const useManagePage = Boolean(moderator?.isModerator);

  const sp = await searchParams;
  const wantsEditor = typeof sp.section === "string" || typeof sp.mode === "string";

  // The editor belongs to the manage page for this viewer; forward the deep
  // link with its query intact so the old addresses still open it.
  if (useManagePage && wantsEditor) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      const raw = Array.isArray(value) ? value[0] : value;
      if (typeof raw === "string" && raw.length > 0) query.set(key, raw);
    }
    redirect(`${accountAudioManagePath(account.urlIdentifier)}?${query.toString()}`);
  }

  const manageAction = useManagePage
    ? await getTranslations("common.audioManage").then((t) => ({
        href: accountAudioManagePath(account.urlIdentifier),
        label: t("rowTitle"),
        description: t("rowDescription"),
      }))
    : null;

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} />
      {target && wantsEditor ? (
        <AudioSection target={target} />
      ) : (
        <>
          <ManageActionRow action={manageAction} />
          <AccountAudioViewer
            did={account.did}
            showUploadCta={!useManagePage && target?.kind === "personal"}
            canDelete={!useManagePage && target ? canDeleteRecord(target).allowed : false}
            mutationRepo={!useManagePage && target?.kind === "group" ? target.did : null}
          />
        </>
      )}
    </>
  );
}
