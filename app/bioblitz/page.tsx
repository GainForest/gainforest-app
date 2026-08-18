import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { BioblitzPageSkeleton } from "../_components/PageLoadingSkeletons";
import { BioblitzClient } from "./BioblitzClient";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.bioblitz.metadata");

  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: await localizedAlternates("/bioblitz"),
    ...socialPreviewMetadata("/bioblitz", title, description),
  };
}

export default function BioblitzPage() {
  return (
    <Suspense fallback={<BioblitzPageSkeleton />}>
      <BioblitzClient />
    </Suspense>
  );
}
