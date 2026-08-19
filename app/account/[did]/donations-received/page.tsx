import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountDonationsReceivedTabContent } from "../../_components/AccountTabContent";
import {
  accountDonationsReceivedPath,
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
    title: `${account.displayName} — ${t("donationsReceived")}`,
    alternates: { canonical: accountDonationsReceivedPath(account.urlIdentifier) },
  };
}

export default async function AccountDonationsReceivedPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  return <AccountDonationsReceivedTabContent did={account.did} />;
}
