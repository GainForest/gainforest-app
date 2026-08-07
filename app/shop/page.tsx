import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShopClient } from "./_components/ShopClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shop.meta");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/shop" },
  };
}

export default async function ShopPage() {
  return <ShopClient />;
}
