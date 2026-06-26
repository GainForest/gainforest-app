import { redirect } from "next/navigation";
import { AccountHomeTabContent, AccountOverviewTabContent } from "../_components/AccountTabContent";
import { accountPath, getAccountRouteData, readAccountRouteParams } from "../_lib/account-route";

export default async function AccountByDidPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    redirect(accountPath(account.urlIdentifier));
  }

  if (account.kind === "user") {
    return <AccountOverviewTabContent account={account} did={did} />;
  }

  return <AccountHomeTabContent account={account} />;
}
