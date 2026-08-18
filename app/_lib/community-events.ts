/**
 * Community Events — the interoperable data layer.
 *
 * Events are `community.lexicon.calendar.event` records and RSVPs are
 * `community.lexicon.calendar.rsvp` records, the exact shapes Smoke Signal
 * (smokesignal.events) and other AT Protocol calendar apps read and write.
 * Both live in their author's own repo, so an event created on GainForest is
 * a first-class calendar event anywhere community lexicons are consumed, and
 * an event a known host created on Smoke Signal shows up here too.
 *
 * GainForest-only niceties the community lexicon has no field for (capacity,
 * cover photo, agenda, a meeting note…) ride along under ONE
 * namespaced extension key — `app.gainforest.event` — which other consumers
 * ignore, per the protocol's unknown-field tolerance. Nothing in the
 * extension is required to render the event.
 *
 * Discovery works without indexer support for the community collections:
 *   1. Publishing writes an `app.gainforest.feed.post` tagged
 *      `community-event` (also the feed's entry point for the event).
 *   2. The tag query (Hyperindex) yields every DID that has hosted.
 *   3. `com.atproto.repo.listRecords` on each host repo (public, CORS-open —
 *      the feed-pins pattern) returns their calendar events, including any
 *      they created on other AT Protocol apps.
 *
 * Attendance counting ALSO can't come from the un-indexed RSVP collection, so
 * RSVPing dual-writes: the interoperable RSVP record (for Smoke Signal) plus
 * an `app.gainforest.feed.like` whose subject is the event record (for the
 * indexer). "N going", waitlist order and the viewer's own RSVP all read from
 * the indexed likes; the RSVP record is the interop artifact. If the indexer
 * ever ingests `community.lexicon.calendar.rsvp`, counting can switch over
 * and the beacon like can be retired.
 */

import { cachedAsync } from "./async-cache";
import { fetchBlockedDomainDids } from "./blocked-domains";
import { fetchHiddenRecordUris, fetchPublicHiddenAccountDids, indexerQuery } from "./indexer";
import { normaliseRef, parseAtUri, resolvePdsHost } from "./pds";

// ── Collections & constants ────────────────────────────────────────────────

export const CALENDAR_EVENT_COLLECTION = "community.lexicon.calendar.event";
export const CALENDAR_RSVP_COLLECTION = "community.lexicon.calendar.rsvp";

/** Tag carried by the announce feed post that makes a host discoverable. */
export const COMMUNITY_EVENT_TAG = "community-event";

/** The single namespaced key GainForest extras nest under on the event
 *  record. Everything inside is optional; foreign records won't have it. */
export const EVENT_EXTENSION_KEY = "app.gainforest.event";

export const EVENT_MODE_VALUES = {
  inperson: "community.lexicon.calendar.event#inperson",
  virtual: "community.lexicon.calendar.event#virtual",
  hybrid: "community.lexicon.calendar.event#hybrid",
} as const;

export const EVENT_STATUS_VALUES = {
  planned: "community.lexicon.calendar.event#planned",
  scheduled: "community.lexicon.calendar.event#scheduled",
  rescheduled: "community.lexicon.calendar.event#rescheduled",
  cancelled: "community.lexicon.calendar.event#cancelled",
  postponed: "community.lexicon.calendar.event#postponed",
} as const;

export const RSVP_STATUS_GOING = "community.lexicon.calendar.rsvp#going";

export type EventMode = keyof typeof EVENT_MODE_VALUES;
export type EventStatus = keyof typeof EVENT_STATUS_VALUES;

// ── Types ──────────────────────────────────────────────────────────────────

export type EventAgendaItem = { time: string; text: string };

/** Parsed, serializable community event — tolerant of records written by
 *  other apps (Smoke Signal events have no extension and may omit endsAt). */
