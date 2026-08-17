"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDaysIcon, ChevronDownIcon, ListFilterIcon, ArrowUpDownIcon } from "lucide-react";
import { useAccountList } from "@/app/_lib/account-switcher";
import { parseAtUri } from "@/app/_lib/pds";
import {
  EVENT_DISCOVERY_SEED_DIDS,
  bucketForEvent,
  getEvent,
  listEventsForDids,
  listFollowDids,
  listRsvpsForDid,
  resolveProfiles,
  sortByStartAsc,
  type CommunityEvent,
  type EventMode,
  type ProfileLite,
} from "@/app/_lib/events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EventCard } from "./EventCard";

type Tab = "all" | "mine" | "enrolled";
type TypeFilter = "all" | EventMode;
type SortBy = "soon" | "recent" | "az";

function sortEvents(list: CommunityEvent[], sortBy: SortBy): CommunityEvent[] {
  const arr = [...list];
  if (sortBy === "recent") {
    arr.sort((a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0));
  } else if (sortBy === "az") {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    arr.sort(sortByStartAsc);
  }
  return arr;
}

const chipTrigger =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

export function EventsDiscoveryClient({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("events");
  const { groups } = useAccountList(sessionDid);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [myUris, setMyUris] = useState<Set<string>>(new Set());
  const [enrolledUris, setEnrolledUris] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("soon");

  const orgDids = useMemo(() => groups.map((g) => g.groupDid), [groups]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let cancelled = false;

    async function run() {
      setLoading(true);
      const hostDids = new Set<string>(EVENT_DISCOVERY_SEED_DIDS);
      const mine = new Set<string>();
      const enrolled = new Set<string>();

      if (sessionDid) {
        hostDids.add(sessionDid);
        for (const did of orgDids) hostDids.add(did);
        for (const did of await listFollowDids(sessionDid, 100, signal)) hostDids.add(did);
      }

      const hosted = await listEventsForDids(Array.from(hostDids), signal).catch(() => []);
      const byUri = new Map<string, CommunityEvent>();
      for (const e of hosted) byUri.set(e.uri, e);
      for (const e of hosted) {
        if (sessionDid && (e.did === sessionDid || orgDids.includes(e.did))) mine.add(e.uri);
      }

      if (sessionDid) {
        const rsvps = await listRsvpsForDid(sessionDid, signal).catch(() => []);
        const active = rsvps.filter((r) => r.status !== "notgoing");
        const fetched = await Promise.all(
          active.map(async (r) => {
            mine.add(r.subjectUri);
            enrolled.add(r.subjectUri);
            if (byUri.has(r.subjectUri)) return null;
            const parts = parseAtUri(r.subjectUri);
            if (!parts) return null;
            return getEvent(parts.did, parts.rkey, signal).catch(() => null);
          }),
        );
        for (const e of fetched) if (e) byUri.set(e.uri, e);
      }

      const all = Array.from(byUri.values());
      const hostProfiles = await resolveProfiles(all.map((e) => e.did), signal).catch(() => new Map<string, ProfileLite>());

      if (cancelled) return;
      setEvents(all);
      setProfiles(hostProfiles);
      setMyUris(mine);
      setEnrolledUris(enrolled);
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionDid, orgDids]);

  const tabbed =
    tab === "mine"
      ? events.filter((e) => myUris.has(e.uri))
      : tab === "enrolled"
        ? events.filter((e) => enrolledUris.has(e.uri))
        : events;
  const typed = typeFilter === "all" ? tabbed : tabbed.filter((e) => e.mode === typeFilter);

  const now = Date.now();
  const live = sortEvents(typed.filter((e) => bucketForEvent(e, now) === "live"), sortBy);
  const upcoming = sortEvents(typed.filter((e) => bucketForEvent(e, now) === "upcoming"), sortBy);
  const past = typed.filter((e) => bucketForEvent(e, now) === "past").sort((a, b) => -sortByStartAsc(a, b));
  const renderable = live.length + upcoming.length + (tab === "all" ? 0 : past.length);
  const filtersActive = typeFilter !== "all";

  const typeLabel = (v: TypeFilter) =>
    v === "all" ? t("discovery.typeAll") : t(`create.type.${v}`);
  const sortLabel = (v: SortBy) =>
    v === "soon" ? t("discovery.sortSoonest") : v === "recent" ? t("discovery.sortRecent") : t("discovery.sortAz");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sessionDid ? (
          <div className="inline-flex items-center gap-1">
            {(["all", "mine", "enrolled"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
                  tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "all" ? t("discovery.tabAll") : value === "mine" ? t("discovery.tabMine") : t("discovery.tabEnrolled")}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={chipTrigger}>
                <ListFilterIcon className="size-4" />
                {typeLabel(typeFilter)}
                <ChevronDownIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                {(["all", "inperson", "virtual", "hybrid"] as const).map((v) => (
                  <DropdownMenuRadioItem key={v} value={v}>
                    {typeLabel(v)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={chipTrigger}>
                <ArrowUpDownIcon className="size-4" />
                {sortLabel(sortBy)}
                <ChevronDownIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                {(["soon", "recent", "az"] as const).map((v) => (
                  <DropdownMenuRadioItem key={v} value={v}>
                    {sortLabel(v)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse bg-muted/60" />
          ))}
        </div>
      ) : renderable === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border px-8 py-16 text-center">
          <CalendarDaysIcon className="size-8 text-muted-foreground/40" aria-hidden />
          <p
            className="mx-auto mt-3 max-w-sm text-lg text-foreground/60"
            style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
          >
            {filtersActive
              ? t("discovery.noMatches")
              : tab === "mine"
                ? t("discovery.emptyMine")
                : tab === "enrolled"
                  ? t("discovery.emptyEnrolled")
                  : t("discovery.empty")}
          </p>
          {filtersActive ? (
            <button
              onClick={() => setTypeFilter("all")}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t("discovery.clearFilters")}
            </button>
          ) : sessionDid && tab !== "enrolled" ? (
            <Link href="/events/new" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              + {t("discovery.createFirst")}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {live.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("discovery.happeningNow")}
              </h2>
              <ul className="divide-y divide-border">
                {live.map((e) => (
                  <EventCard key={e.uri} event={e} host={profiles.get(e.did)} live liveLabel={t("detail.live")} />
                ))}
              </ul>
            </section>
          ) : null}
          {upcoming.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("discovery.upcoming")}
              </h2>
              <ul className="divide-y divide-border">
                {upcoming.map((e) => (
                  <EventCard key={e.uri} event={e} host={profiles.get(e.did)} />
                ))}
              </ul>
            </section>
          ) : null}
          {past.length && tab !== "all" ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("discovery.past")}
              </h2>
              <ul className="divide-y divide-border">
                {past.map((e) => (
                  <EventCard key={e.uri} event={e} host={profiles.get(e.did)} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
