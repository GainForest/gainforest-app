import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { StatusSection } from "../_components/StatusSection";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.status.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates("/status"),
  };
}

export default function StatusPage() {
  return <StatusSection />;
}
