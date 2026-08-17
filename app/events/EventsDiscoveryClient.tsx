"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAccountList } from "@/app/_lib/account-switcher";
import { listLatestPdsRecords, parseAtUri } from "@/app/_lib/pds";
import {
  EVENT_DISCOVERY_SEED_DIDS,
  bucketForEvent,
  getEvent,
  listEventsForDids,
  listRsvpsForDid,
  resolveProfiles,
  sortByStartAsc,
  type CommunityEvent,
  type ProfileLite,
} from "@/app/_lib/events";
import { cn } from "@/lib/utils";
import { EventCard } from "./EventCard";

type Tab = "all" | "mine";

async function readFollows(did: string, signal?: AbortSignal): Promise<string[]> {
  const records = await listLatestPdsRecords(did, "app.bsky.graph.follow", 100, signal).catch(() => []);
  const dids: string[] = [];
  for (const record of records) {
    const subject = record.value.subject;
    if (typeof subject === "string" && subject.startsWith("did:")) dids.push(subject);
  }
  return dids;
}

export function EventsDiscoveryClient({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("events");
  const { groups } = useAccountList(sessionDid);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [myUris, setMyUris] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  const orgDids = useMemo(() => groups.map((g) => g.groupDid), [groups]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let cancelled = false;

    async function run() {
      setLoading(true);
      const hostDids = new Set<string>(EVENT_DISCOVERY_SEED_DIDS);
      const mine = new Set<string>();

      if (sessionDid) {
        hostDids.add(sessionDid);
        for (const did of orgDids) hostDids.add(did);
        const follows = await readFollows(sessionDid, signal);
        for (const did of follows) hostDids.add(did);
      }

      // Events hosted by any source repo.
      const hosted = await listEventsForDids(Array.from(hostDids), signal).catch(() => []);
      const byUri = new Map<string, CommunityEvent>();
      for (const e of hosted) byUri.set(e.uri, e);

      // My own hosted events are "mine".
      for (const e of hosted) {
        if (sessionDid && (e.did === sessionDid || orgDids.includes(e.did))) mine.add(e.uri);
      }

      // Events I've RSVP'd to (fetch each subject event, even if not in the host set).
      if (sessionDid) {
        const rsvps = await listRsvpsForDid(sessionDid, signal).catch(() => []);
        const active = rsvps.filter((r) => r.status !== "notgoing");
        const fetched = await Promise.all(
          active.map(async (r) => {
            mine.add(r.subjectUri);
            if (byUri.has(r.subjectUri)) return null;
            const parts = parseAtUri(r.subjectUri);
            if (!parts) return null;
            return getEvent(parts.did, parts.rkey, signal).catch(() => null);
          }),
        );
        for (const e of fetched) if (e) byUri.set(e.uri, e);
      }

      const all = Array.from(byUri.values()).sort(sortByStartAsc);
      const hostProfiles = await resolveProfiles(
        all.map((e) => e.did),
        signal,
      ).catch(() => new Map<string, ProfileLite>());

      if (cancelled) return;
      setEvents(all);
      setProfiles(hostProfiles);
      setMyUris(mine);
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionDid, orgDids]);

  const visible = tab === "mine" ? events.filter((e) => myUris.has(e.uri)) : events;
  const now = Date.now();
  const live = visible.filter((e) => bucketForEvent(e, now) === "live");
  const upcoming = visible.filter((e) => bucketForEvent(e, now) === "upcoming");

  return (
    <div className="flex flex-col gap-6">
      {sessionDid ? (
        <div className="inline-flex w-fit rounded-full border border-border p-1">
          {(["all", "mine"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "all" ? t("discovery.tabAll") : t("discovery.tabMine")}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">{tab === "mine" ? t("discovery.emptyMine") : t("discovery.empty")}</p>
          {sessionDid ? (
            <Link href="/events/new" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
              {t("discovery.createFirst")}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {live.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">{t("discovery.happeningNow")}</h2>
              {live.map((e) => (
                <EventCard key={e.uri} event={e} host={profiles.get(e.did)} live liveLabel={t("detail.live")} />
              ))}
            </section>
          ) : null}
          {upcoming.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">{t("discovery.upcoming")}</h2>
              {upcoming.map((e) => (
                <EventCard key={e.uri} event={e} host={profiles.get(e.did)} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
