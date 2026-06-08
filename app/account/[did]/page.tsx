import { redirect } from "next/navigation";
import { AccountHomeTabContent } from "../_components/AccountTabContent";
import { accountBumicertsPath, accountPath, getAccountRouteData, readAccountRouteParams } from "../_lib/account-route";

export default async function AccountByDidPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    redirect(accountPath(account.urlIdentifier));
  }

  if (account.kind === "user") {
    redirect(accountBumicertsPath(account.urlIdentifier));
  }

  return <AccountHomeTabContent account={account} />;
}
