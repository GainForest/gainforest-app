"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUpRightIcon,
  BinocularsIcon,
  Building2Icon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  Loader2Icon,
  MegaphoneIcon,
  NewspaperIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { ActivityFeedItem, ActivityFeedKind, ActivityFeedPage } from "../_lib/feed";
import { indexerQuery } from "../_lib/indexer";
import { resolveBlobUrl } from "../_lib/pds";
import {
  FeedActionBar,
  FeedComposer,
  LocalPostsList,
  useFeedInteractions,
  type FeedInteractions,
} from "./FeedActions";
import { formatCompact, formatCompactUsd, formatRelative } from "../_lib/format";
import { ResolvedAvatar } from "./ResolvedAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Filter = "all" | ActivityFeedKind;

// A run of this many consecutive sightings from the same account collapses into
// one summary card instead of N separate rows.
const MIN_BATCH = 3;
// How many sample thumbnails the summary card shows.
const MAX_THUMBS = 4;

/** One rendered slot: a normal row, or a collapsed run of same-owner sightings. */
type FeedEntry =
  | { type: "single"; item: ActivityFeedItem }
  | { type: "batch"; items: ActivityFeedItem[] };

/** Collapse maximal runs of >= MIN_BATCH consecutive observations by the same
 *  account (adjacent in the newest-first timeline) into one batch entry. Every
 *  other row passes through unchanged. */
function groupFeedEntries(items: ActivityFeedItem[]): FeedEntry[] {
  const entries: FeedEntry[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.kind === "observation" && item.actorDid) {
      let j = i + 1;
      while (j < items.length && items[j].kind === "observation" && items[j].actorDid === item.actorDid) j += 1;
      const run = items.slice(i, j);
      if (run.length >= MIN_BATCH) {
        entries.push({ type: "batch", items: run });
        i = j;
        continue;
      }
    }
    entries.push({ type: "single", item });
    i += 1;
  }
  return entries;
}

const FILTERS: { key: Filter; Icon: typeof NewspaperIcon }[] = [
  { key: "all", Icon: NewspaperIcon },
  { key: "post", Icon: MegaphoneIcon },
  { key: "project", Icon: FolderKanbanIcon },
  { key: "observation", Icon: BinocularsIcon },
  { key: "organization", Icon: Building2Icon },
  { key: "donation", Icon: HeartHandshakeIcon },
];

