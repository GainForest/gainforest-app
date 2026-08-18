import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { StatusSection } from "../_components/StatusSection";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.status.metadata");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: await localizedAlternates("/status"),
    ...socialPreviewMetadata("/status", title, description),
  };
}

export default function StatusPage() {
  return <StatusSection />;
}
