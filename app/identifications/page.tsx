import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.identifications.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/observations/audio?tab=identifications" },
  };
}

export default async function IdentificationsPage() {
  redirect("/observations/audio?tab=identifications");
}
