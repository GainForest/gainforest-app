"use client";

/**
 * /events — discovery. Search + three filters (date, place text, format)
 * over the interoperable event list, an editorial "Featured" pair when the
 * view is unfiltered, a two-column upcoming grid, in-place RSVP on cards,
 * and the two distinct empty states from the wireframe: A (filters matched
 * nothing — undo the filters) and B (no events at all — become a host).
 */

import Link from "next/link";
import { CalendarPlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  deriveEventCrowd,
  eventStartMs,
  hostEventHref,
  isEventCancelled,
  isEventFinished,
  type CommunityEvent,
  type EventAttendance,
} from "@/app/_lib/community-events";
import { useViewer } from "@/app/_lib/viewer";
import { liveEventsAdapter, type EventAccountCard, type EventsAdapter } from "../_lib/adapter";
import { draftHasContent, loadEventDraft, type StoredEventDraft } from "../_lib/draft";
import { earliestMonthLabel } from "../_lib/dates";
import { EventCardSkeleton } from "./EventBits";
import { EventListCard, FeaturedEventCard, type EventCardData } from "./EventCard";

type DateFilter = "any" | "today" | "weekend" | "week" | "month";
type FormatFilter = "all" | "inperson" | "online";
type SortOrder = "soonest" | "newest";

const PAGE_SIZE = 12;

function isInDateRange(event: CommunityEvent, filter: DateFilter, now: Date): boolean {
  if (filter === "any" || !event.startsAt) return filter === "any";
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  if (filter === "today") {
    return start >= startOfToday && start.getTime() < startOfToday.getTime() + dayMs;
  }
  if (filter === "weekend") {
    // The coming Saturday+Sunday (or the current one, mid-weekend).
    const day = now.getDay();
    const daysUntilSaturday = day === 0 ? -1 : 6 - day;
    const saturday = new Date(startOfToday.getTime() + daysUntilSaturday * dayMs);
    const monday = new Date(saturday.getTime() + 2 * dayMs);
    return start >= (now > saturday ? startOfToday : saturday) && start < monday;
  }
  if (filter === "week") {
    return start >= now && start.getTime() < now.getTime() + 7 * dayMs;
  }
  return start >= now && start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
}

function matchesFormat(event: CommunityEvent, filter: FormatFilter): boolean {
  if (filter === "all") return true;
  if (filter === "inperson") return event.mode === "inperson" || event.mode === "hybrid";
  return event.mode === "virtual" || event.mode === "hybrid";
}