export type CommunityEvent = {
  uri: string;
  did: string;
  rkey: string;
  name: string;
  description: string | null;
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
  mode: EventMode;
  status: EventStatus;
  /** Composed human place line ("Marsh Lane car park, Ipswich Wetlands"). */
  locationName: string | null;
  /** Locality / region / country parts, when the address carries them. */
  locality: string | null;
  region: string | null;
  country: string | null;
  geo: { latitude: number; longitude: number } | null;
  /** Join link for virtual/hybrid events. */
  onlineUrl: string | null;
  // — GainForest extension (all optional) —
  capacity: number | null;
  /** Cover photo blob CID in the host's repo (resolve via resolveBlobUrl). */
  coverRef: string | null;
  agenda: EventAgendaItem[];
  /** One host-set tag shown as a chip ("Beginners welcome"). */
  themeTag: string | null;
  /** Practical notes ("Free to attend · Children welcome with an adult"). */
  goodToKnow: string | null;
  /** Exact meeting point, surfaced only after the viewer RSVPs. */
  meetingNote: string | null;
};

export type EventAttendance = {
  uri: string;
  /** All RSVPs, earliest first — position decides going vs waitlist. */
  dids: string[];
  total: number;
  /** The viewer's beacon like, when they have RSVPd. */
  viewerLikeUri: string | null;
};

/** What the trailing control on a card / the RSVP panel should show. */
export type ViewerRsvpState = "rsvp" | "going" | "waitlisted" | "full" | "finished" | "cancelled";

export type EventCrowd = {
  going: number;
  waiting: number;
  spotsLeft: number | null;
  isFull: boolean;
  viewerState: ViewerRsvpState;
  /** Dids currently inside capacity, earliest first (for faces). */
  goingDids: string[];
};

// ── Small helpers ──────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function tokenSuffix(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const hash = s.lastIndexOf("#");
  return hash >= 0 ? s.slice(hash + 1) : s;
}

