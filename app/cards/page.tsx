import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { MyCardsView } from "./_components/MyCardsView";
import { fetchEarnedCards } from "./_lib/receipt-cards";

export const dynamic = "force-dynamic";

type CardsSearchParams = Promise<{ receipt?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.myCards");
  return { title: t("title"), robots: { index: false } };
}

export default async function MyCardsPage({ searchParams }: { searchParams: CardsSearchParams }) {
  const [authSession, params, t] = await Promise.all([
    fetchAuthSession(),
    searchParams,
    getTranslations("cart.myCards"),
  ]);

  if (!authSession.isLoggedIn) {
    return <MyCardsView cards={[]} status="signedOut" />;
  }

  const recentReceiptUris = Array.isArray(params.receipt)
    ? params.receipt
    : typeof params.receipt === "string"
      ? [params.receipt]
      : [];

  try {
    const result = await fetchEarnedCards(authSession.did, recentReceiptUris, {
      projectTitle: t("fallbackProject"),
      organizationName: t("fallbackOrganization"),
    });
    return <MyCardsView cards={result.cards} status="ready" partial={result.partial} />;
  } catch (error) {
    console.error("[cards] Failed to load receipt-backed cards:", error);
    return <MyCardsView cards={[]} status="unavailable" />;
  }
}
