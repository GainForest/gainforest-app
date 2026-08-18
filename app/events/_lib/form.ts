/**
 * Host-form state: everything the one-page "Host an event" form edits, in
 * plain strings so it can round-trip through localStorage drafts unchanged.
 * Converting to the interoperable wire record happens in actions.ts.
 */

import type { CommunityEvent, EventAgendaItem, EventMode } from "@/app/_lib/community-events";

export type EventFormState = {
  name: string;
  /** YYYY-MM-DD (the date input's value). */
  date: string;
  /** HH:MM local. */
  startTime: string;
  /** HH:MM local, may be empty. */
  endTime: string;
  mode: EventMode;
  placeName: string;
  locality: string;
  country: string;
  onlineUrl: string;
  description: string;
  /** Cover photo as a data URL so drafts survive reloads. */
  coverDataUrl: string | null;
  /** Cover already stored on the record being edited (keep unless replaced). */
  existingCoverRef: string | null;
  agenda: EventAgendaItem[];
  themeTag: string;
  meetingNote: string;
  goodToKnow: string;
  guidelinesAccepted: boolean;
};

export function emptyEventForm(): EventFormState {
  return {
    name: "",
    date: "",
    startTime: "",
    endTime: "",
    mode: "inperson",
    placeName: "",
    locality: "",
    country: "",
    onlineUrl: "",
    description: "",
    coverDataUrl: null,
    existingCoverRef: null,
    agenda: [],
    themeTag: "",
    meetingNote: "",
    goodToKnow: "",
    guidelinesAccepted: false,
  };
}

/** Prefill the form from a published event (the organizer's Edit flow). */
export function eventToForm(event: CommunityEvent): EventFormState {
  const start = event.startsAt ? new Date(event.startsAt) : null;
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    ...emptyEventForm(),
    name: event.name,
    date: start ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : "",
    startTime: start ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : "",
    endTime: end ? `${pad(end.getHours())}:${pad(end.getMinutes())}` : "",
    mode: event.mode,
    placeName: event.locationName ?? "",
    locality: event.locality ?? "",
    country: event.country ?? "",
    onlineUrl: event.onlineUrl ?? "",
    description: event.description ?? "",
    existingCoverRef: event.coverRef,
    agenda: event.agenda,
    themeTag: event.themeTag ?? "",
    meetingNote: event.meetingNote ?? "",
    goodToKnow: event.goodToKnow ?? "",
    guidelinesAccepted: true,
  };
}

/** Translation keys under events.host.errors — never raw English. */
export type EventFormErrorKey =
  | "nameMissing"
  | "dateMissing"
  | "datePassed"
  | "startMissing"
  | "placeMissing"
  | "onlineUrlMissing"
  | "guidelinesMissing";

export type EventFormErrors = Partial<Record<"name" | "date" | "start" | "place" | "onlineUrl" | "guidelines", EventFormErrorKey>>;

/** Validation runs once, on Publish — only the required basics (and the
 *  guidelines tick) can block. The Publish button itself is never disabled
 *  for an unticked box: a dead-looking button explains nothing, a message
 *  under the box does. */
export function validateEventForm(form: EventFormState, nowMs: number): EventFormErrors {
  const errors: EventFormErrors = {};
  if (!form.name.trim()) errors.name = "nameMissing";

  if (!form.date) {
    errors.date = "dateMissing";
  } else {
    const startOfToday = new Date(nowMs);
    startOfToday.setHours(0, 0, 0, 0);
    const picked = new Date(`${form.date}T00:00:00`);
    if (Number.isFinite(picked.getTime()) && picked.getTime() < startOfToday.getTime()) {
      errors.date = "datePassed";
    }
  }

  if (!form.startTime) errors.start = "startMissing";

  if (form.mode !== "virtual" && !form.placeName.trim()) errors.place = "placeMissing";
  if (form.mode !== "inperson" && !form.onlineUrl.trim()) errors.onlineUrl = "onlineUrlMissing";
  if (!form.guidelinesAccepted) errors.guidelines = "guidelinesMissing";
  return errors;
}

/** Local wall-clock date+time → ISO instant (the host's own timezone). */
export function formDateTimeToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isFinite(value.getTime()) ? value.toISOString() : null;
}
