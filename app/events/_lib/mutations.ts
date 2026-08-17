"use client";

/**
 * Community Events — client write helpers. Every write goes through the manage
 * proxy (`/api/manage/proxy`) via the shared `createRecord`/`putRecord`/`deleteRecord`
 * helpers, so personal accounts and organizations follow the exact same path
 * and permission checks. Events are written to the host repo (personal or, when
 * `repo` is set, an org); RSVPs are always written to the acting user's own repo.
 */
import {
  createRecord,
  putRecord,
  deleteRecord,
} from "@/app/(manage)/manage/_lib/mutations";
import {
  ADDRESS_TYPE,
  EVENT_COLLECTION,
  RSVP_COLLECTION,
  type EventMode,
  type RsvpStatus,
  type CommunityEvent,
} from "@/app/_lib/events";

export type EventFormInput = {
  name: string;
  description?: string | null;
  mode: EventMode;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone?: string | null;
  /** Free-text in-person location. */
  location?: string | null;
  /** Virtual / join URL. */
  virtualUrl?: string | null;
  /** Extra links. */
  links?: Array<{ uri: string; name?: string }>;
  /** Public appears in discovery; unlisted is link-only. */
  visibility: "public" | "unlisted";
};

function origin(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://www.gainforest.app";
}

/** Compose a `community.lexicon.calendar.event` record from form input. */
export function buildEventRecord(input: EventFormInput): Record<string, unknown> {
  const record: Record<string, unknown> = {
    $type: EVENT_COLLECTION,
    name: input.name.trim(),
    mode: `${EVENT_COLLECTION}#${input.mode}`,
    status: `${EVENT_COLLECTION}#scheduled`,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    createdAt: new Date().toISOString(),
    createdWith: origin(),
    preferences: { showInDiscovery: input.visibility === "public" },
  };

  const description = input.description?.trim();
  if (description) record.description = description;
  if (input.timezone) record.timezone = input.timezone;

  // In-person / hybrid: store the free-text location as an inline address `name`
  // so it interoperates with the community location lexicon.
  const location = input.location?.trim();
  if (location && input.mode !== "virtual") {
    record.locations = [{ $type: ADDRESS_TYPE, name: location }];
  }

  // Links (+ the virtual join URL for virtual/hybrid events).
  const uris: Array<{ uri: string; name?: string }> = [];
  const virtual = input.virtualUrl?.trim();
  if (virtual && input.mode !== "inperson") uris.push({ uri: virtual, name: "Join link" });
  for (const link of input.links ?? []) {
    const uri = link.uri?.trim();
    if (uri) uris.push({ uri, ...(link.name?.trim() ? { name: link.name.trim() } : {}) });
  }
  if (uris.length) record.uris = uris;

  return record;
}

export async function createEvent(
  input: EventFormInput,
  options?: { repo?: string },
): Promise<{ uri: string; cid: string; rkey: string }> {
  const result = await createRecord(EVENT_COLLECTION, buildEventRecord(input), undefined, options);
  const rkey = result.uri.split("/").pop() ?? "";
  return { ...result, rkey };
}

export async function updateEvent(
  rkey: string,
  input: EventFormInput,
  options?: { repo?: string },
): Promise<{ uri: string; cid: string }> {
  return putRecord(EVENT_COLLECTION, rkey, buildEventRecord(input), options);
}

export async function deleteEvent(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord(EVENT_COLLECTION, rkey, options);
}

// ── RSVP (always written to the acting user's own repo) ──────────────────────
function buildRsvpRecord(event: Pick<CommunityEvent, "uri" | "cid">, status: RsvpStatus): Record<string, unknown> {
  return {
    $type: RSVP_COLLECTION,
    status: `${RSVP_COLLECTION}#${status}`,
    subject: { uri: event.uri, ...(event.cid ? { cid: event.cid } : {}) },
    createdAt: new Date().toISOString(),
    createdWith: origin(),
  };
}

export async function createRsvp(
  event: Pick<CommunityEvent, "uri" | "cid">,
  status: RsvpStatus,
): Promise<{ uri: string; rkey: string }> {
  const result = await createRecord(RSVP_COLLECTION, buildRsvpRecord(event, status));
  const rkey = result.uri.split("/").pop() ?? "";
  return { uri: result.uri, rkey };
}

export async function removeRsvp(rkey: string): Promise<void> {
  await deleteRecord(RSVP_COLLECTION, rkey);
}
