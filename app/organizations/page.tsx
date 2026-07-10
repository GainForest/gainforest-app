import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { OrganizationsClient } from "./OrganizationsClient";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.organizations.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates("/organizations"),
  };
}

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<ExploreGridPageSkeleton />}>
      <OrganizationsClient />
    </Suspense>
  );
}
