"use client";

/**
 * Community-event mutations. Every write goes through /api/manage/proxy (via
 * the manage mutation helpers) so personal and organization accounts behave
 * identically, per the app-wide rule.
 *
 * Publishing an event writes up to three things to the host's repo:
 *   1. the interoperable `community.lexicon.calendar.event` record,
 *   2. a follow-up put adding the event's own page URL to `uris` (needs the
 *      rkey, which only exists after the create) — non-fatal when it fails,
 *   3. an `app.gainforest.feed.post` tagged `community-event`: the discovery
 *      beacon and the feed entry point.
 *
 * RSVPing dual-writes the interoperable `community.lexicon.calendar.rsvp`
 * plus the countable beacon like; cancelling deletes both.
 */

import {
  createFeedLike,
  createFeedPost,
  createRecord,
  deleteFeedLike,
  deleteRecord,
  getRecord,
  putRecord,
  uploadBlob,
} from "@/app/(manage)/manage/_lib/mutations";
import {
  buildCommunityEventRecord,
  CALENDAR_EVENT_COLLECTION,
  CALENDAR_RSVP_COLLECTION,
  COMMUNITY_EVENT_TAG,
  EVENT_EXTENSION_KEY,
  EVENT_STATUS_VALUES,
  eventHref,
  listViewerRsvpRkeys,
  RSVP_STATUS_GOING,
  type CommunityEvent,
  type CommunityEventDraftRecord,
} from "@/app/_lib/community-events";
import { resolveStrongRef } from "@/app/_lib/pds";
import { formDateTimeToIso, type EventFormState } from "./form";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

function didOf(uri: string): string {
  const m = uri.match(/^at:\/\/([^/]+)\//);
  return m ? m[1] : "";
}

async function dataUrlToFile(dataUrl: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], "event-cover", { type: blob.type || "image/jpeg" });
}

function formToDraftRecord(form: EventFormState, eventPageUrl: string | null, cover: Record<string, unknown> | null): CommunityEventDraftRecord {
  const startsAt = formDateTimeToIso(form.date, form.startTime);
  const endsAt = form.endTime ? formDateTimeToIso(form.date, form.endTime) : null;
  const capacity = form.capacity.trim() ? Math.max(1, Math.floor(Number(form.capacity))) : null;
  const amount = form.supportAmount.trim() ? Number(form.supportAmount) : null;
  return {
    name: form.name,
    description: form.description.trim() || null,
    startsAt: startsAt ?? new Date().toISOString(),
    endsAt,
    mode: form.mode,
    placeName: form.placeName.trim() || null,
    locality: form.locality.trim() || null,
    country: form.country.trim() || null,
    geo: null,
    onlineUrl: form.onlineUrl.trim() || null,
    eventPageUrl,
    capacity: Number.isFinite(capacity as number) ? capacity : null,
    cover,
    agenda: form.agenda.filter((item) => item.text.trim()).map((item) => ({ time: item.time.trim(), text: item.text.trim() })),
    themeTag: form.themeTag.trim() || null,
    goodToKnow: form.goodToKnow.trim() || null,
    meetingNote: form.meetingNote.trim() || null,
    support:
      form.supportKinds.length > 0 || (amount !== null && Number.isFinite(amount) && amount > 0)
        ? {
            kinds: form.supportKinds,
            amount: amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
            currency: form.supportCurrency,
            note: form.supportNote.trim() || null,
          }
        : null,
  };
}

