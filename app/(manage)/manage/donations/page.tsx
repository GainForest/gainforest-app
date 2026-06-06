import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchReceipts } from "@/app/_lib/dashboard";
import { fetchBumicertsByDid } from "@/app/_lib/indexer";
import { DonationHistory } from "@/app/account/_components/DonationHistory";
import { AccountContentColumns, AccountSidebar } from "@/app/account/_components/AccountSidebar";
import { getAccountRouteData } from "@/app/account/_lib/account-route";

export const metadata: Metadata = {
  title: "Donation History — Bumicerts",
  description: "View your public donation history.",
  robots: { index: false, follow: false },
};

export default async function ManageDonationsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);
  if (account.kind !== "user") notFound();

  const [receipts, bumicerts] = await Promise.all([
    fetchReceipts().catch(() => []),
    fetchBumicertsByDid(session.did, 1000).then((page) => page.records).catch(() => []),
  ]);
  const userDonations = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === session.did);

  return (
    <AccountContentColumns sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={userDonations.length} />}>
      <section className="py-6">
        <DonationHistory receipts={userDonations} />
      </section>
    </AccountContentColumns>
  );
}
