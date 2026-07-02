import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { GlobeExplorer } from "./_components/GlobeExplorer";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.globe.metadata");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/globe" },
  };
}

export default function GlobePage() {
  return (
    <Suspense fallback={null}>
      <GlobeExplorer />
    </Suspense>
  );
}
