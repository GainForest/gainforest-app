import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { AccountGalleryTabContent } from "../../_components/AccountTabContent";
import { GallerySubNav } from "../../_components/GallerySubNav";
import { accountGalleryPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, t] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("common.projectGallery"),
  ]);
  return {
    title: t("accountMetadataTitle", { name: account.displayName }),
    description: t("accountMetadataDescription", { name: account.displayName }),
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}/gallery` },
  };
}

export default async function AccountGalleryPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountGalleryPath(account.urlIdentifier)} />;
  }

  return (
    <>
      <GallerySubNav identifier={account.urlIdentifier} />
      <AccountGalleryTabContent account={account} did={did} />
    </>
  );
}
