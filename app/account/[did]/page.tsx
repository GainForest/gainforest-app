import { CanonicalRedirect } from "../_components/CanonicalRedirect";
import { AccountOverviewContent } from "../_components/AccountTabContent";
import { accountPath, getAccountRouteData, readAccountRouteParams } from "../_lib/account-route";

export default async function AccountByDidPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountPath(account.urlIdentifier)} />;
  }

  return <AccountOverviewContent account={account} did={did} />;
}
