"use client";

/**
 * The record stream on an account's Overview: everything this account has
 * published, newest first — projects, nature sightings, updates, and the
 * organization record itself.
 *
 * Rows come from the shared activity-feed reader (`/api/feed?scope=account`), so
 * a row here describes the same record the same way the global feed does. The
 * layout is deliberately quieter than the global feed: a relative date in the
 * left gutter, a headline, a short line of context, and up to a few photos.
 * Consecutive sightings uploaded together collapse into one row so a single
 * field trip doesn't flood the profile.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { ActivityFeedItem } from "@/app/_lib/feed";
import { isPdsBlobUrl, resolveBlobUrl } from "@/app/_lib/pds";
import { AutoLoadMoreButton } from "@/app/_components/AutoLoadMoreButton";

/** Sightings uploaded within this window of each other read as one upload. */
const MAX_BATCH_GAP_MS = 12 * 60 * 60 * 1000;
/** Fewer than this many in a row stay separate, readable entries. */
const MIN_BATCH = 3;
/** How many photos a row shows. */
const MAX_THUMBS = 3;

type FeedRow =
  | { type: "single"; key: string; item: ActivityFeedItem }
  | { type: "batch"; key: string; items: ActivityFeedItem[] };

function timeOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

/** Collapse runs of >= MIN_BATCH sightings uploaded close together into one row. */
function groupRows(items: ActivityFeedItem[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    if (item.kind === "observation") {
      let end = index + 1;
      while (
        end < items.length &&
        items[end].kind === "observation" &&
        Math.abs(timeOf(items[end - 1].createdAt) - timeOf(items[end].createdAt)) <= MAX_BATCH_GAP_MS
      ) {
        end += 1;
      }
      const run = items.slice(index, end);
      if (run.length >= MIN_BATCH) {
        rows.push({ type: "batch", key: `batch-${run[0].id}`, items: run });
        index = end;
        continue;
      }
    }
    rows.push({ type: "single", key: item.id, item });
    index += 1;
  }
  return rows;
}

export function AccountActivityFeed({ did }: { did: string }) {
  const t = useTranslations("common.accountOverview");
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  const loadMore = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ scope: "account", did });
      if (cursorRef.current) params.set("cursor", cursorRef.current);
      const response = await fetch(`/api/feed?${params.toString()}`);
      if (!response.ok) throw new Error("feed request failed");
      const page = (await response.json()) as { items: ActivityFeedItem[]; nextCursor: string | null; hasMore: boolean };
      cursorRef.current = page.nextCursor;
      setItems((previous) => {
        const merged = previous.slice();
        for (const item of page.items) {
          if (seenRef.current.has(item.id)) continue;
          seenRef.current.add(item.id);
          merged.push(item);
        }
        return merged;
      });
      setHasMore(Boolean(page.hasMore && page.nextCursor));
    } catch {
      setHasMore(false);
      setFailed(true);
    } finally {
      busyRef.current = false;
      setLoading(false);
      setLoaded(true);
    }
  }, [did]);

  useEffect(() => {
    void loadMore();
  }, [loadMore]);

  if (!loaded) return <ActivityFeedSkeleton />;

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {failed ? t("recordsError") : t("recordsEmpty")}
      </p>
    );
  }

  const rows = groupRows(items);

  return (
    <div>
      {/* No rule on top: the section that owns this stream already draws one
          above its heading, and two hairlines a heading apart read as noise. */}
      <ul className="divide-y divide-border/40">
        {rows.map((row) => (
          <li key={row.key} className="py-5">
            {row.type === "batch" ? <BatchRow items={row.items} /> : <SingleRow item={row.item} />}
          </li>
        ))}
      </ul>
      <div className="mt-6 text-center">
        <AutoLoadMoreButton
          hasMore={hasMore}
          loading={loading}
          onLoadMore={() => void loadMore()}
          idleLabel={t("loadMoreRecords")}
          endLabel=""
          className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        />
      </div>
    </div>
  );
}

/** Shared row scaffold: relative date + kind in the gutter, content beside it. */
function Row({
  createdAt,
  kindLabel,
  children,
  aside,
}: {
  createdAt: string;
  kindLabel: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const format = useFormatter();
  // One shared "now" for every row, so the whole stream reads from the same
  // moment (and server/client agree).
  const now = useNow();
  const date = new Date(createdAt);
  const valid = !Number.isNaN(date.getTime());

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-6">
      <div className="sm:w-28 sm:shrink-0 sm:pt-0.5">
        {valid ? (
          <time dateTime={date.toISOString()} className="block text-sm text-muted-foreground">
            {format.relativeTime(date, now)}
          </time>
        ) : null}
        <span className="hidden text-xs text-muted-foreground/70 sm:mt-0.5 sm:block">{kindLabel}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        {aside}
      </div>
    </div>
  );
}

