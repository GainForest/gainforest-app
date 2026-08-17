"use client";

/**
 * The seam between the Events UI and the outside world. Production uses
 * `liveEventsAdapter` (indexer + PDS reads, proxy writes). The `/_test`
 * registry injects a fixture adapter so the SAME components run with mock
 * data, persistence and side effects — per the registry's parity invariant.
 * Components never call fetch/mutations directly; they go through this.
 */

import {
  fetchAllCommunityEvents,
  fetchCommunityEvent,
  fetchEventsAttendance,
  type CommunityEvent,
  type EventAttendance,
} from "@/app/_lib/community-events";
import { fetchAccountCards } from "@/app/_lib/indexer";
import { resolveBlobUrl } from "@/app/_lib/pds";
import {
  cancelCommunityEvent,
  cancelCommunityEventRsvp,
  publishCommunityEvent,
  rsvpToCommunityEvent,
  updateCommunityEvent,
  type PublishEventResult,
} from "./actions";
import type { EventFormState } from "./form";

export type EventAccountCard = {
  displayName: string | null;
  avatarUrl: string | null;
};

export type EventsAdapter = {
  /** "live" fetches and writes for real; "mock" is the /_test registry. */
  kind: "live" | "mock";
  /** When set, the components use this instead of the real session viewer —
   *  lets the registry simulate signed-in and signed-out states. */
  viewerDidOverride?: string | null;
  listEvents(signal?: AbortSignal): Promise<CommunityEvent[]>;
  getEvent(did: string, rkey: string, signal?: AbortSignal): Promise<CommunityEvent | null>;
  attendance(uris: string[], viewerDid: string | null, signal?: AbortSignal): Promise<Map<string, EventAttendance>>;
  accountCards(dids: string[], signal?: AbortSignal): Promise<Map<string, EventAccountCard>>;
  coverUrl(did: string, ref: string, signal?: AbortSignal): Promise<string | null>;
  rsvp(event: CommunityEvent): Promise<void>;
  cancelRsvp(event: CommunityEvent, viewerDid: string, viewerLikeUri: string | null): Promise<void>;
  publish(form: EventFormState, options: { origin: string; locale: string }): Promise<PublishEventResult>;
  update(event: CommunityEvent, form: EventFormState, options: { origin: string }): Promise<void>;
  cancelEvent(event: CommunityEvent): Promise<void>;
  /** Sign-in hand-off for signed-out RSVPs. Mock adapters swap this out. */
  requestSignIn(): void;
};

export const liveEventsAdapter: EventsAdapter = {
  kind: "live",
  listEvents: (signal) => fetchAllCommunityEvents(signal),
  getEvent: (did, rkey, signal) => fetchCommunityEvent(did, rkey, signal),
  attendance: (uris, viewerDid, signal) => fetchEventsAttendance(uris, viewerDid, signal),
  accountCards: async (dids, signal) => {
    const cards = await fetchAccountCards(dids, signal).catch(() => new Map());
    const resolved = new Map<string, EventAccountCard>();
    await Promise.all(
      [...cards.entries()].map(async ([did, card]) => {
        const avatarUrl = card.avatarRef ? await resolveBlobUrl(did, card.avatarRef, signal).catch(() => null) : null;
        resolved.set(did, { displayName: card.displayName, avatarUrl });
      }),
    );
    return resolved;
  },
  coverUrl: (did, ref, signal) => resolveBlobUrl(did, ref, signal),
  rsvp: (event) => rsvpToCommunityEvent(event.uri),
  cancelRsvp: (event, viewerDid, viewerLikeUri) => cancelCommunityEventRsvp(event.uri, viewerDid, viewerLikeUri),
  publish: (form, options) => publishCommunityEvent(form, options),
  update: (event, form, options) => updateCommunityEvent(event, form, options),
  cancelEvent: (event) => cancelCommunityEvent(event),
  requestSignIn: () => {
    // Imported lazily to keep auth-client out of the mock bundle path.
    void import("@/app/_lib/auth-client").then((mod) => mod.redirectToLogin());
  },
};
