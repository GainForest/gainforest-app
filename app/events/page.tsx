import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { EventsDiscoveryClient } from "./_components/EventsDiscoveryClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.metadata");
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    alternates: await localizedAlternates("/events"),
    ...socialPreviewMetadata("/events", title, description),
  };
}

export default function EventsPage() {
  return <EventsDiscoveryClient />;
}
