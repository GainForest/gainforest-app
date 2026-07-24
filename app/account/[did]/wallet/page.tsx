import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { WalletTabClient } from "../../_components/WalletTabClient";
import { getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.accountTabs");
  return {
    title: `${t("wallet")} — GainForest`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountWalletPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);

  // Wallets are private management surfaces. A personal wallet belongs only
  // to its signed-in owner; an organization wallet is available to every org
  // member, with create/delete and signer removal still role-gated by the API.
  const [account, session, access] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    resolveAccountManageAccess(urlIdentifier).catch(() => null),
  ]);

  if (access?.status === "allowed" && access.target.kind === "group") {
    return <WalletTabClient organization={{ did: access.target.did, name: account.displayName }} />;
  }

  if (!session.isLoggedIn || session.did !== did) notFound();
  return <WalletTabClient />;
}
