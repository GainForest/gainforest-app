import { Suspense } from "react";
import { CanonicalRedirect } from "../_components/CanonicalRedirect";
import { AccountHomeTabContent, AccountOverviewTabContent } from "../_components/AccountTabContent";
import { AccountOverviewDetailsSection } from "../_components/AccountOverviewDetailsSection";
import { AccountOverviewDetailsSkeleton } from "../_components/AccountHeroSkeleton";
import { accountPath, getAccountRouteData, readAccountRouteParams } from "../_lib/account-route";

export default async function AccountByDidPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountPath(account.urlIdentifier)} />;
  }

  return (
    <>
      <Suspense fallback={<AccountOverviewDetailsSkeleton />}>
        <AccountOverviewDetailsSection account={account} />
      </Suspense>
      {account.kind === "user" ? (
        <AccountOverviewTabContent account={account} did={did} />
      ) : (
        <AccountHomeTabContent account={account} />
      )}
    </>
  );
}
