/**
 * Community Events data layer — atproto-native, XRPC-only (no indexer).
 *
 * Events use the open **community calendar lexicons** so they interoperate with
 * other atproto event apps (atmo.rsvp, Smoke Signal, …):
 *   - `community.lexicon.calendar.event` lives in the **host's** repo
 *   - `community.lexicon.calendar.rsvp`  lives in the **attendee's** repo
 *
 * Reads go straight to each owner's PDS via `com.atproto.repo.{listRecords,getRecord}`
 * (helpers in `pds.ts`). Writes go through the manage proxy (see `events/_lib/mutations.ts`).
 */
import {
  getPdsRecord,
  listLatestPdsRecords,
  normaliseRef,
  parseAtUri,
  resolveBlobUrl,
  resolveDidHandle,
  resolvePdsHost,
  type PdsRecord,
} from "./pds";

export const EVENT_COLLECTION = "community.lexicon.calendar.event";
export const RSVP_COLLECTION = "community.lexicon.calendar.rsvp";
export const ADDRESS_TYPE = "community.lexicon.location.address";

// ── enums (lexicon knownValues, stored fully-qualified e.g. `${EVENT_COLLECTION}#inperson`)
export type EventMode = "inperson" | "virtual" | "hybrid";
export type EventStatus = "scheduled" | "cancelled" | "planned" | "postponed" | "rescheduled";
export type RsvpStatus = "going" | "interested" | "notgoing";

export const EVENT_MODES: EventMode[] = ["inperson", "virtual", "hybrid"];

/** Strip a `nsid#value` union tag down to `value`; tolerate a bare value too. */
export function shortEnum(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const hash = value.indexOf("#");
  return hash >= 0 ? value.slice(hash + 1) : value;
}

// ── domain types ────────────────────────────────────────────────────────────
export type EventLink = { uri: string; name?: string };

export type CommunityEvent = {
  /** at://did/collection/rkey */
  uri: string;
  cid: string | null;
  did: string;
  rkey: string;
  name: string;
  description: string | null;
  mode: EventMode;
  status: EventStatus;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  /** Human-readable location line (in-person). */
  location: string | null;
  /** Optional join/virtual URL + any extra links. */
  links: EventLink[];
  /** Resolved thumbnail blob URL, if any. */
  thumbnailUrl: string | null;
  /** Whether the host opted this into public discovery. */
  showInDiscovery: boolean;
  createdAt: string | null;
};

