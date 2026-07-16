import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { WalletTabClient } from "../../_components/WalletTabClient";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Wallet — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountWalletPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);

  // The wallet tab is private: it manages the owner's donation wallet and its
  // passkey signers. Only the signed-in owner of this profile gets here —
  // everyone else sees a 404. Ownership is the whole gate: session DIDs can
  // only ever match personal repos (never CGS group accounts), and some
  // personal accounts legitimately carry an organization record, so we must
  // not additionally require kind === "user". (Organization wallets are
  // managed from the funding settings instead.)
  const [, session] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
  ]);
  if (!session.isLoggedIn || session.did !== did) notFound();

  return <WalletTabClient />;
}
