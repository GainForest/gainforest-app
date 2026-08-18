import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { accountSettingsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Members — GainForest",
  robots: { index: false, follow: false },
};

/** Members, roles and the Data Council are part of the organization's settings
 *  page now, so administration lives in one place. This route is kept so older
 *  links and bookmarks land somewhere useful. */
export default async function AccountMembersPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  redirect(accountSettingsPath(account.urlIdentifier));
}
