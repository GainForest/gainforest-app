import type { Metadata } from "next";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { ObservationsSubNav } from "../../_components/ObservationsSubNav";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";
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
 */
export default async function AccountAudioPage({ params, searchParams }: PageProps) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const target = access?.status === "allowed" ? access.target : null;

  const sp = await searchParams;
  const wantsEditor = typeof sp.section === "string" || typeof sp.mode === "string";

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} />
      {target && wantsEditor ? (
        <AudioSection target={target} />
      ) : (
        <AccountAudioViewer
          did={account.did}
          showUploadCta={target?.kind === "personal"}
          canDelete={target ? canDeleteRecord(target).allowed : false}
          mutationRepo={target?.kind === "group" ? target.did : null}
        />
      )}
    </>
  );
}
