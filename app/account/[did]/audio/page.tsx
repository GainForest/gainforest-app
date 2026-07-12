import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { ObservationsSubNav } from "../../_components/ObservationsSubNav";
import { accountAudioPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";
import { AudioSection } from "@/app/(manage)/manage/_sections";
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
 * here duplicates them. The legacy record editor is still reachable through
 * explicit `?section=…` / `?mode=…` deep links for advanced record surgery.
 */
export default async function AccountAudioPage({ params, searchParams }: PageProps) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountAudioPath(account.urlIdentifier)} />;
  }

  const access = await resolveAccountManageAccess(account.urlIdentifier);
  if (access.status !== "allowed") notFound();
  const target = access.target;

  const sp = await searchParams;
  const wantsEditor = typeof sp.section === "string" || typeof sp.mode === "string";

  return (
    <>
      <ObservationsSubNav identifier={account.urlIdentifier} showPrivate />
      {wantsEditor ? (
        <AudioSection target={target} />
      ) : (
        <AccountAudioViewer did={target.did} showUploadCta={target.kind === "personal"} />
      )}
    </>
  );
}
