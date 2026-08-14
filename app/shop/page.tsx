import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { ShopClient } from "./_components/ShopClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shop.meta");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/shop" },
    robots: { index: false, follow: false },
  };
}

export default async function ShopPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  return <ShopClient />;
}
