import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { AccountEndorsementsGivenTabContent } from "../../_components/AccountTabContent";
import {
  accountEndorsementsGivenPath,
  getAccountRouteData,
  readAccountRouteParams,
  readOptionalAccountRouteParams,
} from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const routeParams = await readOptionalAccountRouteParams(params);
  if (!routeParams) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }
  const [account, t] = await Promise.all([
    getAccountRouteData(routeParams.did, routeParams.urlIdentifier),
    getTranslations("common.accountTabs"),
  ]);
  return {
    title: `${account.displayName} — ${t("endorsementsGiven")}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountEndorsementsGivenPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (account.kind !== "organization") {
    notFound();
  }

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountEndorsementsGivenPath(account.urlIdentifier)} />;
  }

  return <AccountEndorsementsGivenTabContent account={account} did={account.did} />;
}
