"use client";

/**
 * "Add to calendar" — build and download a minimal RFC 5545 invite for one
 * event. All times are emitted in UTC; calendar apps localize on import.
 */

import type { CommunityEvent } from "@/app/_lib/community-events";

function icsStamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildEventIcs(event: CommunityEvent, pageUrl: string): string {
  const start = icsStamp(event.startsAt);
  const end = icsStamp(event.endsAt) ?? start;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GainForest//Community Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.did.replace(/[^a-zA-Z0-9:._-]/g, "")}-${event.rkey}@gainforest.app`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    ...(start ? [`DTSTART:${start}`] : []),
    ...(end ? [`DTEND:${end}`] : []),
    `SUMMARY:${escapeIcsText(event.name)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    ...(event.locationName ? [`LOCATION:${escapeIcsText(event.locationName)}`] : []),
    ...(event.onlineUrl && !event.locationName ? [`LOCATION:${escapeIcsText(event.onlineUrl)}`] : []),
    `URL:${pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function downloadEventIcs(event: CommunityEvent, pageUrl: string): void {
  const blob = new Blob([buildEventIcs(event, pageUrl)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${event.name.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "event"}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