export function eventHref(did: string, rkey: string): string {
  return `/events/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

export function hostEventHref(): string {
  return "/events/host";
}

// ── Record parsing (tolerant: ours + foreign) ──────────────────────────────

function parseMode(value: unknown): EventMode {
  const suffix = tokenSuffix(value);
  if (suffix === "virtual") return "virtual";
  if (suffix === "hybrid") return "hybrid";
  return "inperson";
}

function parseStatus(value: unknown): EventStatus {
  const suffix = tokenSuffix(value);
  if (suffix === "planned" || suffix === "rescheduled" || suffix === "cancelled" || suffix === "postponed") return suffix;
  return "scheduled";
}

/** Extract cover blob CID from the extension's blob object (or a bare ref). */
function coverRefOf(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const ref = value.ref;
  if (isRecord(ref) && typeof ref.$link === "string") return normaliseRef(ref.$link);
  if (typeof ref === "string") return normaliseRef(ref);
  return null;
}

function parseAgenda(value: unknown): EventAgendaItem[] {
  if (!Array.isArray(value)) return [];
  const items: EventAgendaItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const text = str(entry.text);
    if (!text) continue;
    items.push({ time: str(entry.time) ?? "", text });
  }
  return items.slice(0, 20);
}

/** Parse a raw `community.lexicon.calendar.event` record value. Returns null
 *  when the value has no usable name (the only required display field). */
export function parseCommunityEvent(uri: string, value: unknown): CommunityEvent | null {
  if (!isRecord(value)) return null;
  const parts = parseAtUri(uri);
  if (!parts) return null;
  const name = str(value.name);
  if (!name) return null;

  let locationName: string | null = null;
  let locality: string | null = null;
  let region: string | null = null;
  let country: string | null = null;
  let geo: CommunityEvent["geo"] = null;
  let onlineUrl: string | null = null;

  const locations = Array.isArray(value.locations) ? value.locations : [];
  for (const loc of locations) {
    if (!isRecord(loc)) continue;
    const type = str(loc.$type);
    if (type === "community.lexicon.location.address") {
      locality = locality ?? str(loc.locality);
      region = region ?? str(loc.region);
      country = country ?? str(loc.country);
      if (!locationName) {
        const label = [str(loc.name) ?? str(loc.street), locality].filter(Boolean).join(", ");
        locationName = label || locality || null;
      }
    } else if (type === "community.lexicon.location.geo") {
      const latitude = num(loc.latitude);
      const longitude = num(loc.longitude);
      if (latitude !== null && longitude !== null) geo = geo ?? { latitude, longitude };
      locationName = locationName ?? str(loc.name);
    } else if (!onlineUrl && str(loc.uri)) {
      // community.lexicon.calendar.event#uri — a virtual location.
      onlineUrl = str(loc.uri);
    }
  }

  const ext = isRecord(value[EVENT_EXTENSION_KEY]) ? (value[EVENT_EXTENSION_KEY] as Record<string, unknown>) : {};

  return {
    uri,
    did: parts.did,
    rkey: parts.rkey,
    name,
    description: str(value.description),
    createdAt: str(value.createdAt) ?? "",
    startsAt: str(value.startsAt),
    endsAt: str(value.endsAt),
    mode: parseMode(value.mode),
    status: parseStatus(value.status),
    locationName,
    locality,
    region,
    country,
    geo,
    onlineUrl,
    capacity: num(ext.capacity),
    coverRef: coverRefOf(ext.cover),
    agenda: parseAgenda(ext.agenda),
    themeTag: str(ext.themeTag),
    goodToKnow: str(ext.goodToKnow),
    meetingNote: str(ext.meetingNote),
  };
}

// ── Timing & crowd derivations ─────────────────────────────────────────────

export function eventStartMs(event: CommunityEvent): number | null {
  if (!event.startsAt) return null;
  const ms = Date.parse(event.startsAt);
  return Number.isFinite(ms) ? ms : null;
}

/** True once the event is over (end passed; or start + 3h when no end). */
export function isEventFinished(event: CommunityEvent, nowMs: number): boolean {
  const end = event.endsAt ? Date.parse(event.endsAt) : null;
  if (end !== null && Number.isFinite(end)) return end < nowMs;
  const start = eventStartMs(event);
  if (start === null) return false;
  return start + 3 * 60 * 60 * 1000 < nowMs;
}

export function isEventCancelled(event: CommunityEvent): boolean {
  return event.status === "cancelled";
}

/**
 * Everything the RSVP controls need, derived from the ordered RSVP list:
 * the first `capacity` RSVPs are going, later ones wait — so when someone
 * cancels, the head of the waitlist naturally becomes "going" with no
 * hand-off write.
 */
export function deriveEventCrowd(
  event: CommunityEvent,
  attendance: EventAttendance | null,
  viewerDid: string | null,
  nowMs: number,
): EventCrowd {
  const dids = attendance?.dids ?? [];
  const capacity = event.capacity;
  const going = capacity !== null ? Math.min(dids.length, capacity) : dids.length;
  const waiting = capacity !== null ? Math.max(0, dids.length - capacity) : 0;
  const spotsLeft = capacity !== null ? Math.max(0, capacity - dids.length) : null;
  const isFull = capacity !== null && dids.length >= capacity;

  let viewerState: ViewerRsvpState = "rsvp";
  const viewerIndex = viewerDid ? dids.indexOf(viewerDid) : -1;
  if (isEventCancelled(event)) viewerState = "cancelled";
  else if (isEventFinished(event, nowMs)) viewerState = "finished";
  else if (viewerIndex >= 0) viewerState = capacity !== null && viewerIndex >= capacity ? "waitlisted" : "going";
  else if (isFull) viewerState = "full";

  return { going, waiting, spotsLeft, isFull, viewerState, goingDids: capacity !== null ? dids.slice(0, capacity) : dids };
}

// ── Discovery: host DIDs from the announce-post tag ────────────────────────

type TaggedPostsResponse = {
  appGainforestFeedPost?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: { did?: string | null } | null } | null> | null;
  } | null;
};

const HOST_DIDS_QUERY = `
  query CommunityEventHosts($first: Int!, $after: String, $tag: String!) {
    appGainforestFeedPost(
      first: $first
      after: $after
      where: { tags: { any: { eq: $tag } } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did } }
    }
  }