/** Human date line for the announce post, in the host's locale. */
function announceDateLine(iso: string | null, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export type PublishEventResult = { did: string; rkey: string; uri: string };

export async function publishCommunityEvent(form: EventFormState, options: { origin: string; locale: string }): Promise<PublishEventResult> {
  const cover = form.coverDataUrl ? await uploadBlob(await dataUrlToFile(form.coverDataUrl)) : null;
  const draft = formToDraftRecord(form, null, cover ? { ...cover } : null);
  const record = buildCommunityEventRecord(draft);

  const created = await createRecord(CALENDAR_EVENT_COLLECTION, record);
  const rkey = rkeyOf(created.uri);
  const did = didOf(created.uri);
  const pageUrl = `${options.origin}${eventHref(did, rkey)}`;

  // Advertise our event page to other apps (Smoke Signal shows `uris` links).
  // Best-effort: the event is already live if this put fails.
  try {
    const withUris = buildCommunityEventRecord({ ...draft, eventPageUrl: pageUrl }, { existingCreatedAt: String(record.createdAt) });
    await putRecord(CALENDAR_EVENT_COLLECTION, rkey, withUris, { swapRecord: created.cid || undefined });
  } catch {
    /* non-fatal */
  }

  // The discovery beacon + feed entry point.
  const dateLine = announceDateLine(draft.startsAt, options.locale);
  const text = `🌱 ${form.name.trim()}${dateLine ? ` — ${dateLine}` : ""}. ${pageUrl}`;
  try {
    await createFeedPost({ text, tags: [COMMUNITY_EVENT_TAG] });
  } catch {
    /* the event exists; a missing announce only slows discovery of a new host */
  }

  return { did, rkey, uri: created.uri };
}

/** Save changes to a published event (organizer only). Keeps `createdAt`, the
 *  stored cover (unless replaced) and the record's status. */
export async function updateCommunityEvent(event: CommunityEvent, form: EventFormState, options: { origin: string }): Promise<void> {
  const existing = await getRecord(CALENDAR_EVENT_COLLECTION, event.rkey);
  const existingValue = isRecord(existing.record) ? existing.record : {};
  const existingExt = isRecord(existingValue[EVENT_EXTENSION_KEY]) ? (existingValue[EVENT_EXTENSION_KEY] as Record<string, unknown>) : {};

  let cover: Record<string, unknown> | null = null;
  if (form.coverDataUrl) cover = { ...(await uploadBlob(await dataUrlToFile(form.coverDataUrl))) };
  else if (form.existingCoverRef && isRecord(existingExt.cover)) cover = existingExt.cover as Record<string, unknown>;

  const pageUrl = `${options.origin}${eventHref(event.did, event.rkey)}`;
  const draft = formToDraftRecord(form, pageUrl, cover);
  const record = buildCommunityEventRecord(draft, {
    existingCreatedAt: typeof existingValue.createdAt === "string" ? existingValue.createdAt : event.createdAt,
    status: event.status === "cancelled" ? "cancelled" : "scheduled",
  });
  await putRecord(CALENDAR_EVENT_COLLECTION, event.rkey, record, { swapRecord: existing.cid || undefined });
}

/** Cancel an event: flip the record's community-lexicon status so every
 *  consumer (including Smoke Signal) sees the cancellation. */
export async function cancelCommunityEvent(event: CommunityEvent): Promise<void> {
  const existing = await getRecord(CALENDAR_EVENT_COLLECTION, event.rkey);
  const value = isRecord(existing.record) ? { ...existing.record } : {};
  value.status = EVENT_STATUS_VALUES.cancelled;
  await putRecord(CALENDAR_EVENT_COLLECTION, event.rkey, value, { swapRecord: existing.cid || undefined });
}

/** RSVP "going": the interoperable RSVP record + the countable beacon like. */
export async function rsvpToCommunityEvent(eventUri: string): Promise<void> {
  const subject = await resolveStrongRef(eventUri);
  await createRecord(CALENDAR_RSVP_COLLECTION, {
    $type: CALENDAR_RSVP_COLLECTION,
    subject,
    status: RSVP_STATUS_GOING,
    createdAt: new Date().toISOString(),
  });
  await createFeedLike(eventUri);
}

/** Cancel the viewer's RSVP: delete the beacon like and every RSVP record of
 *  theirs pointing at this event. The next person on the waitlist becomes
 *  "going" purely by position — no hand-off write needed. */
export async function cancelCommunityEventRsvp(eventUri: string, viewerDid: string, viewerLikeUri: string | null): Promise<void> {
  if (viewerLikeUri) {
    await deleteFeedLike(rkeyOf(viewerLikeUri)).catch(() => undefined);
  }
  const rkeys = await listViewerRsvpRkeys(viewerDid, eventUri).catch(() => []);
  for (const rkey of rkeys) {
    await deleteRecord(CALENDAR_RSVP_COLLECTION, rkey).catch(() => undefined);
  }
}
