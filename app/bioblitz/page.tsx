import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { BioblitzPageSkeleton } from "../_components/PageLoadingSkeletons";
import { BioblitzClient } from "./BioblitzClient";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.bioblitz.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/bioblitz"),
  };
}

export default function BioblitzPage() {
  return (
    <Suspense fallback={<BioblitzPageSkeleton />}>
      <BioblitzClient />
    </Suspense>
  );
}
