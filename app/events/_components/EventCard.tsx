"use client";

/**
 * The two discovery cards from the wireframe: the editorial "featured" card
 * (cover photo, larger) and the list card (scannable date block). Card
 * anatomy: date, title (two lines max), format + place + time on one line,
 * host, attendee faces + count + spots left, and the RSVP trailing control.
 */

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { eventHref, type CommunityEvent, type EventCrowd } from "@/app/_lib/community-events";
import { eventDateBlock, eventShortDateLine, eventTimeRange } from "../_lib/dates";
import type { EventAccountCard } from "../_lib/adapter";
import { AvatarFace, FaceStack, RsvpTrailingControl } from "./EventBits";

export type EventCardData = {
  event: CommunityEvent;
  crowd: EventCrowd;
  hostCard: EventAccountCard | null;
  coverUrl: string | null;
  attendeeCards: Map<string, EventAccountCard>;
};

function formatPlaceLine(event: CommunityEvent, t: ReturnType<typeof useTranslations<"events.card">>, locale: string): string {
  const format = event.mode === "virtual" ? t("online") : event.mode === "hybrid" ? t("hybrid") : t("inPerson");
  const place = event.mode === "virtual" ? (event.locality ?? t("joinAnywhere")) : (event.locationName ?? event.locality);
  const time = eventTimeRange(event, locale);
  return [format, place, time].filter(Boolean).join(" · ");
}

function crowdLine(crowd: EventCrowd, t: ReturnType<typeof useTranslations<"events.card">>): string {
  if (crowd.isFull) return `${t("full")} · ${t("goingCount", { count: crowd.going })}`;
  const parts = [t("goingCount", { count: crowd.going })];
  if (crowd.spotsLeft !== null) parts.push(t("spotsLeft", { count: crowd.spotsLeft }));
  return parts.join(" · ");
}

export function EventListCard({ data, busy, onRsvp }: { data: EventCardData; busy: boolean; onRsvp: (() => void) | null }) {
  const t = useTranslations("events.card");
  const locale = useLocale();
  const { event, crowd, hostCard } = data;
  const block = eventDateBlock(event, locale);

  return (
    <Link
      href={eventHref(event.did, event.rkey)}
      className="group flex gap-4 rounded-3xl border border-border-soft bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <span className="flex h-20 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-border-soft bg-surface-sunken text-foreground">
        <span className="text-xl font-bold leading-none">{block?.day ?? "–"}</span>
        <span className="mt-1 text-[10px] font-semibold tracking-widest text-muted-foreground">{block?.month ?? ""}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="line-clamp-2 font-semibold leading-snug text-foreground group-hover:text-primary">{event.name}</span>
        <span className="truncate text-sm text-muted-foreground">{formatPlaceLine(event, t, locale)}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <AvatarFace card={hostCard} className="size-5" />
          <span className="truncate">{hostCard?.displayName ?? t("aNeighbour")}</span>
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 pt-1.5">
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <FaceStack dids={crowd.goingDids} cards={data.attendeeCards} />
            <span className="truncate">{crowdLine(crowd, t)}</span>
          </span>
          <RsvpTrailingControl state={crowd.viewerState} busy={busy} onRsvp={onRsvp} />
        </span>
      </span>
    </Link>
  );
}

export function FeaturedEventCard({ data, busy, onRsvp }: { data: EventCardData; busy: boolean; onRsvp: (() => void) | null }) {
  const t = useTranslations("events.card");
  const locale = useLocale();
  const { event, crowd, hostCard, coverUrl } = data;

  return (
    <Link
      href={eventHref(event.did, event.rkey)}
      className="group flex gap-5 rounded-3xl border border-border-soft bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md max-sm:flex-col"
    >
      <span className="block h-28 w-32 shrink-0 overflow-hidden rounded-2xl border border-border-soft bg-surface-sunken max-sm:h-36 max-sm:w-full">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- PDS blob URL resolved at runtime; hosts are unbounded.
          <img src={coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center px-2 text-center text-[11px] text-muted-foreground">{event.name}</span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{eventShortDateLine(event, locale)}</span>
        <span className="line-clamp-2 text-lg font-semibold leading-snug text-foreground group-hover:text-primary">{event.name}</span>
        <span className="truncate text-sm text-muted-foreground">{formatPlaceLine(event, t, locale)}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <AvatarFace card={hostCard} className="size-5" />
          <span className="truncate">{t("hostedBy", { name: hostCard?.displayName ?? t("aNeighbour") })}</span>
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 pt-1.5">
          <span className="text-sm text-muted-foreground">{crowdLine(crowd, t)}</span>
          <RsvpTrailingControl state={crowd.viewerState} busy={busy} onRsvp={onRsvp} />
        </span>
      </span>
    </Link>
  );
}
