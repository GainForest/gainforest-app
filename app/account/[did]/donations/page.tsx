import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DonationHistory } from "../../_components/DonationHistory";
import {
  AccountContentColumns,
  AccountSidebar,
} from "../../_components/AccountSidebar";
import { fetchReceipts } from "../../../_lib/dashboard";
import { fetchBumicertsByDid } from "../../../_lib/indexer";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: `${account.displayName} — Donation History`,
    description: `Donation history for ${account.displayName}.`,
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}/donations` },
  };
}

export default async function AccountDonationsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (account.kind !== "user") {
    notFound();
  }

  const [receipts, bumicerts] = await Promise.all([
    fetchReceipts().catch(() => []),
    fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []),
  ]);
  const userDonations = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === did);

  return (
    <AccountContentColumns sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={userDonations.length} />}>
      <section className="py-6">
        <DonationHistory receipts={userDonations} />
      </section>
    </AccountContentColumns>
  );
}