`;

/** Every account that has announced a community event, newest first. */
export async function fetchCommunityEventHostDids(signal?: AbortSignal): Promise<string[]> {
  const dids: string[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const data: TaggedPostsResponse | null = await indexerQuery<TaggedPostsResponse>(
      HOST_DIDS_QUERY,
      { first: 100, after, tag: COMMUNITY_EVENT_TAG },
      signal,
    ).catch(() => null);
    const connection: TaggedPostsResponse["appGainforestFeedPost"] = data?.appGainforestFeedPost;
    for (const edge of connection?.edges ?? []) {
      const did = edge?.node?.did?.trim();
      if (did && !seen.has(did)) {
        seen.add(did);
        dids.push(did);
      }
    }
    after = connection?.pageInfo?.hasNextPage ? (connection.pageInfo.endCursor ?? null) : null;
    if (!after) break;
  }
  return dids;
}

// ── PDS reads (public, CORS-open — the feed-pins pattern) ──────────────────

type ListedRecord = { uri?: unknown; value?: unknown };
type ListRecordsResponse = { records?: ListedRecord[]; cursor?: string };

/** All calendar events in one repo — including events the account created on
 *  other AT Protocol apps, which is what makes interop two-way here. */
export async function listCommunityEventsForDid(did: string, signal?: AbortSignal): Promise<CommunityEvent[]> {
  const host = await resolvePdsHost(did, signal).catch(() => null);
  if (!host) return [];
  const events: CommunityEvent[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ repo: did, collection: CALENDAR_EVENT_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
      signal,
    }).catch(() => null);
    if (!response?.ok) break;
    const data = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    for (const record of data?.records ?? []) {
      const uri = str(record?.uri);
      if (!uri) continue;
      const parsed = parseCommunityEvent(uri, record?.value);
      if (parsed) events.push(parsed);
    }
    cursor = typeof data?.cursor === "string" && data.cursor ? data.cursor : undefined;
    if (!cursor || (data?.records ?? []).length === 0) break;
  }
  return events;
}

/** One event record straight from its owner's PDS. */
export async function fetchCommunityEvent(did: string, rkey: string, signal?: AbortSignal): Promise<CommunityEvent | null> {
  const host = await resolvePdsHost(did, signal).catch(() => null);
  if (!host) return null;
  const params = new URLSearchParams({ repo: did, collection: CALENDAR_EVENT_COLLECTION, rkey });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
    signal,
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => null)) as { uri?: unknown; value?: unknown } | null;
  const uri = str(data?.uri) ?? `at://${did}/${CALENDAR_EVENT_COLLECTION}/${rkey}`;
  return parseCommunityEvent(uri, data?.value);
}

/** The viewer's own RSVP records for one event (to delete on cancel). */
export async function listViewerRsvpRkeys(viewerDid: string, eventUri: string, signal?: AbortSignal): Promise<string[]> {
  const host = await resolvePdsHost(viewerDid, signal).catch(() => null);
  if (!host) return [];
  const rkeys: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ repo: viewerDid, collection: CALENDAR_RSVP_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
      signal,
    }).catch(() => null);
    if (!response?.ok) break;
    const data = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    for (const record of data?.records ?? []) {
      const uri = str(record?.uri);
      const value = record?.value;
      if (!uri || !isRecord(value)) continue;
      const subject = isRecord(value.subject) ? str(value.subject.uri) : null;
      if (subject !== eventUri) continue;
      const parts = parseAtUri(uri);
      if (parts) rkeys.push(parts.rkey);
    }
    cursor = typeof data?.cursor === "string" && data.cursor ? data.cursor : undefined;
    if (!cursor || (data?.records ?? []).length === 0) break;
  }
  return rkeys;
}

