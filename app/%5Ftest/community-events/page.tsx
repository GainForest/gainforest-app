import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CommunityEventsExperienceClient } from "./_components/CommunityEventsExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry.communityEvents");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function CommunityEventsExperiencePage() {
  return (
    // The host form inside reads search params, so it needs a boundary here too.
    <Suspense fallback={null}>
      <CommunityEventsExperienceClient />
    </Suspense>
  );
}
