import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { CheckoutView } from "./_components/CheckoutView";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.checkoutPage");
  return { title: t("title"), robots: { index: false } };
}

export default async function CheckoutPage() {
  const authSession = await fetchAuthSession();
  return <CheckoutView authSession={authSession} />;
}
