"use client";

/**
 * /events/[did]/[rkey] — the event page. Cover, title + key facts, the
 * host's description, the optional agenda, host card, opt-in attendee list,
 * and the RSVP panel (sticky on desktop, a pinned bar on mobile) with the
 * wireframe's full state set: default → confirmed (meeting point revealed,
 * cancel behind a confirmation) → full/waitlist → finished — plus the
 * host-cancelled banner and the organizer's own view (Edit / Cancel event).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  CheckIcon,
  MapPinIcon,
  PencilIcon,
  Share2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  deriveEventCrowd,
  eventHref,
  isEventCancelled,
  type CommunityEvent,
  type EventAttendance,
} from "@/app/_lib/community-events";
import { accountHref } from "@/app/_lib/urls";
import { useViewer } from "@/app/_lib/viewer";
import { liveEventsAdapter, type EventAccountCard, type EventsAdapter } from "../_lib/adapter";
import { eventDayLine, eventLongDateLine, eventTimeRange } from "../_lib/dates";
import { downloadEventIcs } from "../_lib/ics";
import { AvatarFace, CoverArt, FaceStack } from "./EventBits";

type PanelMode = "default" | "cancelConfirm" | "cancelEventConfirm";

export function EventDetailClient({
  did,
  rkey,
  initialEvent,
  adapter = liveEventsAdapter,
}: {
  did: string;
  rkey: string;
  initialEvent?: CommunityEvent | null;
  adapter?: EventsAdapter;
}) {
  const t = useTranslations("events.detail");
  const tCard = useTranslations("events.card");
  const locale = useLocale();
  const router = useRouter();
  const viewer = useViewer();
  const viewerDid = adapter.viewerDidOverride !== undefined ? adapter.viewerDidOverride : viewer.sessionDid;

  const [event, setEvent] = useState<CommunityEvent | null>(initialEvent ?? null);
  const [notFound, setNotFound] = useState(false);
  const [attendance, setAttendance] = useState<EventAttendance | null>(null);
  const [cards, setCards] = useState<Map<string, EventAccountCard>>(new Map());
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [hostedCount, setHostedCount] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("default");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllAttendees, setShowAllAttendees] = useState(false);

  const nowMs = useMemo(() => Date.now(), []);

  // Load (or refresh) the event record.
  useEffect(() => {
    const controller = new AbortController();
    adapter
      .getEvent(did, rkey, controller.signal)
      .then((loaded) => {
        if (loaded) setEvent(loaded);
        else if (!initialEvent) setNotFound(true);
      })
      .catch(() => {
        if (!initialEvent) setNotFound(true);
      });
    return () => controller.abort();
  }, [adapter, did, rkey, initialEvent]);

  // Attendance + profiles + cover + the host's hosted-count.
  useEffect(() => {
    if (!event) return;
    const controller = new AbortController();
    adapter
      .attendance([event.uri], viewerDid ?? null, controller.signal)
      .then((map) => setAttendance(map.get(event.uri) ?? null))
      .catch(() => undefined);
    if (event.coverRef) {
      void adapter.coverUrl(event.did, event.coverRef, controller.signal).then((url) => setCoverUrl(url)).catch(() => undefined);
    }
    void adapter
      .listEvents(controller.signal)
      .then((all) => setHostedCount(all.filter((e) => e.did === event.did).length))
      .catch(() => undefined);
    return () => controller.abort();
  }, [adapter, event, viewerDid]);

  useEffect(() => {
    if (!event) return;
    const controller = new AbortController();
    const dids = new Set<string>([event.did]);
    for (const attendee of attendance?.dids ?? []) dids.add(attendee);
    adapter
      .accountCards([...dids].slice(0, 100), controller.signal)
      .then((map) => setCards((prev) => new Map([...prev, ...map])))
      .catch(() => undefined);
    return () => controller.abort();
  }, [adapter, event, attendance]);

  const crowd = event ? deriveEventCrowd(event, attendance, viewerDid ?? null, nowMs) : null;
  const isOrganizer = Boolean(event && viewerDid && event.did === viewerDid);
  const cancelled = event ? isEventCancelled(event) : false;
  const pageUrl = typeof window !== "undefined" && event ? `${window.location.origin}${eventHref(event.did, event.rkey)}` : "";

  const handleRsvp = useCallback(async () => {
    if (!event) return;
    if (!viewerDid) {
      adapter.requestSignIn();
      return;
    }
    setActionError(false);
    setBusy(true);
    const previous = attendance;
    const entry = previous ?? { uri: event.uri, dids: [], total: 0, viewerLikeUri: null };
    if (!entry.dids.includes(viewerDid)) {
      setAttendance({ ...entry, dids: [...entry.dids, viewerDid], total: entry.total + 1 });
    }
    try {
      await adapter.rsvp(event);
      const fresh = await adapter.attendance([event.uri], viewerDid).catch(() => null);
      if (fresh?.get(event.uri)) setAttendance(fresh.get(event.uri)!);
    } catch {
      setAttendance(previous);
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }, [adapter, attendance, event, viewerDid]);

  const handleCancelRsvp = useCallback(async () => {
    if (!event || !viewerDid) return;
    setActionError(false);
    setBusy(true);
    const previous = attendance;
    if (previous) {
      setAttendance({ ...previous, dids: previous.dids.filter((d) => d !== viewerDid), total: Math.max(0, previous.total - 1), viewerLikeUri: null });
    }
    try {
      await adapter.cancelRsvp(event, viewerDid, previous?.viewerLikeUri ?? null);
      setPanelMode("default");
    } catch {
      setAttendance(previous);
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }, [adapter, attendance, event, viewerDid]);

  const handleCancelEvent = useCallback(async () => {
    if (!event) return;
    setActionError(false);
    setBusy(true);
    try {
      await adapter.cancelEvent(event);
      setEvent({ ...event, status: "cancelled" });
      setPanelMode("default");
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }, [adapter, event]);

  const handleShare = useCallback(async () => {
    if (!event) return;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: event.name, url: pageUrl });
        return;
      }
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user dismissed the sheet */
    }
  }, [event, pageUrl]);

  const handleCalendar = useCallback(() => {
    if (event) downloadEventIcs(event, pageUrl);
  }, [event, pageUrl]);

  if (notFound) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-semibold text-foreground">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFoundBody")}</p>
        <Link href="/events" className="mt-6 inline-block rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">
          {t("back")}
        </Link>
      </main>
    );
  }

  if (!event || !crowd) {
    return (
      <main className="mx-auto w-full max-w-5xl animate-pulse px-4 py-8 sm:px-6">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="mt-6 aspect-[3/1] rounded-3xl bg-muted" />
        <div className="mt-6 h-8 w-2/3 rounded bg-muted" />
        <div className="mt-4 h-4 w-1/2 rounded bg-muted" />
      </main>
    );
  }

  const hostCard = cards.get(event.did) ?? null;
  const going = crowd.goingDids;
  const formatChip =
    event.mode === "virtual"
      ? `${tCard("online")} · ${tCard("joinAnywhere")}`
      : [event.mode === "hybrid" ? tCard("hybrid") : tCard("inPerson"), event.locationName ?? event.locality].filter(Boolean).join(" · ");

  const shareCalendarRow = (
    <div className="flex gap-2">
      <button type="button" onClick={() => void handleShare()} className="flex-1 rounded-full border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/50">
        <span className="inline-flex items-center gap-1.5">
          <Share2Icon className="size-4" aria-hidden />
          {copied ? t("copied") : t("share")}
        </span>
      </button>
      <button type="button" onClick={handleCalendar} className="flex-1 rounded-full border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/50">
        <span className="inline-flex items-center gap-1.5">
          <CalendarPlusIcon className="size-4" aria-hidden />
          {t("addToCalendar")}
        </span>
      </button>
    </div>
  );

  /** The RSVP panel body — shared by the desktop aside and mobile section. */
  const rsvpPanel = (
    <div className="rounded-3xl border border-border-soft bg-surface p-5 shadow-sm">
      {isOrganizer ? (
        panelMode === "cancelEventConfirm" ? (
          <div>
            <h3 className="font-semibold text-foreground">{t("organizer.cancelEventTitle")}</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("organizer.cancelEventBody")}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy} onClick={() => setPanelMode("default")} className="flex-1 rounded-full border border-border px-3 py-2 text-sm font-semibold text-foreground">
                {t("organizer.keepEvent")}
              </button>
              <button type="button" disabled={busy} onClick={() => void handleCancelEvent()} className="flex-1 rounded-full bg-destructive px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "…" : t("organizer.cancelEventConfirm")}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="font-semibold text-foreground">{t("organizer.youAreHost")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {tCard("goingCount", { count: crowd.going })}
              {crowd.waiting > 0 ? ` · ${t("peopleWaiting", { count: crowd.waiting })}` : crowd.spotsLeft !== null ? ` · ${tCard("spotsLeft", { count: crowd.spotsLeft })}` : ""}
            </p>
            {!cancelled ? (
              <div className="mt-4 space-y-2">
                <Link
                  href={`/events/host?edit=${encodeURIComponent(event.rkey)}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark"
                >
                  <PencilIcon className="size-4" aria-hidden />
                  {t("organizer.edit")}
                </Link>
                {shareCalendarRow}
                <button type="button" onClick={() => setPanelMode("cancelEventConfirm")} className="w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-destructive">
                  {t("organizer.cancelEvent")}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t("cancelledNote")}</p>
            )}
          </div>
        )
      ) : cancelled ? (
        <p className="text-sm leading-6 text-muted-foreground">{t("cancelledNote")}</p>
      ) : crowd.viewerState === "finished" ? (
        <div>
          <p className="text-sm text-muted-foreground">{t("finishedNote")}</p>
        </div>
      ) : crowd.viewerState === "going" || crowd.viewerState === "waitlisted" ? (
        panelMode === "cancelConfirm" ? (
          <div>
            <h3 className="font-semibold text-foreground">{t("cancelTitle")}</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("cancelBody")}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy} onClick={() => setPanelMode("default")} className="flex-1 rounded-full border border-border px-3 py-2 text-sm font-semibold text-foreground">
                {t("keepSpot")}
              </button>
              <button type="button" disabled={busy} onClick={() => void handleCancelRsvp()} className="flex-1 rounded-full bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-60">
                {busy ? "…" : t("cancelConfirm")}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <CheckIcon className="size-4" aria-hidden />
              </span>
              {crowd.viewerState === "going" ? t("youreGoing") : t("onWaitlist")}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {crowd.viewerState === "going" ? (
                <>
                  {eventLongDateLine(event, locale)}
                  {event.meetingNote ? (
                    <>
                      {" · "}
                      {t("meetingPoint", { note: event.meetingNote })}
                    </>
                  ) : null}
                </>
              ) : (
                t("waitlistNote")
              )}
            </p>
            <div className="mt-4 space-y-2">
              {shareCalendarRow}
              <button type="button" onClick={() => setPanelMode("cancelConfirm")} className="w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {t("cancelMyRsvp")}
              </button>
            </div>
          </div>
        )
      ) : (
        <div>
          <h3 className="font-semibold text-foreground">{eventDayLine(event, locale) ?? event.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {eventTimeRange(event, locale)} · {t("yourLocalTime")}
          </p>
          {event.mode !== "virtual" ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-dashed border-border">
              <div className="grid h-24 place-items-center bg-surface-sunken text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon className="size-4" aria-hidden />
                  {event.locationName ?? t("mapPlaceholder")}
                </span>
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {event.mode === "virtual" ? tCard("joinAnywhere") : event.meetingNote ? t("meetingPointAfter") : (event.locationName ?? "")}
          </p>
          {crowd.viewerState === "full" ? (
            <>
              <p className="mt-3 text-sm font-medium text-foreground">{t("fullTitle")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRsvp()}
                className="mt-2 w-full rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 disabled:opacity-60"
              >
                {busy ? "…" : t("joinTheWaitlist")}
              </button>
              {crowd.waiting > 0 ? <p className="mt-2 text-center text-xs text-muted-foreground">{t("peopleWaiting", { count: crowd.waiting })}</p> : null}
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRsvp()}
                className="mt-3 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {busy ? "…" : t("rsvpCta")}
              </button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {tCard("goingCount", { count: crowd.going })}
                {crowd.spotsLeft !== null ? ` · ${tCard("spotsLeft", { count: crowd.spotsLeft })}` : ""}
              </p>
            </>
          )}
          <div className="mt-3">{shareCalendarRow}</div>
        </div>
      )}
      {actionError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-16">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("back")}
      </Link>

      {cancelled ? (
        <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">
          {t("cancelledBanner")}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-8 lg:flex-row">
        <article className="min-w-0 flex-1">
          {/* Cover — falls back to the event's generated art, the same art
              the host editor previews. */}
          <div className="overflow-hidden rounded-3xl border border-border-soft bg-surface-sunken">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- PDS blob URL resolved at runtime; hosts are unbounded.
              <img src={coverUrl} alt="" className="aspect-[3/1] w-full object-cover" />
            ) : (
              <CoverArt seed={event.name.trim() || event.rkey} className="aspect-[3/1] w-full" />
            )}
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{event.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {eventLongDateLine(event, locale) ? (
              <span className="rounded-full border border-border px-3 py-1.5 text-foreground">{eventLongDateLine(event, locale)}</span>
            ) : null}
            {formatChip ? <span className="rounded-full border border-border px-3 py-1.5 text-foreground">{formatChip}</span> : null}
            {event.themeTag ? <span className="rounded-full border border-border px-3 py-1.5 text-foreground">{event.themeTag}</span> : null}
          </div>

          {event.description ? (
            <section className="mt-7">
              <h2 className="text-lg font-semibold text-foreground">{t("about")}</h2>
              <div className="mt-2 space-y-3 text-sm leading-7 text-foreground/85">
                {event.description.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          {/* Hidden entirely when the host left it empty. */}
          {event.agenda.length > 0 ? (
            <section className="mt-7">
              <h2 className="text-lg font-semibold text-foreground">{t("whatToExpect")}</h2>
              <div className="mt-2 divide-y divide-border-soft rounded-2xl border border-border-soft bg-surface">
                {event.agenda.map((item, i) => (
                  <div key={i} className="flex gap-4 px-4 py-3 text-sm">
                    <span className="w-14 shrink-0 font-semibold text-muted-foreground">{item.time}</span>
                    <span className="text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-7">
            <h2 className="text-lg font-semibold text-foreground">{t("yourHost")}</h2>
            <div className="mt-2 flex items-center gap-4 rounded-2xl border border-border-soft bg-surface p-4">
              <AvatarFace card={hostCard} className="size-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{hostCard?.displayName ?? tCard("aNeighbour")}</p>
                {hostedCount !== null && hostedCount > 0 ? (
                  <p className="text-sm text-muted-foreground">{t("hostedEvents", { count: hostedCount })}</p>
                ) : null}
              </div>
              <Link href={accountHref(event.did)} className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/50">
                {t("viewProfile")}
              </Link>
            </div>
          </section>

          {attendance && attendance.total > 0 ? (
            <section className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">{t("whosComing")}</h2>
                {attendance.total > 6 && !showAllAttendees ? (
                  <button type="button" onClick={() => setShowAllAttendees(true)} className="text-sm font-medium text-primary hover:underline">
                    {t("seeAll", { count: attendance.total })}
                  </button>
                ) : null}
              </div>
              {showAllAttendees ? (
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {attendance.dids.map((attendee) => (
                    <li key={attendee} className="flex items-center gap-2.5 rounded-2xl border border-border-soft bg-surface px-3 py-2">
                      <AvatarFace card={cards.get(attendee) ?? null} className="size-7" />
                      <span className="truncate text-sm text-foreground">{cards.get(attendee)?.displayName ?? tCard("aNeighbour")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3">
                  <FaceStack dids={going} cards={cards} max={7} size="size-10" />
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{t("namesNote")}</p>
            </section>
          ) : null}
        </article>

        {/* Desktop: sticky right column. */}
        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4">
            {rsvpPanel}
            <div className="rounded-3xl border border-border-soft bg-surface p-5">
              <h3 className="text-sm font-semibold text-foreground">{t("goodToKnow")}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{event.goodToKnow ?? t("freeToAttend")}</p>
            </div>
          </div>
        </aside>

        {/* Mobile: panel inline + persistent bottom bar. */}
        <div className="lg:hidden">
          {rsvpPanel}
          <div className="mt-4 rounded-3xl border border-border-soft bg-surface p-5">
            <h3 className="text-sm font-semibold text-foreground">{t("goodToKnow")}</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{event.goodToKnow ?? t("freeToAttend")}</p>
          </div>
        </div>
      </div>

      {/* Mobile pinned RSVP bar — visible at every scroll position. */}
      {!isOrganizer && !cancelled && crowd.viewerState !== "finished" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-soft bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold text-foreground">
                {t("freeShort")}
                {crowd.spotsLeft !== null ? ` · ${tCard("spotsLeft", { count: crowd.spotsLeft })}` : ""}
              </p>
              <p className="truncate text-xs text-muted-foreground">{eventLongDateLine(event, locale)}</p>
            </div>
            {crowd.viewerState === "going" || crowd.viewerState === "waitlisted" ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                <CheckCircle2Icon className="size-4" aria-hidden />
                {crowd.viewerState === "going" ? t("youreGoing") : t("onWaitlist")}
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRsvp()}
                className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {crowd.viewerState === "full" ? t("joinTheWaitlist") : t("rsvpShort")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