// ── The whole discovery list (cached) ──────────────────────────────────────

const EVENTS_CACHE_MS = 60_000;
const HOST_FETCH_CONCURRENCY = 8;

/**
 * Every discoverable community event: tag → host DIDs → each host's calendar
 * records, filtered by moderation (hidden records, hidden accounts, blocked
 * domains). Sorted soonest-first by start time; events with no start sink to
 * the end. Cached for a minute — RSVP counts, which move faster, are fetched
 * separately.
 */
export async function fetchAllCommunityEvents(signal?: AbortSignal): Promise<CommunityEvent[]> {
  return cachedAsync(
    "community-events:all",
    EVENTS_CACHE_MS,
    async () => {
      const [hostDids, hiddenRecords, hiddenAccounts, blockedDomains] = await Promise.all([
        fetchCommunityEventHostDids(),
        fetchHiddenRecordUris().catch(() => new Set<string>()),
        fetchPublicHiddenAccountDids().catch(() => new Set<string>()),
        fetchBlockedDomainDids().catch(() => new Set<string>()),
      ]);

      const visibleHosts = hostDids.filter((did) => !hiddenAccounts.has(did) && !blockedDomains.has(did));
      const events: CommunityEvent[] = [];
      for (let i = 0; i < visibleHosts.length; i += HOST_FETCH_CONCURRENCY) {
        const batch = visibleHosts.slice(i, i + HOST_FETCH_CONCURRENCY);
        const results = await Promise.all(batch.map((did) => listCommunityEventsForDid(did).catch(() => [])));
        for (const list of results) events.push(...list);
      }

      const visible = events.filter((event) => !hiddenRecords.has(event.uri));
      visible.sort((a, b) => {
        const aStart = eventStartMs(a);
        const bStart = eventStartMs(b);
        if (aStart === null && bStart === null) return 0;
        if (aStart === null) return 1;
        if (bStart === null) return -1;
        return aStart - bStart;
      });
      return visible;
    },
    signal,
  );
}

// ── Attendance (indexed beacon likes by subject) ───────────────────────────

type LikesResponse = {
  appGainforestFeedLike?: {
    edges?: Array<{
      node?: {
        uri?: string | null;
        did?: string | null;
        createdAt?: string | null;
        subject?: { uri?: string | null } | null;
      } | null;
    } | null> | null;
  } | null;
};

const ATTENDANCE_SCAN_CAP = 1000;
const ATTENDANCE_CHUNK = 100;

const ATTENDANCE_QUERY = `
  query CommunityEventAttendance($uris: [String!]!) {
    appGainforestFeedLike(first: ${ATTENDANCE_SCAN_CAP}, where: { subject: { uri: { in: $uris } } }) {
      edges { node { uri did createdAt subject { uri } } }
    }
  }
`;

/** RSVP attendance for a page of events in one indexer round-trip per 100. */
export async function fetchEventsAttendance(
  uris: string[],
  viewerDid: string | null,
  signal?: AbortSignal,
): Promise<Map<string, EventAttendance>> {
  const result = new Map<string, EventAttendance>();
  if (uris.length === 0) return result;
  for (const uri of uris) result.set(uri, { uri, dids: [], total: 0, viewerLikeUri: null });

  for (let i = 0; i < uris.length; i += ATTENDANCE_CHUNK) {
    const chunk = uris.slice(i, i + ATTENDANCE_CHUNK);
    const data = await indexerQuery<LikesResponse>(ATTENDANCE_QUERY, { uris: chunk }, signal).catch(() => null);
    const rows: Array<{ uri: string; did: string; createdAt: string; subject: string }> = [];
    for (const edge of data?.appGainforestFeedLike?.edges ?? []) {
      const node = edge?.node;
      const subject = node?.subject?.uri ?? null;
      if (!node?.did || !subject || !chunk.includes(subject)) continue;
      rows.push({ uri: node.uri ?? "", did: node.did, createdAt: node.createdAt ?? "", subject });
    }
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of rows) {
      const entry = result.get(row.subject);
      if (!entry) continue;
      if (!entry.dids.includes(row.did)) entry.dids.push(row.did);
      if (viewerDid && row.did === viewerDid && !entry.viewerLikeUri) entry.viewerLikeUri = row.uri || null;
    }
  }
  for (const entry of result.values()) entry.total = entry.dids.length;
  return result;
}

