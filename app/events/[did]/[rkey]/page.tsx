import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchCommunityEvent, type CommunityEvent } from "@/app/_lib/community-events";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { EventDetailClient } from "../../_components/EventDetailClient";

export const revalidate = 60;

type EventPageParams = Promise<{ did: string; rkey: string }>;

async function loadEvent(params: EventPageParams): Promise<{ did: string; rkey: string; event: CommunityEvent | null }> {
  const { did: encodedDid, rkey: encodedRkey } = await params;
  const did = decodeURIComponent(encodedDid);
  const rkey = decodeURIComponent(encodedRkey);
  const event = await fetchCommunityEvent(did, rkey).catch(() => null);
  return { did, rkey, event };
}

export async function generateMetadata({ params }: { params: EventPageParams }): Promise<Metadata> {
  const [{ did, rkey, event }, t, locale] = await Promise.all([loadEvent(params), getTranslations("events.metadata"), getLocale()]);
  const path = `/events/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
  if (!event) {
    return { title: t("title"), alternates: await localizedAlternates(path) };
  }
  const when = event.startsAt
    ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(event.startsAt))
    : null;
  const description = [when, event.locationName ?? event.locality, event.description].filter(Boolean).join(" · ").slice(0, 200) || t("description");
  return {
    title: event.name,
    description,
    alternates: await localizedAlternates(path),
    ...socialPreviewMetadata(path, event.name, description),
  };
}

export default async function EventPage({ params }: { params: EventPageParams }) {
  const { did, rkey, event } = await loadEvent(params);
  return <EventDetailClient did={did} rkey={rkey} initialEvent={event} />;
}
