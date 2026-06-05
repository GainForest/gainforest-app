import type { Metadata } from "next";
import { AccountBumicertsGrid } from "../../_components/AccountBumicertsGrid";
import { AccountContentColumns, AccountSidebar } from "../../_components/AccountSidebar";
import { fetchReceipts } from "../../../_lib/dashboard";
import { fetchBumicertsByDid } from "../../../_lib/indexer";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: `${account.displayName} — Bumicerts`,
    description: `Public Bumicerts created by ${account.displayName}.`,
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}/bumicerts` },
  };
}

export default async function AccountBumicertsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, bumicerts, receipts] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []),
    fetchReceipts().catch(() => []),
  ]);
  const donationCount = receipts.filter((receipt) =>
    account.kind === "organization"
      ? receipt.orgDid === did
      : receipt.from?.type === "did" && receipt.from.id === did,
  ).length;

  return (
    <AccountContentColumns
      sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={donationCount} />}
    >
      <AccountBumicertsGrid bumicerts={bumicerts} organizationName={account.displayName} logoUrl={account.avatarUrl} />
    </AccountContentColumns>
  );
}
