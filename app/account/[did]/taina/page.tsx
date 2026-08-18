import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { TainaDashboardClient } from "../../_components/TainaDashboardClient";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Tainá — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountTainaPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);

  // The Tainá dashboard is private: it carries the owner's bot, API key and
  // Telegram conversation. Only the signed-in owner of this profile gets here
  // — everyone else sees a 404 instead of the tab content. Ownership is the
  // whole gate: session DIDs can only ever match personal repos (never CGS
  // group accounts), and some personal accounts legitimately carry an
  // organization record, so we must not additionally require kind === "user".
  const [, session] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
  ]);
  if (!session.isLoggedIn || session.did !== did) notFound();

  return <TainaDashboardClient />;
}
