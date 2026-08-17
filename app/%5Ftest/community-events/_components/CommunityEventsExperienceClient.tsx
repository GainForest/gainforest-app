"use client";

/**
 * /_test/community-events — the Events flows on fixtures.
 *
 * Parity invariant: this renders the PRODUCTION components
 * (EventsDiscoveryClient, EventDetailClient, HostEventClient) unchanged. Only
 * the adapter behind them is mocked: fixture events and RSVPs held in local
 * state, no indexer, no PDS, no proxy writes, no sign-in redirect, no
 * uploads. RSVP, waitlist promotion, publishing, editing and cancelling all
 * work — against memory.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildCommunityEventRecord,
  parseCommunityEvent,
  CALENDAR_EVENT_COLLECTION,
  type CommunityEvent,
  type EventAttendance,
} from "@/app/_lib/community-events";
import { EventsDiscoveryClient } from "@/app/events/_components/EventsDiscoveryClient";
import { EventDetailClient } from "@/app/events/_components/EventDetailClient";
import { HostEventClient } from "@/app/events/_components/HostEventClient";
import type { EventAccountCard, EventsAdapter } from "@/app/events/_lib/adapter";
import { formDateTimeToIso, type EventFormState } from "@/app/events/_lib/form";

const MOCK_VIEWER_DID = "did:plc:mockviewer";
const HOST_DIDS = ["did:plc:mockhostnadia", "did:plc:mockhosttomas", "did:plc:mockhostwanjiru", MOCK_VIEWER_DID];

const NAMES: Record<string, string> = {
  "did:plc:mockhostnadia": "Nadia Okonkwo",
  "did:plc:mockhosttomas": "Tomás Ferreira",
  "did:plc:mockhostwanjiru": "Wanjiru Kamau",
  [MOCK_VIEWER_DID]: "You (mock viewer)",
};

function daysFromNow(days: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function fixtureEvent(
  did: string,
  rkey: string,
  value: Record<string, unknown>,
): CommunityEvent {
  const parsed = parseCommunityEvent(`at://${did}/${CALENDAR_EVENT_COLLECTION}/${rkey}`, {
    $type: CALENDAR_EVENT_COLLECTION,
    createdAt: new Date().toISOString(),
    ...value,
  });
  if (!parsed) throw new Error("fixture event failed to parse");
  return parsed;
}

function initialFixtures(): { events: CommunityEvent[]; rsvps: Map<string, string[]> } {
  const events = [
    fixtureEvent("did:plc:mockhostnadia", "dawn-bird-count", {
      name: "Dawn Bird Count at Marsh Lane",
      description:
        "We meet at first light and walk the east hide loop, counting everything we hear and see.\n\nBring binoculars if you have them — we have three pairs to lend. Beginners are very welcome; you will be paired with someone who knows the calls.",
      startsAt: daysFromNow(9, 6, 30),
      endsAt: daysFromNow(9, 9, 0),
      mode: "community.lexicon.calendar.event#inperson",
      locations: [
        { $type: "community.lexicon.location.address", country: "GB", locality: "Ipswich", name: "Marsh Lane car park, Ipswich Wetlands" },
      ],
      "app.gainforest.event": {
        capacity: 30,
        agenda: [
          { time: "6:30", text: "Meet at the Marsh Lane gate" },
          { time: "6:45", text: "Walk the east hide loop and count in pairs" },
          { time: "8:30", text: "Upload observations together, tea afterwards" },
        ],
        themeTag: "Beginners welcome",
        meetingNote: "Marsh Lane car park, by the noticeboard",
        goodToKnow: "Free to attend · Wheelchair access unknown · Children welcome with an adult",
      },
    }),
    fixtureEvent("did:plc:mockhostnadia", "fungi-photography", {
      name: "How to photograph fungi without disturbing them",
      description: "An online session with plenty of time for questions. Bring your worst fungi photo and we will fix it together.",
      startsAt: daysFromNow(21, 19, 0),
      endsAt: daysFromNow(21, 20, 0),
      mode: "community.lexicon.calendar.event#virtual",
      locations: [{ $type: "community.lexicon.calendar.event#uri", uri: "https://example.org/join-session", name: "Join online" }],
      "app.gainforest.event": {},
    }),
    fixtureEvent("did:plc:mockhosttomas", "riverbank-cleanup", {
      name: "Riverbank Cleanup: Rio Verde",
      description: "Gloves and bags provided. We sort what we find and log anything living.",
      startsAt: daysFromNow(17, 9, 0),
      endsAt: daysFromNow(17, 12, 0),
      mode: "community.lexicon.calendar.event#inperson",
      locations: [{ $type: "community.lexicon.location.address", country: "BR", locality: "Rio Verde", name: "Ponte Velha, Rio Verde" }],
      "app.gainforest.event": {},
    }),
    fixtureEvent("did:plc:mockhostwanjiru", "seed-swap", {
      name: "Seed Swap and Pot-luck",
      description: "Bring seeds, cuttings, or just yourself. Everyone leaves with something to plant.",
      startsAt: daysFromNow(24, 14, 0),
      mode: "community.lexicon.calendar.event#inperson",
      locations: [{ $type: "community.lexicon.location.address", country: "KE", locality: "Nairobi", name: "Karura Forest gate B" }],
      "app.gainforest.event": { capacity: 20 },
    }),
    fixtureEvent("did:plc:mockhosttomas", "night-walk-frogs", {
      name: "Night Walk: Frogs of the Kinabatangan",
      description: "A slow walk with headtorches. We record calls for the acoustic archive.",
      startsAt: daysFromNow(31, 19, 30),
      mode: "community.lexicon.calendar.event#inperson",
      locations: [{ $type: "community.lexicon.location.address", country: "MY", locality: "Sabah", name: "Sukau jetty" }],
      "app.gainforest.event": { capacity: 2 },
    }),
  ];

  const rsvps = new Map<string, string[]>([
    [events[0].uri, ["did:plc:mockhosttomas", "did:plc:mockhostwanjiru", "did:plc:attendee3", "did:plc:attendee4"]],
    [events[2].uri, ["did:plc:attendee1", "did:plc:attendee2"]],
    // Full event (capacity 2) with someone already waiting.
    [events[4].uri, ["did:plc:attendee1", "did:plc:attendee2", "did:plc:attendee3"]],
  ]);
  return { events, rsvps };
}

type View = { kind: "discovery" } | { kind: "detail"; did: string; rkey: string } | { kind: "host" };

export function CommunityEventsExperienceClient() {
  const t = useTranslations("cart.testRegistry.communityEvents");
  const [{ events, rsvps }, setStore] = useState(initialFixtures);
  const [view, setView] = useState<View>({ kind: "discovery" });
  const [signedIn, setSignedIn] = useState(true);
  const [signInPrompted, setSignInPrompted] = useState(false);

  const adapter = useMemo<EventsAdapter>(() => {
    const viewerDid = signedIn ? MOCK_VIEWER_DID : null;
    return {
      kind: "mock",
      viewerDidOverride: viewerDid,
      listEvents: async () => events,
      getEvent: async (did, rkey) => events.find((e) => e.did === did && e.rkey === rkey) ?? null,
      attendance: async (uris, viewer) => {
        const map = new Map<string, EventAttendance>();
        for (const uri of uris) {
          const dids = rsvps.get(uri) ?? [];
          map.set(uri, {
            uri,
            dids,
            total: dids.length,
            viewerLikeUri: viewer && dids.includes(viewer) ? `at://${viewer}/app.gainforest.feed.like/mock` : null,
          });
        }
        return map;
      },
      accountCards: async (dids) => {
        const map = new Map<string, EventAccountCard>();
        for (const did of dids) map.set(did, { displayName: NAMES[did] ?? `Attendee ${did.slice(-1)}`, avatarUrl: null });
        return map;
      },
      coverUrl: async () => null,
      rsvp: async (event) => {
        setStore((prev) => {
          const next = new Map(prev.rsvps);
          const existing = next.get(event.uri) ?? [];
          if (!existing.includes(MOCK_VIEWER_DID)) next.set(event.uri, [...existing, MOCK_VIEWER_DID]);
          return { events: prev.events, rsvps: next };
        });
      },
      cancelRsvp: async (event, viewer) => {
        setStore((prev) => {
          const next = new Map(prev.rsvps);
          next.set(event.uri, (next.get(event.uri) ?? []).filter((did) => did !== viewer));
          return { events: prev.events, rsvps: next };
        });
      },
      publish: async (form: EventFormState) => {
        const rkey = `mock-${Date.now().toString(36)}`;
        const record = buildCommunityEventRecord({
          name: form.name,
          description: form.description.trim() || null,
          startsAt: formDateTimeToIso(form.date, form.startTime) ?? new Date().toISOString(),
          endsAt: form.endTime ? formDateTimeToIso(form.date, form.endTime) : null,
          mode: form.mode,
          placeName: form.placeName.trim() || null,
          locality: form.locality.trim() || null,
          country: form.country.trim() || null,
          geo: null,
          onlineUrl: form.onlineUrl.trim() || null,
          eventPageUrl: null,
          capacity: form.capacity.trim() ? Number(form.capacity) : null,
          cover: null,
          agenda: form.agenda.filter((a) => a.text.trim()),
          themeTag: form.themeTag.trim() || null,
          goodToKnow: form.goodToKnow.trim() || null,
          meetingNote: form.meetingNote.trim() || null,
          support: null,
        });
        const created = parseCommunityEvent(`at://${MOCK_VIEWER_DID}/${CALENDAR_EVENT_COLLECTION}/${rkey}`, record);
        if (created) setStore((prev) => ({ events: [...prev.events, created], rsvps: prev.rsvps }));
        return { did: MOCK_VIEWER_DID, rkey, uri: `at://${MOCK_VIEWER_DID}/${CALENDAR_EVENT_COLLECTION}/${rkey}` };
      },
      update: async (event, form) => {
        setStore((prev) => {
          const record = buildCommunityEventRecord(
            {
              name: form.name,
              description: form.description.trim() || null,
              startsAt: formDateTimeToIso(form.date, form.startTime) ?? event.startsAt ?? new Date().toISOString(),
              endsAt: form.endTime ? formDateTimeToIso(form.date, form.endTime) : null,
              mode: form.mode,
              placeName: form.placeName.trim() || null,
              locality: form.locality.trim() || null,
              country: form.country.trim() || null,
              geo: null,
              onlineUrl: form.onlineUrl.trim() || null,
              eventPageUrl: null,
              capacity: form.capacity.trim() ? Number(form.capacity) : null,
              cover: null,
              agenda: form.agenda.filter((a) => a.text.trim()),
              themeTag: form.themeTag.trim() || null,
              goodToKnow: form.goodToKnow.trim() || null,
              meetingNote: form.meetingNote.trim() || null,
              support: null,
            },
            { existingCreatedAt: event.createdAt },
          );
          const updated = parseCommunityEvent(event.uri, record);
          return {
            events: prev.events.map((e) => (e.uri === event.uri && updated ? updated : e)),
            rsvps: prev.rsvps,
          };
        });
      },
      cancelEvent: async (event) => {
        setStore((prev) => ({
          events: prev.events.map((e) => (e.uri === event.uri ? { ...e, status: "cancelled" as const } : e)),
          rsvps: prev.rsvps,
        }));
      },
      requestSignIn: () => setSignInPrompted(true),
    };
  }, [events, rsvps, signedIn]);

  return (
    <div className="min-h-screen bg-muted/30 pb-16">
      <div className="border-b border-border-soft bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
            <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-full border border-border bg-surface p-1 text-sm">
              {(
                [
                  ["discovery", t("tabDiscovery")],
                  ["detail", t("tabDetail")],
                  ["host", t("tabHost")],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    setView(kind === "detail" ? { kind: "detail", did: "did:plc:mockhostnadia", rkey: "dawn-bird-count" } : { kind })
                  }
                  className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${
                    view.kind === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm text-foreground">
              <input type="checkbox" checked={signedIn} onChange={(e) => setSignedIn(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              {t("signedInToggle")}
            </label>
          </div>
        </div>
        {signInPrompted ? (
          <p className="mx-auto mt-3 max-w-5xl rounded-2xl bg-primary/10 px-4 py-2.5 text-sm text-primary" role="status">
            {t("signInPrompt")}
            <button type="button" className="ml-2 font-semibold underline underline-offset-4" onClick={() => setSignInPrompted(false)}>
              {t("dismiss")}
            </button>
          </p>
        ) : null}
      </div>

      {/* Production components, mock adapter. Card links navigate to the real
          /events routes, which is fine — fixtures only exist here, so the tabs
          above are the supported way to move between mock views. */}
      {view.kind === "discovery" ? <EventsDiscoveryClient adapter={adapter} /> : null}
      {view.kind === "detail" ? <EventDetailClient did={view.did} rkey={view.rkey} adapter={adapter} /> : null}
      {view.kind === "host" ? <HostEventClient adapter={adapter} /> : null}
    </div>
  );
}