// ── Building records (interop shape) ───────────────────────────────────────

export type CommunityEventDraftRecord = {
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  mode: EventMode;
  placeName: string | null;
  locality: string | null;
  country: string | null;
  geo: { latitude: number; longitude: number } | null;
  onlineUrl: string | null;
  eventPageUrl: string | null;
  capacity: number | null;
  cover: Record<string, unknown> | null;
  agenda: EventAgendaItem[];
  themeTag: string | null;
  goodToKnow: string | null;
  meetingNote: string | null;
};

/** Compose the wire record: community lexicon fields first, GainForest extras
 *  under the single extension key. `createdAt` is kept from `existing` on
 *  edits so the record's age stays truthful. */
export function buildCommunityEventRecord(
  draft: CommunityEventDraftRecord,
  options?: { existingCreatedAt?: string | null; status?: EventStatus },
): Record<string, unknown> {
  const locations: Array<Record<string, unknown>> = [];
  if (draft.mode !== "virtual" && (draft.placeName || draft.locality || draft.country)) {
    const address: Record<string, unknown> = {
      $type: "community.lexicon.location.address",
      // The community address lexicon requires `country`; use the host's
      // entry or fall back to an empty-ish placeholder only when set.
      country: draft.country ?? "",
    };
    if (draft.placeName) address.name = draft.placeName;
    if (draft.locality) address.locality = draft.locality;
    locations.push(address);
  }
  if (draft.geo) {
    locations.push({
      $type: "community.lexicon.location.geo",
      latitude: String(draft.geo.latitude),
      longitude: String(draft.geo.longitude),
      ...(draft.placeName ? { name: draft.placeName } : {}),
    });
  }
  if (draft.mode !== "inperson" && draft.onlineUrl) {
    locations.push({
      $type: "community.lexicon.calendar.event#uri",
      uri: draft.onlineUrl,
      name: "Join online",
    });
  }

  const extension: Record<string, unknown> = {};
  if (draft.capacity !== null) extension.capacity = draft.capacity;
  if (draft.cover) extension.cover = draft.cover;
  if (draft.agenda.length > 0) extension.agenda = draft.agenda;
  if (draft.themeTag) extension.themeTag = draft.themeTag;
  if (draft.goodToKnow) extension.goodToKnow = draft.goodToKnow;
  if (draft.meetingNote) extension.meetingNote = draft.meetingNote;

  const record: Record<string, unknown> = {
    $type: CALENDAR_EVENT_COLLECTION,
    name: draft.name.trim(),
    createdAt: options?.existingCreatedAt || new Date().toISOString(),
    startsAt: draft.startsAt,
    mode: EVENT_MODE_VALUES[draft.mode],
    status: EVENT_STATUS_VALUES[options?.status ?? "scheduled"],
    rsvpExpected: true,
  };
  if (draft.description) record.description = draft.description;
  if (draft.endsAt) record.endsAt = draft.endsAt;
  if (locations.length > 0) record.locations = locations;
  if (draft.eventPageUrl) {
    // Advertise the GainForest event page to other apps (Smoke Signal renders
    // `uris` as links on the event).
    record.uris = [{ $type: "community.lexicon.calendar.event#uri", uri: draft.eventPageUrl, name: "GainForest" }];
  }
  if (Object.keys(extension).length > 0) record[EVENT_EXTENSION_KEY] = extension;
  return record;
}