export function EventsDiscoveryClient({ adapter = liveEventsAdapter }: { adapter?: EventsAdapter }) {
  const t = useTranslations("events.discovery");
  const locale = useLocale();
  const viewer = useViewer();
  const viewerDid = adapter.viewerDidOverride !== undefined ? adapter.viewerDidOverride : viewer.sessionDid;

  const [events, setEvents] = useState<CommunityEvent[] | null>(null);
  const [attendance, setAttendance] = useState<Map<string, EventAttendance>>(new Map());
  const [cards, setCards] = useState<Map<string, EventAccountCard>>(new Map());
  const [coverUrls, setCoverUrls] = useState<Map<string, string>>(new Map());
  const [draft, setDraft] = useState<StoredEventDraft | null>(null);

  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [placeFilter, setPlaceFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [sort, setSort] = useState<SortOrder>("soonest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [busyUri, setBusyUri] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState(false);

  const nowRef = useRef(Date.now());

  useEffect(() => {
    setDraft(loadEventDraft());
  }, []);

  // 1. The event list itself.
  useEffect(() => {
    const controller = new AbortController();
    adapter
      .listEvents(controller.signal)
      .then((list) => setEvents(list))
      .catch(() => setEvents([]));
    return () => controller.abort();
  }, [adapter]);

  // 2. Attendance for every listed event (re-runs once the viewer resolves).
  useEffect(() => {
    if (!events || events.length === 0) return;
    const controller = new AbortController();
    adapter
      .attendance(events.map((e) => e.uri), viewerDid ?? null, controller.signal)
      .then(setAttendance)
      .catch(() => undefined);
    return () => controller.abort();
  }, [adapter, events, viewerDid]);

  // 3. Host + attendee profiles, and cover photos.
  useEffect(() => {
    if (!events || events.length === 0) return;
    const controller = new AbortController();
    const dids = new Set<string>();
    for (const event of events) dids.add(event.did);
    for (const entry of attendance.values()) for (const did of entry.dids.slice(0, 6)) dids.add(did);
    adapter
      .accountCards([...dids].slice(0, 100), controller.signal)
      .then((map) => setCards((prev) => new Map([...prev, ...map])))
      .catch(() => undefined);
    void Promise.all(
      events
        .filter((event) => event.coverRef)
        .slice(0, 24)
        .map(async (event) => {
          const url = await adapter.coverUrl(event.did, event.coverRef!, controller.signal).catch(() => null);
          return [event.uri, url] as const;
        }),
    ).then((entries) => {
      setCoverUrls((prev) => {
        const next = new Map(prev);
        for (const [uri, url] of entries) if (url) next.set(uri, url);
        return next;
      });
    });
    return () => controller.abort();
  }, [adapter, events, attendance]);

  const upcoming = useMemo(() => {
    if (!events) return [];
    return events.filter((event) => !isEventCancelled(event) && !isEventFinished(event, nowRef.current));
  }, [events]);

  const filtered = useMemo(() => {
    const now = new Date(nowRef.current);
    const q = query.trim().toLowerCase();
    const place = placeFilter.trim().toLowerCase();
    const list = upcoming.filter((event) => {
      if (!matchesFormat(event, formatFilter)) return false;
      if (dateFilter !== "any" && !isInDateRange(event, dateFilter, now)) return false;
      if (place) {
        const haystack = [event.locationName, event.locality, event.region, event.country].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(place)) return false;
      }
      if (q) {
        const host = cards.get(event.did)?.displayName ?? "";
        const haystack = [event.name, event.description, event.locationName, event.locality, host].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    if (sort === "newest") {
      return [...list].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    }
    // "Soonest first" sorts here, not in the adapter, so every data source
    // (live indexer, /_test fixtures) renders the same chronological order.
    return [...list].sort((a, b) => {
      const aStart = eventStartMs(a);
      const bStart = eventStartMs(b);
      if (aStart === null && bStart === null) return 0;
      if (aStart === null) return 1;
      if (bStart === null) return -1;
      return aStart - bStart;
    });
  }, [upcoming, query, placeFilter, formatFilter, dateFilter, sort, cards]);

  const hasActiveFilters = Boolean(query.trim() || placeFilter.trim() || dateFilter !== "any" || formatFilter !== "all");
  const showFeatured = !hasActiveFilters && sort === "soonest";
  const featured = useMemo(() => (showFeatured ? filtered.filter((event) => event.coverRef).slice(0, 2) : []), [filtered, showFeatured]);
  const featuredUris = useMemo(() => new Set(featured.map((event) => event.uri)), [featured]);
  const listEvents = useMemo(() => filtered.filter((event) => !featuredUris.has(event.uri)), [filtered, featuredUris]);

  const cardDataFor = useCallback(
    (event: CommunityEvent): EventCardData => ({
      event,
      crowd: deriveEventCrowd(event, attendance.get(event.uri) ?? null, viewerDid ?? null, nowRef.current),
      hostCard: cards.get(event.did) ?? null,
      coverUrl: coverUrls.get(event.uri) ?? null,
      attendeeCards: cards,
    }),
    [attendance, cards, coverUrls, viewerDid],
  );

  const handleRsvp = useCallback(
    async (event: CommunityEvent) => {
      if (!viewerDid) {
        adapter.requestSignIn();
        return;
      }
      setRsvpError(false);
      setBusyUri(event.uri);
      const previous = attendance;
      const optimistic = new Map(previous);
      const entry = previous.get(event.uri) ?? { uri: event.uri, dids: [], total: 0, viewerLikeUri: null };
      if (!entry.dids.includes(viewerDid)) {
        optimistic.set(event.uri, { ...entry, dids: [...entry.dids, viewerDid], total: entry.total + 1 });
        setAttendance(optimistic);
      }
      try {
        await adapter.rsvp(event);
      } catch {
        setAttendance(previous);
        setRsvpError(true);
      } finally {
        setBusyUri(null);
      }
    },
    [adapter, attendance, viewerDid],
  );

  const clearAllFilters = useCallback(() => {
    setQuery("");
    setPlaceFilter("");
    setDateFilter("any");
    setFormatFilter("all");
  }, []);

  const monthLabel = earliestMonthLabel(filtered, locale);
  const loading = events === null;

  const activeFilterChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (query.trim()) activeFilterChips.push({ key: "query", label: `“${query.trim()}”`, clear: () => setQuery("") });
  if (dateFilter !== "any") activeFilterChips.push({ key: "date", label: t(`filters.${dateFilter}`), clear: () => setDateFilter("any") });
  if (placeFilter.trim()) activeFilterChips.push({ key: "place", label: placeFilter.trim(), clear: () => setPlaceFilter("") });
  if (formatFilter !== "all") activeFilterChips.push({ key: "format", label: t(formatFilter === "inperson" ? "filters.inPerson" : "filters.online"), clear: () => setFormatFilter("all") });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      {/* Heading + host entry point */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("intro")}</p>
        </div>
        <Link
          href={hostEventHref()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
        >
          <CalendarPlusIcon className="size-4" aria-hidden />
          {t("hostCta")}
        </Link>
      </div>

      {draftHasContent(draft) ? (
        <Link
          href={hostEventHref()}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border-soft bg-surface-sunken px-4 py-3 text-sm"
        >
          <span className="truncate text-muted-foreground">
            {t("draftRow", { name: draft.form.name.trim() || t("draftUntitled") })}
          </span>
          <span className="shrink-0 font-semibold text-primary">{t("draftContinue")}</span>
        </Link>
      ) : null}

      {/* Search + filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-64">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-full border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            aria-label={t("filters.dateAria")}
            className="rounded-full border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="any">{t("filters.any")}</option>
            <option value="today">{t("filters.today")}</option>
            <option value="weekend">{t("filters.weekend")}</option>
            <option value="week">{t("filters.week")}</option>
            <option value="month">{t("filters.month")}</option>
          </select>
          <input
            type="text"
            value={placeFilter}
            onChange={(e) => setPlaceFilter(e.target.value)}
            placeholder={t("filters.anywherePlaceholder")}
            aria-label={t("filters.placeAria")}
            className="w-32 rounded-full border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <div className="flex shrink-0 items-center rounded-full border border-border bg-surface p-1" role="tablist" aria-label={t("filters.formatAria")}>
            {(["all", "inperson", "online"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={formatFilter === value}
                onClick={() => setFormatFilter(value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  formatFilter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {value === "all" ? t("filters.all") : value === "inperson" ? t("filters.inPerson") : t("filters.online")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result count + sort */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {loading
            ? t("counting")
            : [
                t("countEvents", { count: filtered.length }),
                placeFilter.trim() || t("anywhere"),
                monthLabel ? t("monthOnwards", { month: monthLabel }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </span>
        <label className="flex items-center gap-1.5">
          <span>{t("sortLabel")}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
            className="rounded-full border border-transparent bg-transparent py-1 pr-1 text-sm font-medium text-foreground focus:outline-none"
          >
            <option value="soonest">{t("sortSoonest")}</option>
            <option value="newest">{t("sortNewest")}</option>
          </select>
        </label>
      </div>

      {rsvpError ? (
        <p className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive" role="alert">
          {t("rsvpFailed")}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        /* Empty state B — a supply problem: become a host, or look online. */
        <div className="mt-8 rounded-3xl border border-border-soft bg-surface px-6 py-14 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <CalendarPlusIcon className="size-7" aria-hidden />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-foreground">{t("emptyRegion.title")}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t("emptyRegion.body")}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href={hostEventHref()} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">
              {t("hostCta")}
            </Link>
            <button
              type="button"
              onClick={() => setFormatFilter("online")}
              className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/50"
            >
              {t("emptyRegion.seeOnline")}
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        /* Empty state A — a filter problem: undo the filters. */
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background"
              >
                {chip.label}
                <XIcon className="size-3.5" aria-hidden />
              </button>
            ))}
            <button type="button" onClick={clearAllFilters} className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground">
              {t("emptyFiltered.clearAll")}
            </button>
          </div>
          <div className="mt-4 rounded-3xl border border-border-soft bg-surface px-6 py-14 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <SearchIcon className="size-7" aria-hidden />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-foreground">{t("emptyFiltered.title")}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t("emptyFiltered.body")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={clearAllFilters} className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/50">
                {t("emptyFiltered.clearFilters")}
              </button>
              <Link href={hostEventHref()} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">
                {t("hostCta")}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {featured.length > 0 ? (
            <section className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">{t("featuredTitle")}</h2>
                <span className="text-xs text-muted-foreground">{t("featuredNote")}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {featured.map((event) => (
                  <FeaturedEventCard key={event.uri} data={cardDataFor(event)} busy={busyUri === event.uri} onRsvp={() => void handleRsvp(event)} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-7">
            {featured.length > 0 ? <h2 className="text-lg font-semibold text-foreground">{t("upcomingTitle")}</h2> : null}
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              {listEvents.slice(0, visibleCount).map((event) => (
                <EventListCard key={event.uri} data={cardDataFor(event)} busy={busyUri === event.uri} onRsvp={() => void handleRsvp(event)} />
              ))}
            </div>
            {listEvents.length > visibleCount ? (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
                >
                  {t("showMore")}
                </button>
              </div>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
