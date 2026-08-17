import { AccountOverviewContent } from "../_components/AccountTabContent";
import { getAccountRouteData, readAccountRouteParams } from "../_lib/account-route";

export default async function AccountByDidPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  // Canonical URL normalization happens once in the account layout
  // (<AccountCanonicalPath/>), so tabs don't each trigger a redirect.
  return <AccountOverviewContent account={account} did={did} />;
}
