import { type CommunityEvent, type EventMode } from "@/app/_lib/events";

/** Locale-aware date/time labels for an event, computed in the given timezone. */
export function formatEventWhen(
  event: Pick<CommunityEvent, "startsAt" | "endsAt" | "timezone">,
  locale?: string,
): { dateLabel: string; timeLabel: string | null; monthShort: string | null; day: string | null } {
  if (!event.startsAt) return { dateLabel: "Date to be announced", timeLabel: null, monthShort: null, day: null };
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime()))
    return { dateLabel: "Date to be announced", timeLabel: null, monthShort: null, day: null };
  const tz = event.timezone ?? undefined;
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(start);
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short", timeZone: tz }).format(start).toUpperCase();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: tz }).format(start);
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz });
  let timeLabel: string | null = timeFmt.format(start);
  if (event.endsAt) {
    const end = new Date(event.endsAt);
    if (!Number.isNaN(end.getTime())) timeLabel = `${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  }
  return { dateLabel, timeLabel, monthShort, day };
}

export function modeLabels(): Record<EventMode, string> {
  return { inperson: "In person", virtual: "Virtual", hybrid: "Hybrid" };
}

/** Local wall-clock ISO (yyyy-MM-ddTHH:mm) for a datetime-local input, from a Date. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** Interpret a datetime-local value as local time and return a full ISO string. */
export function localInputToIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
