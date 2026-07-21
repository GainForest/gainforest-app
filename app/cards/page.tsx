import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { MyCardsStoreView } from "./_components/MyCardsView";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.myCards");
  return { title: t("title"), robots: { index: false } };
}

export default async function MyCardsPage() {
  const authSession = await fetchAuthSession();
  return <MyCardsStoreView did={authSession.isLoggedIn ? authSession.did : null} />;
}
