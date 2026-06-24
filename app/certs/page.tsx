import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BumicertsExploreClient } from "./BumicertsExploreClient";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.explore.metadata");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/certs" },
  };
}

export default function BumicertsPage() {
  return (
    <Suspense fallback={null}>
      <BumicertsExploreClient />
    </Suspense>
  );
}
