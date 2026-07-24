import type { Metadata } from "next";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { getTranslations } from "next-intl/server";
import { FollowConnections } from "../../_components/FollowConnections";
import {
  accountFollowersPath,
  getAccountRouteData,
  readAccountRouteParams,
  readOptionalAccountRouteParams,
} from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const routeParams = await readOptionalAccountRouteParams(params);
  if (!routeParams) {
    const t = await getTranslations("legacy");
    return { title: t("accountProfileMissing"), robots: { index: false, follow: false } };
  }
  const [account, t] = await Promise.all([
    getAccountRouteData(routeParams.did, routeParams.urlIdentifier),
    getTranslations("common.follow"),
  ]);
  return {
    title: `${account.displayName} — ${t("followersTab")}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountFollowersPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountFollowersPath(account.urlIdentifier)} />;
  }

  return <FollowConnections did={account.did} identifier={account.urlIdentifier} active="followers" />;
}
