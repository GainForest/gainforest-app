import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { EventsDiscoveryClient } from "./_components/EventsDiscoveryClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.metadata");
  return {
    title: t("title"),
    description: t("description"),
    // Staff preview: keep the section out of search results until it opens up.
    robots: { index: false, follow: false },
  };
}

// Community Events is gated to GainForest admins while in staff preview
// (ECO-904 tracks the open questions before a public launch). The sidebar
// entry is hidden for everyone else too; this server-side check is the
// real gate.
export default async function EventsPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }
  return <EventsDiscoveryClient />;
}
