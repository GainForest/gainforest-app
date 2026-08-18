import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { HostEventClient } from "../_components/HostEventClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.host");
  return {
    title: t("title"),
    // The form is personal (draft, edit): keep it out of search results.
    robots: { index: false, follow: false },
  };
}

// Gated to GainForest admins while Community Events is in staff preview —
// same server-side check as the discovery page and the sidebar entry.
export default async function HostEventPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }
  return (
    // useSearchParams (the ?edit= mode) requires a Suspense boundary.
    <Suspense fallback={null}>
      <HostEventClient />
    </Suspense>
  );
}
