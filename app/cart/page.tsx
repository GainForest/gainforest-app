import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CartView } from "./_components/CartView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.page");
  return { title: t("title"), robots: { index: false } };
}

export default function CartPage() {
  return <CartView />;
}
