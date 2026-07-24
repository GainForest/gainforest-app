import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { DonationHistory } from "@/app/account/_components/DonationHistory";
import { fetchOwnAnonymousReceipts } from "@/app/_lib/anonymous-donations";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchReceipts } from "@/app/_lib/dashboard";
import { accountDonationsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";
import { buildDonationHistoryResult } from "./history-model";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const [{ did, urlIdentifier }, t] = await Promise.all([
    readAccountRouteParams(params),
    getTranslations("marketplace.account.metadata"),
  ]);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: t("donationsPageTitle", { displayName: account.displayName }),
    description: t("donationsPageDescription", { displayName: account.displayName }),
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}/donations` },
  };
}

export default async function AccountDonationsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountDonationsPath(account.urlIdentifier)} />;
  }
  if (account.kind !== "user") notFound();

  const [receiptsResult, sessionResult] = await Promise.allSettled([
    fetchReceipts(),
    fetchAuthSession(),
  ]);
  const session = sessionResult.status === "fulfilled" ? sessionResult.value : null;
  const viewerIsOwner = Boolean(session?.isLoggedIn && session.did === did);

  const anonymousResult = viewerIsOwner && receiptsResult.status === "fulfilled"
    ? await fetchOwnAnonymousReceipts(did)
        .then((receipts) => ({ available: true, receipts }))
        .catch(() => ({ available: false, receipts: [] as Awaited<ReturnType<typeof fetchOwnAnonymousReceipts>> }))
    : { available: true, receipts: [] };
  const history = buildDonationHistoryResult(
    receiptsResult.status === "fulfilled" ? receiptsResult.value : null,
    did,
    anonymousResult.receipts,
    anonymousResult.available,
  );

  return (
    <section className="py-6">
      <DonationHistory
        receipts={history.receipts}
        status={history.status}
        showAnonymousNote={viewerIsOwner}
      />
    </section>
  );
}
