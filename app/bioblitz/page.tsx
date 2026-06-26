import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BioblitzClient } from "./BioblitzClient";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.bioblitz.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/bioblitz" },
  };
}

export default function BioblitzPage() {
  return (
    <Suspense fallback={null}>
      <BioblitzClient />
    </Suspense>
  );
}