export function FeedClient({
  initialItems,
  initialCursor,
  initialHasMore,
  signedIn,
  viewerDid,
}: {
  initialItems: ActivityFeedItem[];
  initialCursor: string | null;
  initialHasMore: boolean;
  signedIn: boolean;
  viewerDid: string | null;
}) {
  const t = useTranslations("common.feed");
  const interactions = useFeedInteractions(viewerDid);
  const [items, setItems] = useState<ActivityFeedItem[]>(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(initialItems.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // Bumped on every first-page request (filter switch / refresh) so an in-flight
  // load-more from a previous filter can't append stale rows.
  const reqRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  function feedUrl(forFilter: Filter, forCursor?: string | null): string {
    const params = new URLSearchParams();
    if (forFilter !== "all") params.set("kind", forFilter);
    if (forCursor) params.set("cursor", forCursor);
    const qs = params.toString();
    return qs ? `/api/feed?${qs}` : "/api/feed";
  }

  // Load the first page for a filter (initial load, filter switch, refresh).
  const loadFirst = useCallback(async (forFilter: Filter, mode: "load" | "refresh") => {
    const seq = ++reqRef.current;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const res = await fetch(feedUrl(forFilter), { cache: "no-store" });
      if (!res.ok) throw new Error("feed fetch failed");
      const data = (await res.json()) as ActivityFeedPage;
      if (seq !== reqRef.current) return; // a newer request superseded this one
      setItems(data.items ?? []);
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch {
      if (seq === reqRef.current) setError(true);
    } finally {
      if (seq === reqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Append the next page for the current filter, de-duping by id.
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    const seq = reqRef.current;
    setLoadingMore(true);
    try {
      const res = await fetch(feedUrl(filter, cursor), { cache: "no-store" });
      if (!res.ok) throw new Error("feed fetch failed");
      const data = (await res.json()) as ActivityFeedPage;
      if (seq !== reqRef.current) return; // filter changed mid-flight — drop it
      setItems((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...(data.items ?? []).filter((row) => !seen.has(row.id))];
      });
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch {
      // Keep what we have; the user can retry by scrolling / clicking again.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filter, hasMore, loadingMore]);

  function selectFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    setItems([]);
    setCursor(null);
    setHasMore(false);
    void loadFirst(next, "load");
  }

  // If the server prefetched nothing (e.g. first deploy), fetch client-side.
  useEffect(() => {
    if (initialItems.length === 0) void loadFirst("all", "load");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a stable ref to the latest loadMore so the observer below isn't torn
  // down and recreated on every page load (which would re-fire immediately
  // while the sentinel stays in view — a runaway cascade once a big sightings
  // burst collapses the list to a short height).
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  // Recreated only when the sentinel mounts/unmounts (hasMore), so a load that
  // leaves the sentinel on-screen waits for a real scroll before firing again.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreRef.current();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  const entries = useMemo(() => groupFeedEntries(items), [items]);

  // Pull like + comment engagement for the loaded rows from the indexer.
  const { loadEngagement } = interactions;
  useEffect(() => {
    if (items.length > 0) loadEngagement(items.map((it) => it.id));
  }, [items, loadEngagement]);

  // A just-posted update shows optimistically until the indexer surfaces it as a
  // real feed row (same AT-URI), at which point we drop the optimistic card.
  const itemIds = useMemo(() => new Set(items.map((it) => it.id)), [items]);
  const pendingPosts = useMemo(
    () => interactions.localPosts.filter((p) => !itemIds.has(p.id)),
    [interactions.localPosts, itemIds],
  );

  return (
    <section className="-mt-14 pb-24 md:pb-32">
      {/* Hero */}
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-primary/8 via-primary/2 to-transparent" />
        <div className="mx-auto flex max-w-3xl flex-col px-6 pb-6 pt-[72px] sm:px-8 animate-in">
          <div className="flex items-center gap-2 text-primary/70">
            <NewspaperIcon className="size-5" />
            <span className="text-xs font-medium uppercase tracking-[0.16em]">{t("eyebrow")}</span>
          </div>
          <h1
            className="mt-3 text-4xl font-light leading-[0.98] tracking-[-0.035em] text-foreground sm:text-5xl"
            style={{ fontFamily: "var(--font-garamond-var)" }}
          >
            {t("hero.title")}{" "}
            <span style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}>
              {t("hero.accent")}
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">{t("hero.description")}</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Sticky filter bar — full-bleed within the column with a solid,
            blurred backdrop + bottom border so rows scroll cleanly beneath it
            instead of peeking around a floating pill. */}
        <div className="sticky top-14 z-20 -mx-4 mb-3 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6">
          <div className="flex items-center gap-2 px-4 py-2 sm:px-6">
            <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
              {FILTERS.map(({ key, Icon }) => {
                const active = filter === key;
                const label = key === "all" ? t("filters.all") : t(`filters.${key}`);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectFilter(key)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void loadFirst(filter, "refresh")}
              disabled={refreshing || loading}
              aria-label={t("refresh")}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCwIcon className={cn("size-4", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        <FeedComposer signedIn={signedIn} viewerDid={viewerDid} onPost={interactions.addPost} />

        <LocalPostsList posts={pendingPosts} viewerDid={viewerDid} />

        {/* Timeline */}
        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">{t("error")}</p>
            <button
              type="button"
              onClick={() => void loadFirst(filter, "load")}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {filter === "all" ? t("empty") : t("emptyFiltered")}
            </p>
          </div>
        ) : (
          <>
            <ol className="relative divide-y divide-border/50">
              {entries.map((entry) =>
                entry.type === "batch" ? (
                  <ObservationBatchCard key={`batch:${entry.items[0].id}`} items={entry.items} />
                ) : (
                  <FeedRow
                    key={entry.item.id}
                    item={entry.item}
                    signedIn={signedIn}
                    interactions={interactions}
                  />
                ),
              )}
            </ol>

            {/* Load more — auto-triggers via the sentinel, with a manual
                fallback button for keyboard users / when the observer misses. */}
            <div className="py-6">
              {hasMore ? (
                <>
                  <div ref={sentinelRef} aria-hidden className="h-px" />
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      {loadingMore ? <Loader2Icon className="size-4 animate-spin" /> : null}
                      {loadingMore ? t("loadingMore") : t("loadMore")}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-center text-xs text-muted-foreground">{t("endOfFeed")}</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FeedRow({
  item,
  signedIn,
  interactions,
}: {
  item: ActivityFeedItem;
  signedIn: boolean;
  interactions: FeedInteractions;
}) {
  const t = useTranslations("common.feed");
  const verb = t(`verbs.${item.kind}`);

  return (
    <li className="relative">
      <Link
        href={item.href}
        className="group flex gap-3 rounded-2xl px-3 pb-1.5 pt-3.5 transition-colors hover:bg-muted/40"
      >
        {/* Avatar */}
        <FeedAvatar item={item} />

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Author line */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="truncate font-medium text-foreground">
              {item.actorName || item.actorDid ? item.actorName ?? shortDid(item.actorDid) : t("anonymous")}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span className="shrink-0 text-xs text-muted-foreground/80" title={fullDate(item.createdAt)}>
              {formatRelative(item.createdAt)}
            </span>
          </div>

          {/* Verb line */}
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <KindIcon kind={item.kind} className="size-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{verb}</span>
          </p>

          {/* Headline */}
          {item.title ? (
            <p className="mt-1.5 line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
              {item.title}
            </p>
          ) : null}

          {/* Body text */}
          {item.text ? (
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          ) : null}

          {/* Donation target line */}
          {item.kind === "donation" && item.targetTitle ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {t("to")}: <span className="text-foreground/80">{item.targetTitle}</span>
            </p>
          ) : null}

          {/* Cover image */}
          {hasImage(item) ? (
            <div className="relative mt-2 overflow-hidden rounded-xl border border-border/60">
              <FeedImage item={item} />
            </div>
          ) : null}
        </div>

        {/* Donation amount pill */}
        {item.kind === "donation" && item.amount != null ? (
          <span className="ml-auto mt-0.5 inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums">
            {item.currency === "USD" ? formatCompactUsd(item.amount) : `${item.amount} ${item.currency}`}
          </span>
        ) : null}
      </Link>

      {/* Like + comment, aligned under the row content (outside the link). */}
      <div className="pb-2 pl-16 pr-3">
        <FeedActionBar subjectUri={item.id} signedIn={signedIn} interactions={interactions} />
      </div>
    </li>
  );
}

/** Collapsed summary for a run of consecutive sightings from one account:
 *  identity + count, a sample image montage, and a link to all of them. */
// The account's all-time sighting total — the right headline number for a
// burst card — fetched once per org with a cheap `totalCount` query (not by
// paging through thousands of records). Cached for the session.
const orgSightingTotalCache = new Map<string, number>();
const ORG_SIGHTING_TOTAL_QUERY = `
  query OrgSightingTotal($did: String!) {
    appGainforestDwcOccurrence(first: 0, where: { did: { eq: $did } }) { totalCount }
  }
`;

function useOrgSightingTotal(did: string | null, fallback: number): number {
  const [total, setTotal] = useState<number | null>(() => (did ? orgSightingTotalCache.get(did) ?? null : null));

  useEffect(() => {
    if (!did) return;
    const cached = orgSightingTotalCache.get(did);
    if (cached != null) {
      setTotal(cached);
      return;
    }
    const controller = new AbortController();
    indexerQuery<{ appGainforestDwcOccurrence?: { totalCount?: number | null } }>(
      ORG_SIGHTING_TOTAL_QUERY,
      { did },
      controller.signal,
    )
      .then((data) => {
        const n = data?.appGainforestDwcOccurrence?.totalCount;
        if (typeof n === "number") {
          orgSightingTotalCache.set(did, n);
          setTotal(n);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [did]);

  // Use the true total once known; until then show the loaded run length.
  return total != null ? Math.max(total, fallback) : fallback;
}

function ObservationBatchCard({ items }: { items: ActivityFeedItem[] }) {
  const t = useTranslations("common.feed");
  const head = items[0]; // newest in the run
  const actorName = head.actorName || (head.actorDid ? shortDid(head.actorDid) : t("anonymous"));

  // The real count comes from the org's sighting total, so a burst that is only
  // partially loaded still reads "shared 2,143 nature sightings", not the
  // loaded slice.
  const count = useOrgSightingTotal(head.actorDid || null, items.length);

  const withImages = items.filter((it) => hasImage(it));
  const thumbs = withImages.slice(0, MAX_THUMBS);
  const remaining = count - thumbs.length;

  // A short, de-duped species line ("Jaguar · Scarlet Macaw · +6 more"),
  // skipping junk titles (blank, single-char, or purely numeric source names).
  const species = Array.from(
    new Set(
      items
        .map((it) => it.title?.trim())
        .filter((s): s is string => Boolean(s) && s!.length >= 2 && !/^\d+$/.test(s!)),
    ),
  );
  const shownSpecies = species.slice(0, 3);
  const moreSpecies = species.length - shownSpecies.length;

  const href = head.actorDid ? `/observations?by=${encodeURIComponent(head.actorDid)}` : "/observations";

  return (
    <li className="relative">
      <Link href={href} className="group flex gap-3 rounded-2xl px-3 py-3.5 transition-colors hover:bg-muted/40">
        <FeedAvatar item={head} />

        <div className="min-w-0 flex-1">
          {/* Author line */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="truncate font-medium text-foreground">{actorName}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="shrink-0 text-xs text-muted-foreground/80" title={fullDate(head.createdAt)}>
              {formatRelative(head.createdAt)}
            </span>
          </div>

          {/* Verb line with the count */}
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <BinocularsIcon className="size-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{t("batch.sightings", { count })}</span>
          </p>

          {/* Species summary */}
          {shownSpecies.length > 0 ? (
            <p className="mt-1.5 line-clamp-1 text-[15px] font-medium leading-snug text-foreground">
              {shownSpecies.join(" · ")}
              {moreSpecies > 0 ? (
                <span className="text-muted-foreground">{" · "}{t("batch.moreSpecies", { count: moreSpecies })}</span>
              ) : null}
            </p>
          ) : null}

          {/* Image montage */}
          {thumbs.length > 0 ? (
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:gap-2">
              {thumbs.map((it, idx) => (
                <ObservationThumb
                  key={it.id}
                  item={it}
                  overlay={idx === thumbs.length - 1 && remaining > 0 ? `+${formatCompact(remaining)}` : null}
                />
              ))}
            </div>
          ) : null}

          {/* View-all affordance */}
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
            {t("batch.viewAll")}
            <ArrowUpRightIcon className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}

/** Square thumbnail for one sighting in a batch montage, with an optional
 *  "+N" overlay on the final tile to signal the rest of the run. */
function ObservationThumb({ item, overlay }: { item: ActivityFeedItem; overlay: string | null }) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    setResolved(null);
    if (item.imageUrl || !item.actorDid || !item.imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(item.actorDid, item.imageRef, controller.signal)
      .then((url) => setResolved(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolved(null);
      });
    return () => controller.abort();
  }, [item.actorDid, item.imageRef, item.imageUrl]);

  const src = item.imageUrl ?? resolved;

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted">
      {src ? <Image src={src} alt="" fill unoptimized sizes="140px" className="object-cover" /> : null}
      {overlay ? (
        <div className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
          {overlay}
        </div>
      ) : null}
    </div>
  );
}

function FeedAvatar({ item }: { item: ActivityFeedItem }) {
  // Show the actor's profile avatar (or their initials), falling back to a
  // kind glyph only for anonymous rows. The cover image is rendered separately
  // below the text, so it never doubles as the avatar.
  const hasName = Boolean(item.actorName?.trim());
  return (
    <ResolvedAvatar
      did={item.actorDid}
      avatarRef={item.actorAvatarRef}
      name={item.actorName}
      fallbackIcon={hasName ? undefined : <KindIcon kind={item.kind} className="size-4" />}
      className="mt-0.5 size-10"
      sizes="40px"
    />
  );
}

function FeedImage({ item }: { item: ActivityFeedItem }) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    setResolved(null);
    if (item.imageUrl || !item.actorDid || !item.imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(item.actorDid, item.imageRef, controller.signal)
      .then((url) => setResolved(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolved(null);
      });
    return () => controller.abort();
  }, [item.actorDid, item.imageRef, item.imageUrl]);

  const src = item.imageUrl ?? resolved;
  if (!src) return null;

  return (
    <div className="relative aspect-[16/9] w-full bg-muted">
      <Image src={src} alt="" fill unoptimized sizes="(max-width: 672px) 100vw, 608px" className="object-cover" />
    </div>
  );
}

function hasImage(item: ActivityFeedItem): boolean {
  return Boolean(item.imageUrl || (item.actorDid && item.imageRef));
}

function KindIcon({ kind, className }: { kind: ActivityFeedKind; className?: string }) {
  switch (kind) {
    case "project":
      return <FolderKanbanIcon className={className} />;
    case "observation":
      return <BinocularsIcon className={className} />;
    case "organization":
      return <Building2Icon className={className} />;
    case "donation":
      return <HeartHandshakeIcon className={className} />;
    case "post":
      return <MegaphoneIcon className={className} />;
  }
}

function FeedSkeleton() {
  return (
    <ol className="relative">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl px-3 py-3.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3.5 w-1/3 rounded-full" />
            <Skeleton className="h-3 w-1/4 rounded-full" />
            <Skeleton className="h-4 w-4/5 rounded-full" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </div>
        </li>
      ))}
    </ol>
  );
}

function shortDid(did: string): string {
  if (!did) return "";
  return did.length > 18 ? `${did.slice(0, 10)}…${did.slice(-4)}` : did;
}

function fullDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}
