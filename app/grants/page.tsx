import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { fetchAuthSession } from "../_lib/auth-server";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { GrantsClient } from "../_components/GrantsClient";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.grants.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/grants"),
  };
}

export default function GrantsPage() {
  return (
    <Suspense fallback={<ExploreGridPageSkeleton />}>
      <GrantsContent />
    </Suspense>
  );
}

async function GrantsContent() {
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));
  const viewerDid = session.isLoggedIn ? session.did : null;
  return <GrantsClient viewerDid={viewerDid} signedIn={Boolean(viewerDid)} />;
}
