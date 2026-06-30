import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { AccountAttachmentsTabContent } from "../../_components/AccountAttachments";
import { accountAttachmentsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, t] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("common.accountAttachments"),
  ]);
  return {
    title: t("metaTitle", { name: account.displayName }),
    description: t("metaDescription", { name: account.displayName }),
    alternates: { canonical: accountAttachmentsPath(account.urlIdentifier) },
  };
}

export default async function AccountAttachmentsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountAttachmentsPath(account.urlIdentifier)} />;
  }

  return <AccountAttachmentsTabContent account={account} did={did} />;
}
