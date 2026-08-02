import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FollowConnections } from "../../_components/FollowConnections";
import {
  accountFollowingPath,
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
    getTranslations("common.follow"),
  ]);
  return {
    title: `${account.displayName} — ${t("followingTab")}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountFollowingPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  return <FollowConnections did={account.did} identifier={account.urlIdentifier} active="following" />;
}
