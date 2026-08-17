/**
 * Locale-aware date lines for event cards and detail — always rendered in the
 * VIEWER's timezone (the detail panel says "your local time" for exactly this
 * reason).
 */

import type { CommunityEvent } from "@/app/_lib/community-events";

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** The scannable date block on list cards: { day: "20", month: "SEP" }. */
export function eventDateBlock(event: CommunityEvent, locale: string): { day: string; month: string } | null {
  const start = parse(event.startsAt);
  if (!start) return null;
  return {
    day: new Intl.DateTimeFormat(locale, { day: "2-digit" }).format(start),
    month: new Intl.DateTimeFormat(locale, { month: "short" }).format(start).replace(/\./g, "").toUpperCase(),
  };
}

export function eventTimeRange(event: CommunityEvent, locale: string): string | null {
  const start = parse(event.startsAt);
  if (!start) return null;
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const end = parse(event.endsAt);
  return end ? `${time.format(start)} – ${time.format(end)}` : time.format(start);
}

/** Featured-card line: "Sat 12 Sep · 6:30 – 9:00". */
export function eventShortDateLine(event: CommunityEvent, locale: string): string | null {
  const start = parse(event.startsAt);
  if (!start) return null;
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(start);
  const range = eventTimeRange(event, locale);
  return range ? `${day} · ${range}` : day;
}

/** Detail line: "Saturday 12 September · 6:30 – 9:00". */
export function eventLongDateLine(event: CommunityEvent, locale: string): string | null {
  const start = parse(event.startsAt);
  if (!start) return null;
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(start);
  const range = eventTimeRange(event, locale);
  return range ? `${day} · ${range}` : day;
}

/** "Saturday 12 September" for the RSVP panel heading. */
export function eventDayLine(event: CommunityEvent, locale: string): string | null {
  const start = parse(event.startsAt);
  if (!start) return null;
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(start);
}

/** The month the soonest listed event falls in ("September onwards"). */
export function earliestMonthLabel(events: CommunityEvent[], locale: string): string | null {
  for (const event of events) {
    const start = parse(event.startsAt);
    if (start) return new Intl.DateTimeFormat(locale, { month: "long" }).format(start);
  }
  return null;
}

