import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchCommunityEvent, type CommunityEvent } from "@/app/_lib/community-events";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { EventDetailClient } from "../../_components/EventDetailClient";

export const revalidate = 60;

type EventPageParams = Promise<{ did: string; rkey: string }>;

async function isModerator(): Promise<boolean> {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  return Boolean(moderator?.isModerator);
}

async function loadEvent(params: EventPageParams): Promise<{ did: string; rkey: string; event: CommunityEvent | null }> {
  const { did: encodedDid, rkey: encodedRkey } = await params;
  const did = decodeURIComponent(encodedDid);
  const rkey = decodeURIComponent(encodedRkey);
  const event = await fetchCommunityEvent(did, rkey).catch(() => null);
  return { did, rkey, event };
}

export async function generateMetadata({ params }: { params: EventPageParams }): Promise<Metadata> {
  const t = await getTranslations("events.metadata");
  // Staff preview: never leak event details to non-admin visitors or
  // crawlers — they get the generic section title and a noindex.
  if (!(await isModerator())) {
    return { title: t("title"), robots: { index: false, follow: false } };
  }
  const [{ event }, locale] = await Promise.all([loadEvent(params), getLocale()]);
  if (!event) {
    return { title: t("title"), robots: { index: false, follow: false } };
  }
  const when = event.startsAt
    ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(event.startsAt))
    : null;
  const description = [when, event.locationName ?? event.locality, event.description].filter(Boolean).join(" · ").slice(0, 200) || t("description");
  return {
    title: event.name,
    description,
    robots: { index: false, follow: false },
  };
}

// Gated to GainForest admins while Community Events is in staff preview —
// same server-side check as the discovery page and the sidebar entry.
export default async function EventPage({ params }: { params: EventPageParams }) {
  if (!(await isModerator())) {
    notFound();
  }
  const { did, rkey, event } = await loadEvent(params);
  return <EventDetailClient did={did} rkey={rkey} initialEvent={event} />;
}