function SingleRow({ item }: { item: ActivityFeedItem }) {
  const t = useTranslations("common.accountOverview");
  const kindLabel = t(`recordKind.${item.kind}`);
  const headline = item.title?.trim() ?? "";
  const thumbs = [item].filter((entry) => entry.imageUrl || entry.imageRef);

  // An update has no title — its own words are the row, so they read as the
  // headline instead of being repeated under a generic one.
  if (!headline && item.text) {
    return (
      <Row createdAt={item.createdAt} kindLabel={kindLabel}>
        <Link
          href={item.href}
          className="block whitespace-pre-line text-[15px] leading-relaxed text-foreground hover:underline"
        >
          {item.text}
        </Link>
        {thumbs.length > 0 ? <Thumbs items={thumbs} /> : null}
      </Row>
    );
  }

  return (
    <Row createdAt={item.createdAt} kindLabel={kindLabel}>
      <Link href={item.href} className="block font-medium leading-snug text-foreground hover:underline">
        {headline || kindLabel}
      </Link>
      {item.text ? (
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {item.text}
        </p>
      ) : null}
      {thumbs.length > 0 ? <Thumbs items={thumbs} /> : null}
    </Row>
  );
}

function BatchRow({ items }: { items: ActivityFeedItem[] }) {
  const t = useTranslations("common.accountOverview");
  const first = items[0];
  // Server-collapsed runs stamp the real run size on their sampled rows.
  const stamped = items.reduce((max, item) => Math.max(max, item.burstCount ?? 0), 0);
  const count = stamped > 0 ? items.filter((item) => item.burstCount == null).length + stamped : items.length;
  const note = items.find((item) => item.observationBatchNote?.trim())?.observationBatchNote?.trim() ?? null;
  const species = [...new Set(items.map((item) => item.title?.trim()).filter((title): title is string => Boolean(title)))];
  const summary = note ?? (species.length > 0 ? species.slice(0, 4).join(", ") : null);
  const thumbs = items.filter((item) => item.imageUrl || item.imageRef);

  return (
    <Row createdAt={first.createdAt} kindLabel={t("recordKind.observation")}>
      <Link href={first.href} className="block font-medium leading-snug text-foreground hover:underline">
        {t("recordBatch", { count })}
      </Link>
      {summary ? (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{summary}</p>
      ) : null}
      {thumbs.length > 0 ? <Thumbs items={thumbs} /> : null}
    </Row>
  );
}

function Thumbs({ items }: { items: ActivityFeedItem[] }) {
  const shown = items.slice(0, MAX_THUMBS);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {shown.map((item) => (
        <Thumb key={`thumb-${item.id}`} item={item} />
      ))}
    </div>
  );
}

/** One photo. PDS blobs arrive as a ref and are resolved in the browser. */
function Thumb({ item }: { item: ActivityFeedItem }) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setResolved(null);
    setFailed(false);
    if (item.imageUrl || !item.imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(item.actorDid, item.imageRef, controller.signal)
      .then((url) => setResolved(url))
      .catch(() => undefined);
    return () => controller.abort();
  }, [item.actorDid, item.imageRef, item.imageUrl]);

  const src = item.imageUrl ?? resolved;
  if (!src || failed) return null;

  return (
    <Link
      href={item.href}
      className="relative block h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/50 transition-opacity hover:opacity-90"
    >
      <Image
        src={src}
        alt=""
        fill
        sizes="96px"
        unoptimized={!isPdsBlobUrl(src)}
        onError={() => setFailed(true)}
        className="object-cover"
      />
    </Link>
  );
}

function ActivityFeedSkeleton() {
  return (
    <ul className="divide-y divide-border/40">
      {Array.from({ length: 4 }).map((_, index) => (
        <li key={index} className="flex flex-col gap-1.5 py-5 sm:flex-row sm:gap-6">
          <span className="skeleton h-4 w-20 rounded sm:shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <span className="skeleton block h-4 w-2/3 rounded" />
            <span className="skeleton block h-3 w-1/2 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}
