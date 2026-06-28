import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProfileActivity } from "../../_components/ProfileActivity";
import {
  accountPostsPath,
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
    getTranslations("common.activity"),
  ]);
  return {
    title: `${account.displayName} — ${t("postsTab")}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountPostsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    redirect(accountPostsPath(account.urlIdentifier));
  }

  return <ProfileActivity did={account.did} identifier={account.urlIdentifier} active="posts" />;
}