export type ProfileLite = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type EventRsvp = {
  uri: string;
  rkey: string;
  did: string;
  status: RsvpStatus;
  subjectUri: string;
  subjectCid: string | null;
  createdAt: string | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// ── location helpers ─────────────────────────────────────────────────────────
function addressToLine(loc: Record<string, unknown>): string | null {
  const name = str(loc.name);
  const parts = [str(loc.street), str(loc.locality), str(loc.region), str(loc.country)].filter(
    (p): p is string => Boolean(p),
  );
  if (name && parts.length) return `${name} · ${parts.join(", ")}`;
  if (name) return name;
  if (parts.length) return parts.join(", ");
  return null;
}

function readLocation(value: Record<string, unknown>): string | null {
  const locations = Array.isArray(value.locations) ? value.locations : [];
  for (const loc of locations) {
    if (typeof loc !== "object" || loc === null) continue;
    const rec = loc as Record<string, unknown>;
    const line = addressToLine(rec) ?? str(rec.name) ?? str(rec.description);
    if (line) return line;
  }
  return null;
}

function readLinks(value: Record<string, unknown>): EventLink[] {
  const uris = Array.isArray(value.uris) ? value.uris : [];
  const links: EventLink[] = [];
  for (const entry of uris) {
    if (typeof entry === "string") {
      links.push({ uri: entry });
    } else if (entry && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      const uri = str(rec.uri);
      if (uri) links.push({ uri, name: str(rec.name) ?? undefined });
    }
  }
  return links;
}

function readThumbnailRef(value: Record<string, unknown>): string | null {
  const media = Array.isArray(value.media) ? value.media : [];
  const pick = media.find(
    (m) => m && typeof m === "object" && (m as Record<string, unknown>).role === "thumbnail",
  ) as Record<string, unknown> | undefined;
  const entry = (pick ?? media[0]) as Record<string, unknown> | undefined;
  const content = entry && typeof entry === "object" ? (entry.content as Record<string, unknown>) : undefined;
  const ref = content && typeof content === "object" ? content.ref : undefined;
  if (ref && typeof ref === "object" && "$link" in (ref as Record<string, unknown>)) {
    return normaliseRef((ref as Record<string, unknown>)["$link"] as string);
  }
  return normaliseRef(typeof ref === "string" ? ref : null);
}

// ── parse a raw PDS record into a CommunityEvent (async: resolves the thumbnail blob URL)
export async function parseEventRecord(
  record: PdsRecord,
  signal?: AbortSignal,
): Promise<CommunityEvent | null> {
  const parts = parseAtUri(record.uri);
  if (!parts) return null;
  const value = record.value;
  const name = str(value.name);
  if (!name) return null;

  const mode = (shortEnum(value.mode) ?? "inperson") as EventMode;
  const status = (shortEnum(value.status) ?? "scheduled") as EventStatus;
  const thumbRef = readThumbnailRef(value);
  const thumbnailUrl = thumbRef ? await resolveBlobUrl(parts.did, thumbRef, signal).catch(() => null) : null;
  const preferences = (value.preferences ?? {}) as Record<string, unknown>;

  return {
    uri: record.uri,
    cid: record.cid,
    did: parts.did,
    rkey: parts.rkey,
    name,
    description: str(value.description),
    mode: EVENT_MODES.includes(mode) ? mode : "inperson",
    status,
    startsAt: str(value.startsAt),
    endsAt: str(value.endsAt),
    timezone: str(value.timezone),
    location: readLocation(value),
    links: readLinks(value),
    thumbnailUrl,
    showInDiscovery: preferences.showInDiscovery !== false,
    createdAt: str(value.createdAt),
  };
}

// ── reads (XRPC) ─────────────────────────────────────────────────────────────

/** All events hosted by one account (their repo), newest-first, parsed. */
export async function listEventsForDid(
  did: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<CommunityEvent[]> {
  const records = await listLatestPdsRecords(did, EVENT_COLLECTION, limit, signal).catch(() => []);
  const parsed = await Promise.all(records.map((r) => parseEventRecord(r, signal).catch(() => null)));
  return parsed.filter((e): e is CommunityEvent => e !== null);
}

/** Aggregate events across several source repos (dedupe + sort by start ascending). */
export async function listEventsForDids(
  dids: string[],
  signal?: AbortSignal,
): Promise<CommunityEvent[]> {
  const unique = Array.from(new Set(dids.filter(Boolean)));
  const lists = await Promise.all(unique.map((did) => listEventsForDid(did, 50, signal)));
  const byUri = new Map<string, CommunityEvent>();
  for (const list of lists) for (const e of list) byUri.set(e.uri, e);
  return Array.from(byUri.values()).sort(sortByStartAsc);
}

/** One event by owner + rkey. */
export async function getEvent(
  did: string,
  rkey: string,
  signal?: AbortSignal,
): Promise<CommunityEvent | null> {
  const record = await getPdsRecord(did, EVENT_COLLECTION, rkey, signal);
  if (!record) return null;
  return parseEventRecord(record, signal);
}

/** All RSVP records in an attendee's repo. */
export async function listRsvpsForDid(did: string, signal?: AbortSignal): Promise<EventRsvp[]> {
  const records = await listLatestPdsRecords(did, RSVP_COLLECTION, 100, signal).catch(() => []);
  const rsvps: EventRsvp[] = [];
  for (const record of records) {
    const parts = parseAtUri(record.uri);
    if (!parts) continue;
    const value = record.value;
    const subject = (value.subject ?? {}) as Record<string, unknown>;
    const subjectUri = str(subject.uri);
    if (!subjectUri) continue;
    rsvps.push({
      uri: record.uri,
      rkey: parts.rkey,
      did: parts.did,
      status: (shortEnum(value.status) ?? "going") as RsvpStatus,
      subjectUri,
      subjectCid: str(subject.cid),
      createdAt: str(value.createdAt),
    });
  }
  return rsvps;
}

/** RSVPs across a set of attendee repos, keyed by the event they point at. */
export async function collectRsvpsForEvent(
  eventUri: string,
  attendeeDids: string[],
  signal?: AbortSignal,
): Promise<Array<{ did: string; status: RsvpStatus }>> {
  const unique = Array.from(new Set(attendeeDids.filter(Boolean)));
  const lists = await Promise.all(unique.map((did) => listRsvpsForDid(did, signal).catch(() => [])));
  const out: Array<{ did: string; status: RsvpStatus }> = [];
  for (const list of lists) {
    for (const rsvp of list) {
      if (rsvp.subjectUri === eventUri && rsvp.status !== "notgoing") {
        out.push({ did: rsvp.did, status: rsvp.status });
      }
    }
  }
  return out;
}

// ── profile resolution (XRPC only: PDS `app.bsky.actor.profile` + DID document handle)
export async function resolveProfile(did: string, signal?: AbortSignal): Promise<ProfileLite> {
  const [handle, record] = await Promise.all([
    resolveDidHandle(did, signal).catch(() => null),
    getPdsRecord(did, "app.bsky.actor.profile", "self", signal).catch(() => null),
  ]);
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  if (record) {
    displayName = str(record.value.displayName);
    const avatar = record.value.avatar as Record<string, unknown> | undefined;
    const ref = avatar && typeof avatar === "object" ? avatar.ref : undefined;
    const cid =
      ref && typeof ref === "object" && "$link" in (ref as Record<string, unknown>)
        ? ((ref as Record<string, unknown>)["$link"] as string)
        : typeof ref === "string"
          ? ref
          : null;
    avatarUrl = cid ? await resolveBlobUrl(did, cid, signal).catch(() => null) : null;
  }
  return { did, handle, displayName, avatarUrl };
}

export async function resolveProfiles(dids: string[], signal?: AbortSignal): Promise<Map<string, ProfileLite>> {
  const unique = Array.from(new Set(dids.filter(Boolean)));
  const profiles = await Promise.all(unique.map((did) => resolveProfile(did, signal)));
  return new Map(profiles.map((p) => [p.did, p]));
}

/** A friendly display name for a profile, never a raw DID. */
export function profileLabel(profile: ProfileLite | undefined, fallback = "Someone"): string {
  if (!profile) return fallback;
  return profile.displayName || profile.handle || fallback;
}

// ── time helpers ─────────────────────────────────────────────────────────────
export function sortByStartAsc(a: CommunityEvent, b: CommunityEvent): number {
  const ta = a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY;
  const tb = b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY;
  return ta - tb;
}

export type EventTimeBucket = "live" | "upcoming" | "past";

export function bucketForEvent(event: CommunityEvent, now = Date.now()): EventTimeBucket {
  const start = event.startsAt ? Date.parse(event.startsAt) : NaN;
  const end = event.endsAt ? Date.parse(event.endsAt) : start;
  if (!Number.isNaN(end) && end < now) return "past";
  if (!Number.isNaN(start) && start <= now && (Number.isNaN(end) || end >= now)) return "live";
  return "upcoming";
}

// ── ICS (Add to Calendar), pure string, no deps ──────────────────────────────
function icsDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildIcs(event: CommunityEvent): string {
  const start = icsDate(event.startsAt);
  const end = icsDate(event.endsAt) ?? start;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GainForest//Community Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.rkey}@gainforest`,
    start ? `DTSTART:${start}` : "",
    end ? `DTEND:${end}` : "",
    `SUMMARY:${icsEscape(event.name)}`,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : "",
    event.location ? `LOCATION:${icsEscape(event.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

// ── discovery seed repos (pure-XRPC baseline until an indexer exists) ─────────
// Extend with well-known GainForest community/org DIDs so discovery has content
// even for signed-out or brand-new visitors.
export const EVENT_DISCOVERY_SEED_DIDS: string[] = [];

/** Resolve a route identifier (DID or handle) to a DID. Best-effort, XRPC-only. */
export async function resolveEventActorDid(identifier: string, signal?: AbortSignal): Promise<string | null> {
  const value = decodeURIComponent(identifier).trim();
  if (value.startsWith("did:")) return value;
  const url = `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(value)}`;
  const res = await fetch(url, { signal, cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const payload = (await res.json().catch(() => null)) as { did?: unknown } | null;
  return typeof payload?.did === "string" ? payload.did : null;
}

export { resolvePdsHost };
